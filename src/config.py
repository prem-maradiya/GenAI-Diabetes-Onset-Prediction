"""Central configuration for the Diabetes Onset Prediction project.

Every module imports paths and constants from here so that the notebook, the
CLI pipeline and the Flask demo always agree on the same settings.
"""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

DATA_RAW = ROOT / "data" / "raw" / "pima_diabetes.csv"
DATA_PROCESSED = ROOT / "data" / "processed" / "pima_imputed.csv"
MODELS_DIR = ROOT / "models"
REPORTS_DIR = ROOT / "reports"
FIGURES_DIR = REPORTS_DIR / "figures"
WEB_DIR = ROOT / "app" / "static"

MODEL_PATH = MODELS_DIR / "diabetes_model.joblib"
METRICS_PATH = REPORTS_DIR / "metrics.json"
MODEL_CARD_PATH = MODELS_DIR / "model_card.json"

FEATURES = [
    "Pregnancies",
    "Glucose",
    "BloodPressure",
    "SkinThickness",
    "Insulin",
    "BMI",
    "DiabetesPedigreeFunction",
    "Age",
]
TARGET = "Outcome"

# Columns where a recorded 0 is biologically impossible -> it is a missing value.
# Pregnancies = 0 is perfectly valid, so it is deliberately excluded.
IMPOSSIBLE_ZERO_COLUMNS = [
    "Glucose",
    "BloodPressure",
    "SkinThickness",
    "Insulin",
    "BMI",
]

# Human-readable metadata used by the notebook and the web UI.
FEATURE_META = {
    "Pregnancies":              {"label": "Pregnancies",        "unit": "count",     "min": 0,  "max": 17,  "step": 1,    "default": 3},
    "Glucose":                  {"label": "Plasma Glucose",     "unit": "mg/dL",     "min": 40, "max": 220, "step": 1,    "default": 120},
    "BloodPressure":            {"label": "Diastolic BP",       "unit": "mm Hg",     "min": 30, "max": 130, "step": 1,    "default": 72},
    "SkinThickness":            {"label": "Triceps Skin Fold",  "unit": "mm",        "min": 5,  "max": 100, "step": 1,    "default": 29},
    "Insulin":                  {"label": "2-h Serum Insulin",  "unit": "mu U/ml",   "min": 10, "max": 850, "step": 1,    "default": 125},
    "BMI":                      {"label": "Body Mass Index",    "unit": "kg/m2",     "min": 15, "max": 70,  "step": 0.1,  "default": 32.0},
    "DiabetesPedigreeFunction": {"label": "Pedigree Function",  "unit": "score",     "min": 0.05,"max": 2.5,"step": 0.01, "default": 0.47},
    "Age":                      {"label": "Age",                "unit": "years",     "min": 18, "max": 90,  "step": 1,    "default": 33},
}

# Clinical reference bands shown beside each input and given to the LLM so its
# plain-language summary is anchored to recognised cut-offs rather than invented.
# Glucose here is the 2-hour OGTT plasma glucose (WHO / ADA); BMI carries both the
# WHO global bands and the lower Asian-Indian action points (WHO 2004 / ICMR).
CLINICAL_RANGES = {
    "Glucose": [
        {"upto": 140, "label": "normal glucose tolerance", "tone": "good"},
        {"upto": 200, "label": "impaired glucose tolerance (prediabetes range)", "tone": "warning"},
        {"upto": 999, "label": "in the diabetic range on a 2-h OGTT", "tone": "critical"},
    ],
    "BMI": [
        {"upto": 18.5, "label": "underweight", "tone": "warning"},
        {"upto": 23.0, "label": "healthy (Asian-Indian cut-off)", "tone": "good"},
        {"upto": 25.0, "label": "overweight by Asian-Indian cut-offs", "tone": "warning"},
        {"upto": 30.0, "label": "obese by Asian-Indian cut-offs, overweight by WHO", "tone": "critical"},
        {"upto": 999, "label": "obese", "tone": "critical"},
    ],
    "BloodPressure": [
        {"upto": 80, "label": "normal diastolic pressure", "tone": "good"},
        {"upto": 90, "label": "stage-1 hypertension range", "tone": "warning"},
        {"upto": 999, "label": "stage-2 hypertension range", "tone": "critical"},
    ],
    "Age": [
        {"upto": 35, "label": "below the usual screening age", "tone": "good"},
        {"upto": 45, "label": "screening recommended if overweight", "tone": "warning"},
        {"upto": 999, "label": "routine screening age", "tone": "critical"},
    ],
    "Insulin": [
        {"upto": 16, "label": "low 2-h insulin", "tone": "warning"},
        {"upto": 166, "label": "typical 2-h insulin", "tone": "good"},
        {"upto": 9999, "label": "high 2-h insulin (possible insulin resistance)", "tone": "critical"},
    ],
}


def clinical_band(feature: str, value: float) -> dict | None:
    for band in CLINICAL_RANGES.get(feature, []):
        if value < band["upto"]:
            return band
    return None


# Generative layer: the LLM that writes the patient-friendly explanation.
# Google Gemini via the Gemini Developer API (Vertex AI optional). The key is read
# from the environment / a git-ignored .env file, so it never lives in the repo.
# Model IDs change over time: the first candidate the key can use is kept, and
# GEMINI_MODEL in .env overrides the list. Ordered for a live demo: measured on
# 2026-11-21, 3-flash-preview answered in ~2 s and 2.5-flash in ~4 s, while
# 3.5-flash timed out (504) on repeated calls, so it is the last resort.
LLM_PROVIDER = "Gemini"
LLM_MODEL_CANDIDATES = [
    "gemini-3-flash-preview",
    "gemini-2.5-flash",
    "gemini-3.5-flash",
]

RANDOM_STATE = 42
TEST_SIZE = 0.20
CV_FOLDS = 5

# Cost model used for threshold selection and the ethics discussion.
# A missed diabetic (false negative) is treated as 5x worse than a false alarm.
COST_FALSE_NEGATIVE = 5.0
COST_FALSE_POSITIVE = 1.0
MIN_PRECISION = 0.50   # a recall-first threshold must still keep precision usable


def ensure_dirs() -> None:
    for d in (DATA_PROCESSED.parent, MODELS_DIR, REPORTS_DIR, FIGURES_DIR):
        d.mkdir(parents=True, exist_ok=True)
