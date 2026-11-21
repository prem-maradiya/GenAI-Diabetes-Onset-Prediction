"""Flask backend for the Diabetes Onset Prediction demo.

Serves the single-page dashboard plus a small JSON API:

    GET  /                      the dashboard
    GET  /api/results           every number produced by the pipeline
    GET  /api/model-card        the Step-5 ethics artefact
    GET  /api/patient/random    a real held-out patient (with the true label)
    POST /api/predict           score one patient, with exact TreeSHAP contributions
    POST /api/explain           generative layer: SHAP -> LLM -> plain-language summary
    GET  /api/llm-status        whether an LLM key is configured (never reveals the key)
    GET  /health                readiness probe

Run:  python app/app.py   ->  http://127.0.0.1:5000
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

os.environ.setdefault("LOKY_MAX_CPU_COUNT", str(os.cpu_count() or 4))

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

import joblib
import numpy as np
import pandas as pd
from flask import Flask, jsonify, render_template, request, send_from_directory

from config import (
    CLINICAL_RANGES, FEATURE_META, FEATURES, LLM_MODEL, METRICS_PATH, MODEL_CARD_PATH, MODEL_PATH,
)
from data_loader import load_raw
from genai_explain import explain_patient, llm_available, shap_contributions
from train import make_split

app = Flask(__name__, static_folder="static", template_folder="templates")
app.json.sort_keys = False


# --------------------------------------------------------------------------- #
# Load once at start-up
# --------------------------------------------------------------------------- #
def _load_state():
    if not MODEL_PATH.exists():
        raise SystemExit(
            "Model not found. Run the pipeline first:\n\n    python src/pipeline.py\n"
        )
    bundle = joblib.load(MODEL_PATH)
    results = json.loads(METRICS_PATH.read_text(encoding="utf-8"))
    card = json.loads(MODEL_CARD_PATH.read_text(encoding="utf-8"))

    # The untouched test split, so the demo can score patients the model
    # genuinely never saw and show the true answer beside the prediction.
    _, X_test, _, y_test = make_split(load_raw())
    holdout = X_test.copy()
    holdout["Outcome"] = y_test.values
    return bundle, results, card, holdout


BUNDLE, RESULTS, MODEL_CARD, HOLDOUT = _load_state()
PIPELINE = BUNDLE["pipeline"]
THRESHOLD = float(BUNDLE["threshold"])
MEDIANS = BUNDLE["medians"]
MODEL_NAME = BUNDLE["model_name"]


def risk_band(probability: float, threshold: float) -> dict:
    """Three plain-language bands anchored on the deployed threshold."""
    if probability >= min(0.65, threshold + 0.30):
        return {
            "band": "High risk",
            "tone": "critical",
            "action": "Refer for a confirmatory fasting glucose / HbA1c test now.",
        }
    if probability >= threshold:
        return {
            "band": "Elevated risk",
            "tone": "warning",
            "action": "Flag for a confirmatory test - this is the recall-first catch zone.",
        }
    if probability >= threshold * 0.6:
        return {
            "band": "Borderline",
            "tone": "serious",
            "action": "Below the cut-off, but close. Re-screen in 12 months.",
        }
    return {
        "band": "Low risk",
        "tone": "good",
        "action": "Routine screening interval. Not a clearance - the model can be wrong.",
    }


def coerce_patient(payload: dict) -> dict:
    """Validate and clamp an incoming patient record to the documented ranges."""
    patient, errors = {}, []
    for feature in FEATURES:
        meta = FEATURE_META[feature]
        raw = payload.get(feature, meta["default"])
        try:
            value = float(raw)
        except (TypeError, ValueError):
            errors.append(f"{feature}: '{raw}' is not a number")
            value = float(meta["default"])
        if not np.isfinite(value):
            errors.append(f"{feature}: value must be finite")
            value = float(meta["default"])
        clamped = float(np.clip(value, meta["min"], meta["max"]))
        if clamped != value:
            errors.append(
                f"{feature}: {value:g} outside {meta['min']}-{meta['max']}, clamped to {clamped:g}"
            )
        patient[feature] = clamped
    return patient, errors


# --------------------------------------------------------------------------- #
# Routes
# --------------------------------------------------------------------------- #
@app.route("/")
def index():
    return render_template("index.html", model_name=MODEL_NAME, threshold=THRESHOLD)


@app.route("/api/results")
def api_results():
    return jsonify({**RESULTS, "clinical_ranges": CLINICAL_RANGES})


@app.route("/api/model-card")
def api_model_card():
    return jsonify(MODEL_CARD)


@app.route("/api/patient/random")
def api_random_patient():
    """A real held-out patient, with the ground truth, for an honest live demo."""
    row = HOLDOUT.sample(1).iloc[0]
    patient = {f: (None if pd.isna(row[f]) else round(float(row[f]), 2)) for f in FEATURES}
    # Missing values in the source row are shown as the population median, the
    # same value the deployed imputer would substitute.
    filled = {f: (MEDIANS[f] if patient[f] is None else patient[f]) for f in FEATURES}
    return jsonify(
        {
            "patient": {f: round(float(v), 2) for f, v in filled.items()},
            "had_missing": [f for f in FEATURES if patient[f] is None],
            "true_outcome": int(row["Outcome"]),
        }
    )


@app.route("/api/predict", methods=["POST"])
def api_predict():
    payload = request.get_json(silent=True) or {}
    patient, warnings = coerce_patient(payload)
    threshold = float(payload.get("threshold", THRESHOLD))
    threshold = float(np.clip(threshold, 0.05, 0.95))

    shap_result = shap_contributions(PIPELINE, patient)
    probability = shap_result["probability"]
    band = risk_band(probability, threshold)

    return jsonify(
        {
            "probability": round(probability, 4),
            "percent": round(probability * 100, 1),
            "threshold": round(threshold, 3),
            "flagged": bool(probability >= threshold),
            "decision": "FLAG for confirmatory test" if probability >= threshold else "No flag",
            "model": MODEL_NAME,
            "contributions": shap_result["contributions"],
            "base_value": shap_result["base_value"],
            "explainer": "TreeSHAP (exact for tree ensembles)",
            "patient": patient,
            "warnings": warnings,
            **band,
        }
    )


@app.route("/api/explain", methods=["POST"])
def api_explain():
    """The generative layer. Called on demand (a button), never per slider tick."""
    payload = request.get_json(silent=True) or {}
    patient, warnings = coerce_patient(payload)
    threshold = float(np.clip(float(payload.get("threshold", THRESHOLD)), 0.05, 0.95))
    probability = float(PIPELINE.predict_proba(pd.DataFrame([patient])[FEATURES])[0, 1])
    band = risk_band(probability, threshold)
    use_llm = bool(payload.get("use_llm", True))
    result = explain_patient(PIPELINE, patient, threshold, band, use_llm=use_llm)
    result["warnings"] = warnings
    return jsonify(result)


@app.route("/api/llm-status")
def api_llm_status():
    return jsonify({"available": llm_available(), "model": LLM_MODEL})


@app.route("/health")
def health():
    return jsonify({"status": "ok", "model": MODEL_NAME, "threshold": THRESHOLD})


@app.route("/figures/<path:filename>")
def figures(filename):
    """Serve the generated report figures straight from reports/figures."""
    return send_from_directory(ROOT / "reports" / "figures", filename)


if __name__ == "__main__":
    print(f"\n  Diabetes Onset Prediction - {MODEL_NAME} @ threshold {THRESHOLD}")
    print("  Dashboard:  http://127.0.0.1:5000\n")
    app.run(host="127.0.0.1", port=5000, debug=False)
