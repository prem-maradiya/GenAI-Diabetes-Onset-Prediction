"""Regression tests for the claims the jury will hear.

Run:  python -m pytest -q
Every test runs offline: the LLM layer is forced onto its template fallback.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "app"))
os.environ["DIABETES_LLM_DISABLED"] = "1"

from config import FEATURES, IMPOSSIBLE_ZERO_COLUMNS, METRICS_PATH, MODEL_PATH, clinical_band  # noqa: E402
from preprocess import mark_missing  # noqa: E402


@pytest.fixture(scope="session")
def bundle():
    import joblib

    return joblib.load(MODEL_PATH)


@pytest.fixture(scope="session")
def metrics():
    return json.loads(METRICS_PATH.read_text(encoding="utf-8"))


HIGH_RISK = {"Pregnancies": 6, "Glucose": 168, "BloodPressure": 74, "SkinThickness": 33,
             "Insulin": 180, "BMI": 36.5, "DiabetesPedigreeFunction": 0.7, "Age": 52}


# ---------------------------------------------------------------- Step 2 ---- #
def test_impossible_zeros_become_missing_but_pregnancies_do_not():
    df = pd.DataFrame([{**{f: 0 for f in FEATURES}, "Outcome": 0}])
    out = mark_missing(df)
    for col in IMPOSSIBLE_ZERO_COLUMNS:
        assert pd.isna(out.loc[0, col]), col
    assert out.loc[0, "Pregnancies"] == 0


def test_imputer_lives_inside_the_pipeline(bundle):
    steps = list(bundle["pipeline"].named_steps)
    assert steps[0] == "impute", "the imputer must be refitted per CV fold"


# ---------------------------------------------------------------- Step 3 ---- #
def test_headline_numbers_reproduce(metrics):
    tuned, default = metrics["step3_test_tuned"], metrics["step3_test_default"]
    assert tuned["threshold"] == pytest.approx(0.28)
    assert tuned["recall"] == pytest.approx(0.9074, abs=1e-4)
    assert tuned["fn"] == 5 and default["fn"] == 14
    assert tuned["precision"] >= 0.5


def test_bootstrap_interval_contains_point(metrics):
    for key, c in metrics["step3_ci_tuned"].items():
        if isinstance(c, dict):
            assert c["lo"] <= c["point"] <= c["hi"], key


def test_threshold_never_tuned_on_test(metrics):
    # The recall-first threshold must equal the one chosen from the OOF sweep.
    sweep = pd.DataFrame(metrics["step3_threshold_sweep"])
    usable = sweep[sweep["precision"] >= metrics["config"]["min_precision"]]
    best = usable.sort_values(["recall", "precision"], ascending=False).iloc[0]["threshold"]
    assert best == pytest.approx(metrics["step3_thresholds"]["recall_first"])


# ---------------------------------------------------------- Generative ---- #
def test_synthetic_comparison_covers_every_variant(metrics):
    variants = {row["variant"] for row in metrics["step3_synthetic"]}
    assert {"SMOTE", "CTGAN", "TVAE", "none (class weights)"} <= variants


def test_shap_is_additive(bundle):
    from genai_explain import shap_contributions

    r = shap_contributions(bundle["pipeline"], HIGH_RISK)
    total = r["base_value"] + sum(c["contribution"] for c in r["contributions"])
    assert total == pytest.approx(r["probability"], abs=1e-3)
    assert r["contributions"][0]["feature"] == "Glucose"


def test_explanation_always_carries_disclaimer_and_provenance(bundle):
    from genai_explain import DISCLAIMER, explain_patient

    out = explain_patient(bundle["pipeline"], HIGH_RISK, bundle["threshold"], {"band": "High risk", "action": "Refer"})
    assert out["writer"] == "template"          # LLM disabled in tests -> honest label
    assert out["disclaimer"] == DISCLAIMER
    assert "clinician" in out["disclaimer"].lower()
    assert "**Next step**" in out["summary"]
    assert "Plasma Glucose" in out["prompt"]     # the prompt is grounded in computed values


def test_clinical_bands():
    assert clinical_band("Glucose", 120)["tone"] == "good"
    assert clinical_band("Glucose", 210)["tone"] == "critical"
    assert clinical_band("BMI", 24)["label"].startswith("overweight")   # Asian-Indian cut-off


# --------------------------------------------------------------- Step 5 ---- #
def test_prevalence_transport_is_consistent(metrics):
    from rigour import prevalence_transport

    t = metrics["step3_test_tuned"]
    rows = prevalence_transport(t["recall"], t["specificity"])
    pima = rows[0]
    assert pima["precision"] == pytest.approx(t["precision"], abs=0.01)
    india = next(r for r in rows if "ICMR" in r["name"])
    assert india["precision"] < 0.5 and not india["meets_precision_guard"]


# ------------------------------------------------------------------ API ---- #
@pytest.fixture(scope="session")
def client():
    import app as flask_app

    return flask_app.app.test_client()


def test_api_predict_and_clamp(client):
    res = client.post("/api/predict", json={**HIGH_RISK, "Glucose": 9999})
    data = res.get_json()
    assert res.status_code == 200
    assert data["patient"]["Glucose"] == 220
    assert any("clamped" in w for w in data["warnings"])
    assert 0 <= data["probability"] <= 1 and data["flagged"]


def test_api_explain(client):
    data = client.post("/api/explain", json=HIGH_RISK).get_json()
    assert data["writer"] in {"llm", "template"}
    assert data["disclaimer"]
    assert np.isclose(data["shap"]["additivity_gap"], 0, atol=1e-3)


def test_api_health_and_status(client):
    assert client.get("/health").get_json()["status"] == "ok"
    assert client.get("/api/llm-status").get_json()["available"] is False
