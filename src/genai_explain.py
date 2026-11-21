"""Generative layer 2 - SHAP values -> an LLM -> a plain-language risk summary.

The pipeline, end to end:

    patient --> Random Forest --> probability
                     |
                     +--> SHAP TreeExplainer --> exact per-feature contributions
                                                  (they sum to probability - base rate)
                                   |
        clinical reference bands --+--> structured prompt --> Gemini --> summary
                                                                          |
                         server-side safety layer: fixed clinician-review disclaimer,
                         and a deterministic template whenever the LLM is unavailable

Design rules
------------
* The LLM never sees anything but numbers the pipeline computed. It is told
  to use only those numbers, so it cannot invent a lab value or a statistic.
* The disclaimer is appended by *this* code, not requested from the model, so
  it is present on every response whatever the model writes.
* Without an API key (or without a network in the jury room) the same SHAP
  values feed a deterministic template, and the response says which writer
  produced it. The demo never silently pretends an LLM was involved.
"""
from __future__ import annotations

import os
from functools import lru_cache

import numpy as np
import pandas as pd

from config import FEATURE_META, FEATURES, LLM_MODEL_CANDIDATES, LLM_PROVIDER, ROOT, clinical_band

DISCLAIMER = (
    "This summary was generated automatically from a screening model trained on 768 "
    "women of Pima heritage. It is not a diagnosis and must be reviewed by a qualified "
    "clinician. Only a confirmatory blood test (fasting glucose, OGTT or HbA1c) can "
    "establish whether diabetes is present."
)

SYSTEM_PROMPT = """You explain the output of a diabetes-onset screening model to a patient, in plain, calm English.

You will receive: the model's predicted probability, the screening threshold, a risk band, each input measurement with its clinical reference band, and SHAP contributions (how many percentage points each measurement moved this patient's risk above or below the model's baseline).

Rules:
- Use only the numbers provided. Never invent values, statistics, or studies.
- This is a screening triage, not a diagnosis. Never say the patient has or does not have diabetes.
- Do not recommend medicines or doses. Lifestyle points must be general (activity, diet, weight) and only where a modifiable factor (BMI, glucose, blood pressure) is actually pushing risk up.
- Age, pregnancies and family history (pedigree) are not modifiable; acknowledge them without blame.
- Be warm and direct. No headings in capitals, no emojis, no markdown tables.

Write exactly four short sections with these headings, each 1-3 sentences:
**What the screen found**
**What is driving it**
**What could help**
**Next step**"""


# --------------------------------------------------------------------------- #
# SHAP
# --------------------------------------------------------------------------- #
@lru_cache(maxsize=4)
def _explainer(pipeline_id: int, pipeline):
    import shap

    model = pipeline.named_steps["model"]
    return shap.TreeExplainer(model)


def shap_contributions(pipeline, patient: dict) -> dict:
    """Exact TreeSHAP values in probability units for one patient.

    For a Random Forest classifier TreeExplainer works on the forest's averaged
    leaf probabilities, so base_value + sum(contributions) == predicted
    probability (to floating-point precision) - checked below.
    """
    row = pd.DataFrame([{f: patient[f] for f in FEATURES}])[FEATURES]
    imputed = pipeline.named_steps["impute"].transform(row)
    explainer = _explainer(id(pipeline), pipeline)
    values = np.asarray(explainer.shap_values(imputed))
    if values.ndim == 3:  # (rows, features, classes)
        values = values[0, :, 1]
    elif values.ndim == 2 and values.shape[0] == 2:  # [class0, class1] older API
        values = values[1]
    values = np.asarray(values).reshape(-1)
    base = explainer.expected_value
    base = float(np.asarray(base).reshape(-1)[-1])
    probability = float(pipeline.predict_proba(row)[0, 1])

    items = []
    for feature, value, contribution in zip(FEATURES, imputed[0], values):
        band = clinical_band(feature, float(value))
        items.append(
            {
                "feature": feature,
                "label": FEATURE_META[feature]["label"],
                "unit": FEATURE_META[feature]["unit"],
                "value": round(float(value), 2),
                "contribution": round(float(contribution), 4),
                "band": band["label"] if band else None,
                "tone": band["tone"] if band else None,
            }
        )
    items.sort(key=lambda d: abs(d["contribution"]), reverse=True)
    return {
        "base_value": round(base, 4),
        "probability": round(probability, 4),
        "additivity_gap": round(abs(base + float(values.sum()) - probability), 6),
        "contributions": items,
    }


def global_shap(pipeline, X: pd.DataFrame, max_rows: int = 154) -> list[dict]:
    """Mean |SHAP| per feature over held-out patients - the global SHAP view."""
    imputed = pipeline.named_steps["impute"].transform(X.head(max_rows))
    explainer = _explainer(id(pipeline), pipeline)
    values = np.asarray(explainer.shap_values(imputed))
    if values.ndim == 3:
        values = values[:, :, 1]
    mean_abs = np.abs(values).mean(axis=0)
    signed = values.mean(axis=0)
    out = [
        {"feature": f, "mean_abs_shap": round(float(a), 4), "mean_shap": round(float(s), 4)}
        for f, a, s in zip(FEATURES, mean_abs, signed)
    ]
    out.sort(key=lambda d: d["mean_abs_shap"], reverse=True)
    beeswarm = [
        {
            "feature": f,
            "points": [
                {"shap": round(float(values[i, j]), 4), "value": round(float(imputed[i, j]), 2)}
                for i in range(len(imputed))
            ],
        }
        for j, f in enumerate(FEATURES)
    ]
    return out, beeswarm


# --------------------------------------------------------------------------- #
# Prompt
# --------------------------------------------------------------------------- #
def build_prompt(shap_result: dict, threshold: float, band: dict) -> str:
    p = shap_result["probability"]
    lines = [
        f"Predicted probability of diabetes onset: {p:.0%}",
        f"Screening threshold: {threshold:.0%} (at or above this, the patient is flagged for a confirmatory test)",
        f"Decision: {'FLAGGED for a confirmatory test' if p >= threshold else 'not flagged'}",
        f"Risk band: {band.get('band')} - suggested action: {band.get('action')}",
        f"Model baseline before seeing this patient (SHAP base value; the forest is trained with balanced class weights, so this is not the population rate): {shap_result['base_value']:.0%}",
        "",
        "Measurements, clinical reference band, and SHAP contribution (percentage points of risk):",
    ]
    for c in shap_result["contributions"]:
        direction = "raises" if c["contribution"] > 0 else "lowers"
        band_txt = f" [{c['band']}]" if c["band"] else ""
        lines.append(
            f"- {c['label']}: {c['value']:g} {c['unit']}{band_txt} -> {direction} risk by "
            f"{abs(c['contribution']) * 100:.1f} points"
        )
    lines.append("")
    lines.append("Write the four-section explanation for this patient.")
    return "\n".join(lines)


# --------------------------------------------------------------------------- #
# Writers: the LLM, and the deterministic fallback
# --------------------------------------------------------------------------- #
def _load_dotenv() -> None:
    """Read GEMINI_API_KEY (and optional GEMINI_MODEL) from a git-ignored .env file."""
    env = ROOT / ".env"
    if not env.exists():
        return
    for line in env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _api_key() -> str | None:
    return os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")


def llm_available() -> bool:
    _load_dotenv()
    if os.environ.get("DIABETES_LLM_DISABLED") == "1":
        return False
    try:
        from google import genai  # noqa: F401
    except ImportError:
        return False
    return bool(_api_key())


@lru_cache(maxsize=1)
def _client():
    """Gemini Developer API by default; set GOOGLE_GENAI_USE_VERTEXAI=true to route the key via Vertex AI."""
    from google import genai

    vertex = os.environ.get("GOOGLE_GENAI_USE_VERTEXAI", "").lower() in {"1", "true", "yes"}
    return genai.Client(vertexai=vertex, api_key=_api_key())


_WORKING_MODEL: list[str] = []


def _candidate_models() -> list[str]:
    override = os.environ.get("GEMINI_MODEL")
    if override:
        return [override]
    return list(dict.fromkeys(_WORKING_MODEL + LLM_MODEL_CANDIDATES))


def _thinking(model: str):
    """Keep the reasoning budget small: these summaries are short and grounded, and
    an unbounded thinking model can spend the whole output budget before answering."""
    from google.genai import types

    if model.startswith("gemini-2.5"):
        return types.ThinkingConfig(thinking_budget=512)
    if model.startswith("gemini-3"):
        return types.ThinkingConfig(thinking_level="low")
    return None


def llm_summary(prompt: str, timeout: float = 45.0) -> tuple[str, str]:
    """One Gemini call. Returns (text, model id). Raises on failure so the caller can fall back.

    Model IDs change over time, so the first candidate the key can use is
    remembered. A model that is unavailable (404), rate-limited (429), failing
    server-side (5xx) or that runs out of tokens moves on to the next candidate.
    """
    from google.genai import errors, types

    last_error: Exception | None = None
    for model in _candidate_models():
        config = types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            temperature=0.3,
            max_output_tokens=4096,
            thinking_config=_thinking(model),
            http_options=types.HttpOptions(timeout=int(timeout * 1000), api_version="v1beta"),
        )
        try:
            response = _client().models.generate_content(model=model, contents=prompt, config=config)
        except errors.ClientError as exc:
            if getattr(exc, "code", None) in (404, 429):
                last_error = exc
                continue
            raise
        except errors.ServerError as exc:
            last_error = exc
            continue
        feedback = getattr(response, "prompt_feedback", None)
        if feedback is not None and getattr(feedback, "block_reason", None):
            raise RuntimeError("blocked by safety filter")
        candidates = getattr(response, "candidates", None) or []
        finish = str(getattr(candidates[0], "finish_reason", "")) if candidates else ""
        if "MAX_TOKENS" in finish:
            last_error = RuntimeError(f"{model} ran out of output tokens")
            continue
        text = (response.text or "").strip()
        if not text:
            raise RuntimeError("empty response")
        if model not in _WORKING_MODEL:
            _WORKING_MODEL.insert(0, model)
        return text, model
    raise RuntimeError(f"no available Gemini model ({last_error})")


def template_summary(shap_result: dict, threshold: float, band: dict) -> str:
    """Deterministic explanation built from the same SHAP values - no LLM."""
    p = shap_result["probability"]
    flagged = p >= threshold
    ups = [c for c in shap_result["contributions"] if c["contribution"] > 0.005][:3]
    downs = [c for c in shap_result["contributions"] if c["contribution"] < -0.005][:2]
    modifiable = [c for c in ups if c["feature"] in ("BMI", "Glucose", "BloodPressure")]

    found = (
        f"The screening model estimates the chance of diabetes onset at {p:.0%}, which is "
        f"{'at or above' if flagged else 'below'} the {threshold:.0%} screening threshold "
        f"({band.get('band', '').lower()})."
    )
    if ups:
        drive = "Risk is pushed up mainly by " + ", ".join(
            f"{c['label'].lower()} ({c['value']:g} {c['unit']}, +{c['contribution'] * 100:.0f} points)"
            for c in ups
        ) + "."
    else:
        drive = "No single measurement raises the risk noticeably above average."
    if downs:
        drive += " It is pulled down by " + ", ".join(
            f"{c['label'].lower()} ({c['contribution'] * 100:.0f} points)" for c in downs
        ) + "."
    if modifiable:
        help_ = (
            "The measurements that can change - "
            + " and ".join(c["label"].lower() for c in modifiable)
            + " - are the ones worth discussing: regular activity, a balanced diet and "
            "gradual weight loss where advised all lower them over time."
        )
    else:
        help_ = (
            "The factors raising risk here are mostly not modifiable, so staying active "
            "and keeping a healthy weight are about protecting the current position."
        )
    nxt = (
        "Book a confirmatory blood test (fasting glucose or HbA1c) with a clinician."
        if flagged
        else "No referral is triggered today; re-screen at the routine interval, sooner if symptoms appear."
    )
    return (
        f"**What the screen found**\n{found}\n\n**What is driving it**\n{drive}\n\n"
        f"**What could help**\n{help_}\n\n**Next step**\n{nxt}"
    )


def explain_patient(pipeline, patient: dict, threshold: float, band: dict, use_llm: bool = True) -> dict:
    """Full generative explanation for one patient, with provenance."""
    shap_result = shap_contributions(pipeline, patient)
    prompt = build_prompt(shap_result, threshold, band)

    writer, error, model = "template", None, None
    text = None
    if use_llm and llm_available():
        try:
            text, model = llm_summary(prompt)
            writer = "llm"
        except Exception as exc:  # network, auth, quota, safety block - all fall back
            error = type(exc).__name__
    if text is None:
        text = template_summary(shap_result, threshold, band)

    return {
        "writer": writer,
        "model": f"{LLM_PROVIDER} ({model})" if writer == "llm" else "deterministic template",
        "fallback_reason": error,
        "summary": text,
        "disclaimer": DISCLAIMER,
        "prompt": prompt,
        "shap": shap_result,
    }
