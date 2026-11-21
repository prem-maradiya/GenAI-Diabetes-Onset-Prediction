"""Step 3 (evaluation half) - recall-first metrics, curves and cost analysis.

Every metric helper in this file takes *probabilities*, not hard labels, because
the decision threshold is itself a tunable part of the model in a screening
problem.  Reporting a single accuracy number would hide exactly the trade-off
this project is about.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    balanced_accuracy_score,
    brier_score_loss,
    confusion_matrix,
    fbeta_score,
    precision_recall_curve,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
)

from config import COST_FALSE_NEGATIVE, COST_FALSE_POSITIVE


def cost_of(false_negatives: int, false_positives: int) -> float:
    """Clinical cost proxy: a missed case is 5x worse than a false alarm."""
    return COST_FALSE_NEGATIVE * false_negatives + COST_FALSE_POSITIVE * false_positives


def classification_report_dict(y_true, proba, threshold: float = 0.5) -> dict:
    """All headline numbers for one operating point."""
    y_true = np.asarray(y_true).astype(int)
    proba = np.asarray(proba, dtype=float)
    y_pred = (proba >= threshold).astype(int)

    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()
    specificity = tn / (tn + fp) if (tn + fp) else 0.0
    npv = tn / (tn + fn) if (tn + fn) else 0.0

    return {
        "threshold": round(float(threshold), 3),
        "accuracy": round(float(accuracy_score(y_true, y_pred)), 4),
        "balanced_accuracy": round(float(balanced_accuracy_score(y_true, y_pred)), 4),
        "recall": round(float(recall_score(y_true, y_pred, zero_division=0)), 4),
        "precision": round(float(precision_score(y_true, y_pred, zero_division=0)), 4),
        "specificity": round(float(specificity), 4),
        "npv": round(float(npv), 4),
        "f1": round(float(fbeta_score(y_true, y_pred, beta=1, zero_division=0)), 4),
        "f2": round(float(fbeta_score(y_true, y_pred, beta=2, zero_division=0)), 4),
        "roc_auc": round(float(roc_auc_score(y_true, proba)), 4),
        "pr_auc": round(float(average_precision_score(y_true, proba)), 4),
        "brier": round(float(brier_score_loss(y_true, proba)), 4),
        "tn": int(tn),
        "fp": int(fp),
        "fn": int(fn),
        "tp": int(tp),
        "n": int(len(y_true)),
    }


def confusion_frame(y_true, proba, threshold: float = 0.5) -> pd.DataFrame:
    """Confusion matrix as a labelled table (used in the notebook)."""
    y_pred = (np.asarray(proba) >= threshold).astype(int)
    cm = confusion_matrix(np.asarray(y_true).astype(int), y_pred, labels=[0, 1])
    return pd.DataFrame(
        cm,
        index=["Actual: No diabetes", "Actual: Diabetes"],
        columns=["Predicted: No diabetes", "Predicted: Diabetes"],
    )


def curve_points(y_true, proba) -> dict:
    """Down-sampled ROC and PR curves, ready to hand to the web front-end."""
    y_true = np.asarray(y_true).astype(int)
    fpr, tpr, _ = roc_curve(y_true, proba)
    prec, rec, _ = precision_recall_curve(y_true, proba)

    def thin(xs, ys, k: int = 120):
        idx = np.unique(np.linspace(0, len(xs) - 1, min(k, len(xs))).astype(int))
        return [{"x": round(float(xs[i]), 4), "y": round(float(ys[i]), 4)} for i in idx]

    return {
        "roc": thin(fpr, tpr),
        "pr": thin(rec, prec),
        "roc_auc": round(float(roc_auc_score(y_true, proba)), 4),
        "pr_auc": round(float(average_precision_score(y_true, proba)), 4),
        "baseline_precision": round(float(y_true.mean()), 4),
    }


def calibration_table(y_true, proba, bins: int = 8) -> pd.DataFrame:
    """Predicted probability vs observed frequency - the 'is 0.7 really 70%?' check.

    This is the probability-theory link in the syllabus: a usable clinical score
    must be calibrated, not merely correctly ranked.
    """
    y_true = np.asarray(y_true).astype(int)
    proba = np.asarray(proba, dtype=float)
    edges = np.linspace(0, 1, bins + 1)
    rows = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        mask = (proba >= lo) & (proba < hi if hi < 1 else proba <= 1)
        if mask.sum() == 0:
            continue
        rows.append(
            {
                "bin": f"{lo:.2f}-{hi:.2f}",
                "n": int(mask.sum()),
                "mean_predicted": round(float(proba[mask].mean()), 3),
                "observed_rate": round(float(y_true[mask].mean()), 3),
            }
        )
    return pd.DataFrame(rows)


def screening_impact(metrics: dict, cohort: int = 10_000) -> dict:
    """Translate rates into people, for the ethics discussion.

    Percentages do not move a jury; 'this design misses 191 real patients per
    10,000 screened' does.
    """
    n = metrics["n"]
    scale = cohort / n
    return {
        "cohort": cohort,
        "true_positives": int(round(metrics["tp"] * scale)),
        "missed_cases": int(round(metrics["fn"] * scale)),
        "false_alarms": int(round(metrics["fp"] * scale)),
        "correctly_cleared": int(round(metrics["tn"] * scale)),
        "confirmatory_tests_needed": int(round((metrics["tp"] + metrics["fp"]) * scale)),
        "cost": round(cost_of(metrics["fn"], metrics["fp"]) * scale, 1),
    }
