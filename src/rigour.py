"""Evaluation rigour - the numbers a jury asks for after "what is your recall?"

1. Bootstrap 95% confidence intervals for every operating-point metric.
   With 54 positive test patients, "recall = 90.7%" is a point estimate with a
   wide interval; we report the interval instead of hiding it.
2. Calibration: Brier score, calibration slope / intercept and a reliability
   curve, for the deployed forest and for an isotonic-calibrated copy.
3. Decision-curve analysis: net benefit of screening with the model versus
   "test everyone" and "test no one", across clinically plausible thresholds.
4. Transportability to India: the test-set sensitivity and specificity carried
   to the prevalence measured by ICMR-INDIAB, to show what happens to
   precision and the follow-up load when the population changes.
5. External validation hook: any CSV with the same eight columns placed in
   data/external/ is scored with the frozen pipeline - no refitting.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.linear_model import LogisticRegression

from config import FEATURES, MIN_PRECISION, RANDOM_STATE, ROOT, TARGET
from evaluate import calibration_table, classification_report_dict

N_BOOT = 2000
EXTERNAL_DIR = ROOT / "data" / "external"

# Prevalence references for the transportability analysis.
# ICMR-INDIAB (Anjana et al., Lancet Diabetes & Endocrinology, 2023): diabetes
# 11.4% and prediabetes 15.3% in Indian adults.
PREVALENCE_SCENARIOS = [
    {"name": "Pima training cohort", "prevalence": 0.349},
    {"name": "Indian adults (ICMR-INDIAB 2023)", "prevalence": 0.114},
    {"name": "Indian adults, diabetes + prediabetes", "prevalence": 0.267},
    {"name": "High-risk Indian clinic (assumed)", "prevalence": 0.20},
]


# --------------------------------------------------------------------------- #
# 1. Bootstrap confidence intervals
# --------------------------------------------------------------------------- #
def bootstrap_ci(y_true, proba, threshold: float, n_boot: int = N_BOOT) -> dict:
    """Percentile bootstrap: resample patients with replacement, recompute."""
    y_true = np.asarray(y_true).astype(int)
    proba = np.asarray(proba, dtype=float)
    rng = np.random.default_rng(RANDOM_STATE)
    keys = ["recall", "precision", "specificity", "f1", "f2", "accuracy", "roc_auc", "brier"]
    draws = {k: [] for k in keys}
    n = len(y_true)
    for _ in range(n_boot):
        idx = rng.integers(0, n, n)
        if y_true[idx].min() == y_true[idx].max():
            continue  # need both classes for AUC
        s = classification_report_dict(y_true[idx], proba[idx], threshold)
        for k in keys:
            draws[k].append(s[k])
    point = classification_report_dict(y_true, proba, threshold)
    return {
        k: {
            "point": point[k],
            "lo": round(float(np.percentile(draws[k], 2.5)), 4),
            "hi": round(float(np.percentile(draws[k], 97.5)), 4),
        }
        for k in keys
    } | {"n_boot": n_boot, "threshold": threshold}


# --------------------------------------------------------------------------- #
# 2. Calibration
# --------------------------------------------------------------------------- #
def calibration_stats(y_true, proba) -> dict:
    """Brier, plus slope/intercept of a logistic recalibration of logit(p).

    Slope 1 and intercept 0 mean perfectly calibrated; slope < 1 means
    predictions are too extreme, slope > 1 too timid.
    """
    y_true = np.asarray(y_true).astype(int)
    p = np.clip(np.asarray(proba, dtype=float), 1e-4, 1 - 1e-4)
    logit = np.log(p / (1 - p)).reshape(-1, 1)
    lr = LogisticRegression(C=1e6, max_iter=1000).fit(logit, y_true)
    return {
        "brier": round(float(np.mean((p - y_true) ** 2)), 4),
        "slope": round(float(lr.coef_[0][0]), 3),
        "intercept": round(float(lr.intercept_[0]), 3),
        "mean_predicted": round(float(p.mean()), 3),
        "observed_rate": round(float(y_true.mean()), 3),
    }


def calibration_comparison(pipeline_factory, X_train, y_train, X_test, y_test, raw_test_proba) -> dict:
    """The deployed forest versus an isotonic-calibrated copy (fitted on train only)."""
    calibrated = CalibratedClassifierCV(pipeline_factory(), method="isotonic", cv=5)
    calibrated.fit(X_train, y_train)
    cal_proba = calibrated.predict_proba(X_test)[:, 1]
    return {
        "raw": calibration_stats(y_test, raw_test_proba)
        | {"curve": calibration_table(y_test, raw_test_proba, bins=6).to_dict("records"),
           "roc_auc": classification_report_dict(y_test, raw_test_proba)["roc_auc"]},
        "isotonic": calibration_stats(y_test, cal_proba)
        | {"curve": calibration_table(y_test, cal_proba, bins=6).to_dict("records"),
           "roc_auc": classification_report_dict(y_test, cal_proba)["roc_auc"]},
        "note": (
            "The deployed threshold is tuned on the forest's raw out-of-fold scores, "
            "so the raw scores stay the decision variable; calibration is reported so "
            "a displayed percentage can be read honestly."
        ),
    }


# --------------------------------------------------------------------------- #
# 3. Decision-curve analysis
# --------------------------------------------------------------------------- #
def decision_curve(y_true, proba, thresholds=None) -> list[dict]:
    """Net benefit = TP/n - FP/n * pt/(1-pt)   (Vickers & Elkin, 2006).

    pt is the threshold probability at which a clinician is indifferent between
    testing and not testing; pt = 1/6 corresponds to our FN = 5 x FP cost model.
    """
    y_true = np.asarray(y_true).astype(int)
    proba = np.asarray(proba, dtype=float)
    n = len(y_true)
    prevalence = y_true.mean()
    thresholds = thresholds if thresholds is not None else np.round(np.arange(0.05, 0.71, 0.01), 2)
    rows = []
    for pt in thresholds:
        pred = proba >= pt
        tp = int(((pred == 1) & (y_true == 1)).sum())
        fp = int(((pred == 1) & (y_true == 0)).sum())
        w = pt / (1 - pt)
        rows.append(
            {
                "threshold": float(pt),
                "model": round(tp / n - fp / n * w, 4),
                "test_all": round(prevalence - (1 - prevalence) * w, 4),
                "test_none": 0.0,
            }
        )
    return rows


# --------------------------------------------------------------------------- #
# 4. Transportability to a population with a different prevalence
# --------------------------------------------------------------------------- #
def prevalence_transport(sensitivity: float, specificity: float, cohort: int = 10_000) -> list[dict]:
    """Sensitivity and specificity are properties of the score distributions, so
    under pure label shift they carry over; precision (PPV) does not.  This is
    the arithmetic of why the threshold must be re-tuned before use in India."""
    out = []
    for sc in PREVALENCE_SCENARIOS:
        pi = sc["prevalence"]
        tp = sensitivity * pi
        fp = (1 - specificity) * (1 - pi)
        ppv = tp / (tp + fp) if (tp + fp) else 0.0
        npv = specificity * (1 - pi) / (specificity * (1 - pi) + (1 - sensitivity) * pi)
        out.append(
            {
                **sc,
                "precision": round(ppv, 3),
                "npv": round(npv, 3),
                "meets_precision_guard": bool(ppv >= MIN_PRECISION),
                "per_10k_true_cases": int(round(pi * cohort)),
                "per_10k_caught": int(round(tp * cohort)),
                "per_10k_missed": int(round((1 - sensitivity) * pi * cohort)),
                "per_10k_false_alarms": int(round(fp * cohort)),
                "tests_per_case_found": round((tp + fp) / tp, 2) if tp else None,
            }
        )
    return out


def prevalence_curve(sensitivity: float, specificity: float) -> list[dict]:
    rows = []
    for pi in np.round(np.arange(0.02, 0.61, 0.01), 2):
        tp = sensitivity * pi
        fp = (1 - specificity) * (1 - pi)
        rows.append({"prevalence": float(pi), "precision": round(tp / (tp + fp), 4)})
    return rows


REVALIDATION_PROTOCOL = [
    "Collect a labelled Indian cohort (both sexes, 20+ years) with the same eight measurements and a confirmatory OGTT / HbA1c as the label.",
    "Score it with the frozen pipeline - no refitting, no re-imputation statistics - and report recall, precision, AUC and calibration with bootstrap intervals.",
    "Check feature shift first: Indian patients develop diabetes at lower BMI, so the BMI-risk relationship learned on Pima women may not transfer.",
    "Re-tune only the threshold on that cohort's out-of-fold scores against the same recall-first rule, then re-check the precision guard at Indian prevalence.",
    "If calibration slope or AUC degrade materially, refit on the new cohort and treat Pima as pre-training, not as the deployed model.",
]


# --------------------------------------------------------------------------- #
# 5. External validation hook
# --------------------------------------------------------------------------- #
def external_validation(pipeline, threshold: float) -> list[dict]:
    """Score every same-schema CSV in data/external/ with the frozen pipeline."""
    from preprocess import mark_missing

    results = []
    if not EXTERNAL_DIR.exists():
        return results
    for path in sorted(EXTERNAL_DIR.glob("*.csv")):
        df = pd.read_csv(path)
        if not set(FEATURES + [TARGET]).issubset(df.columns):
            results.append({"dataset": path.name, "error": "columns do not match the Pima schema"})
            continue
        flagged = mark_missing(df)
        proba = pipeline.predict_proba(flagged[FEATURES])[:, 1]
        y = flagged[TARGET].astype(int)
        results.append(
            {
                "dataset": path.name,
                "rows": int(len(df)),
                "prevalence": round(float(y.mean()), 3),
                "metrics": classification_report_dict(y, proba, threshold),
                "ci": bootstrap_ci(y, proba, threshold, n_boot=1000),
                "calibration": calibration_stats(y, proba),
                "feature_shift": {
                    f: round(float(flagged[f].median()), 2) for f in FEATURES
                },
            }
        )
    return results
