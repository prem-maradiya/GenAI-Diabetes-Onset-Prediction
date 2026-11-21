"""Step 3 - Train classifiers and select/evaluate them with RECALL as the goal.

Why recall drives every decision in this file
---------------------------------------------
A false negative is a person who *will* develop diabetes and is told they are
fine: they leave the screening funnel and are caught years later with damage
already done.  A false positive costs one confirmatory blood test.  The two
errors are not symmetric, so accuracy (which treats them as equal) is the wrong
objective.  We therefore:
  * select the model family on F2 (recall weighted 4x precision), not accuracy;
  * tune the decision threshold on out-of-fold probabilities, never on the test set;
  * report a cost-weighted score with FN = 5 x FP.
"""
from __future__ import annotations

import warnings

import numpy as np
import pandas as pd
from imblearn.over_sampling import SMOTE
from imblearn.pipeline import Pipeline as ImbPipeline
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_val_predict, train_test_split
from sklearn.naive_bayes import GaussianNB
from sklearn.neighbors import KNeighborsClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC

from config import (
    COST_FALSE_NEGATIVE,
    COST_FALSE_POSITIVE,
    CV_FOLDS,
    FEATURES,
    MIN_PRECISION,
    RANDOM_STATE,
    TARGET,
    TEST_SIZE,
)
from evaluate import classification_report_dict, cost_of
from preprocess import build_imputer, mark_missing

warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=UserWarning)


# --------------------------------------------------------------------------- #
# Data split
# --------------------------------------------------------------------------- #
def make_split(df: pd.DataFrame):
    """Stratified 80/20 hold-out on the zero-flagged frame."""
    flagged = mark_missing(df)
    X = flagged[FEATURES]
    y = flagged[TARGET].astype(int)
    return train_test_split(
        X, y, test_size=TEST_SIZE, random_state=RANDOM_STATE, stratify=y
    )


# --------------------------------------------------------------------------- #
# Candidate models
# --------------------------------------------------------------------------- #
def build_pipeline(model, imputation="median", scale=True, smote=False):
    """Imputer -> (Scaler) -> (SMOTE) -> classifier, all fitted per training fold."""
    steps = [("impute", build_imputer(imputation))]
    if scale:
        steps.append(("scale", StandardScaler()))
    if smote:
        steps.append(("smote", SMOTE(random_state=RANDOM_STATE, k_neighbors=5)))
        steps.append(("model", model))
        return ImbPipeline(steps)
    steps.append(("model", model))
    return Pipeline(steps)


def candidate_models(imputation: str = "median") -> dict:
    """The model zoo.

    `family` records discriminative vs generative for the Unit-1 syllabus
    mapping: a generative classifier learns P(x|y) and applies Bayes' rule,
    a discriminative one learns the boundary P(y|x) directly.
    """
    rs = RANDOM_STATE
    return {
        "Logistic Regression": {
            "pipeline": build_pipeline(
                LogisticRegression(max_iter=2000, class_weight="balanced", random_state=rs),
                imputation,
            ),
            "family": "discriminative (linear)",
            "note": "Interpretable baseline; balanced class weights lift recall.",
        },
        "Random Forest": {
            "pipeline": build_pipeline(
                RandomForestClassifier(
                    n_estimators=500,
                    max_depth=6,
                    min_samples_leaf=4,
                    class_weight="balanced_subsample",
                    random_state=rs,
                    n_jobs=-1,
                ),
                imputation,
                scale=False,
            ),
            "family": "discriminative (bagged trees)",
            "note": "Non-linear interactions plus built-in feature importances.",
        },
        "Gradient Boosting": {
            "pipeline": build_pipeline(
                GradientBoostingClassifier(
                    n_estimators=200, learning_rate=0.05, max_depth=3, random_state=rs
                ),
                imputation,
                scale=False,
            ),
            "family": "discriminative (boosted trees)",
            "note": "Sequential error correction; strong tabular performer.",
        },
        "SVM (RBF)": {
            "pipeline": build_pipeline(
                SVC(
                    C=1.0,
                    gamma="scale",
                    class_weight="balanced",
                    probability=True,
                    random_state=rs,
                ),
                imputation,
            ),
            "family": "discriminative (kernel)",
            "note": "Non-linear margin; requires feature scaling.",
        },
        "k-Nearest Neighbours": {
            "pipeline": build_pipeline(
                KNeighborsClassifier(n_neighbors=15, weights="distance"), imputation
            ),
            "family": "instance-based",
            "note": "No training phase; decisions are purely local.",
        },
        "Gaussian Naive Bayes": {
            "pipeline": build_pipeline(GaussianNB(), imputation),
            "family": "generative",
            "note": "Models P(x|y) then inverts it with Bayes' rule.",
        },
        "Logistic Regression + SMOTE": {
            "pipeline": build_pipeline(
                LogisticRegression(max_iter=2000, random_state=rs), imputation, smote=True
            ),
            "family": "discriminative + synthetic data",
            "note": "SMOTE generates synthetic minority patients to rebalance classes.",
        },
    }


# --------------------------------------------------------------------------- #
# Cross-validated comparison (all decisions here, never on the test set)
# --------------------------------------------------------------------------- #
def oof_probabilities(pipeline, X, y):
    """Out-of-fold positive-class probabilities via stratified CV."""
    cv = StratifiedKFold(n_splits=CV_FOLDS, shuffle=True, random_state=RANDOM_STATE)
    return cross_val_predict(pipeline, X, y, cv=cv, method="predict_proba")[:, 1]


def compare_models(X_train, y_train, imputation: str = "median"):
    """Rank every candidate on out-of-fold recall / F2 / PR-AUC."""
    rows, oof = [], {}
    for name, spec in candidate_models(imputation).items():
        proba = oof_probabilities(spec["pipeline"], X_train, y_train)
        oof[name] = proba
        s = classification_report_dict(y_train, proba, threshold=0.5)
        rows.append(
            {
                "model": name,
                "family": spec["family"],
                "recall": s["recall"],
                "precision": s["precision"],
                "f1": s["f1"],
                "f2": s["f2"],
                "roc_auc": s["roc_auc"],
                "pr_auc": s["pr_auc"],
                "accuracy": s["accuracy"],
                "missed_cases": s["fn"],
                "note": spec["note"],
            }
        )
    table = pd.DataFrame(rows).sort_values("f2", ascending=False, ignore_index=True)
    return table, oof


def compare_imputation(X_train, y_train, model_name: str = "Random Forest") -> pd.DataFrame:
    """Step-2 evidence: does the imputation strategy actually move recall?"""
    rows = []
    for strategy in ["mean", "median", "knn", "iterative"]:
        spec = candidate_models(strategy)[model_name]
        proba = oof_probabilities(spec["pipeline"], X_train, y_train)
        s = classification_report_dict(y_train, proba, threshold=0.5)
        rows.append(
            {
                "imputation": strategy,
                "recall": s["recall"],
                "precision": s["precision"],
                "f2": s["f2"],
                "roc_auc": s["roc_auc"],
                "pr_auc": s["pr_auc"],
            }
        )
    return pd.DataFrame(rows).sort_values("f2", ascending=False, ignore_index=True)


# --------------------------------------------------------------------------- #
# Threshold selection - the single biggest recall lever
# --------------------------------------------------------------------------- #
def threshold_sweep(y_true, proba) -> pd.DataFrame:
    """Metric curves over every candidate cut-off."""
    rows = []
    for t in np.round(np.arange(0.05, 0.96, 0.01), 2):
        s = classification_report_dict(y_true, proba, threshold=float(t))
        s["cost"] = cost_of(s["fn"], s["fp"])
        rows.append(s)
    return pd.DataFrame(rows)


def choose_threshold(y_true, proba) -> dict:
    """Highest-recall threshold that still keeps precision >= MIN_PRECISION,
    alongside the cost-minimising and F2-maximising cut-offs for comparison."""
    sweep = threshold_sweep(y_true, proba)

    usable = sweep[sweep["precision"] >= MIN_PRECISION]
    if usable.empty:  # degenerate safety net
        usable = sweep
    recall_first = usable.sort_values(
        ["recall", "precision"], ascending=[False, False]
    ).iloc[0]
    cost_best = sweep.sort_values(["cost", "threshold"], ascending=[True, False]).iloc[0]
    f2_best = sweep.sort_values("f2", ascending=False).iloc[0]

    return {
        "recall_first": float(recall_first["threshold"]),
        "cost_optimal": float(cost_best["threshold"]),
        "f2_optimal": float(f2_best["threshold"]),
        "default": 0.5,
        "sweep": sweep,
        "rule": (
            "maximise recall subject to precision >= "
            f"{MIN_PRECISION:.2f}; cost model FN={COST_FALSE_NEGATIVE:g} "
            f"x FP={COST_FALSE_POSITIVE:g}"
        ),
    }


def fit_final(pipeline, X_train, y_train):
    """Refit the winning pipeline on the full training set."""
    return pipeline.fit(X_train, y_train)


if __name__ == "__main__":
    from data_loader import load_raw

    X_tr, X_te, y_tr, y_te = make_split(load_raw())
    print("train:", X_tr.shape, "test:", X_te.shape, "train positives:", int(y_tr.sum()))
    table, _ = compare_models(X_tr, y_tr)
    print(table.drop(columns=["note"]).to_string(index=False))


# --------------------------------------------------------------------------- #
# Model selection with an explicit, reproducible tie-break
# --------------------------------------------------------------------------- #
# Differences of ~0.002 F2 on 614 rows are noise, so a bare argmax would make the
# deployed model depend on the random seed.  Instead we take every model within
# TOLERANCE of the best F2 (a "statistically tied" set), then break the tie with
# rules we can defend to a jury:  higher recall first, then this priority list.
DEPLOY_PRIORITY = [
    "Random Forest",              # native feature importances -> satisfies Step 4
    "Logistic Regression",        # fully interpretable coefficients
    "Gradient Boosting",
    "Logistic Regression + SMOTE",
    "SVM (RBF)",
    "Gaussian Naive Bayes",
    "k-Nearest Neighbours",
]
F2_TOLERANCE = 0.01


def select_model(table: pd.DataFrame) -> dict:
    """Pick the model to deploy and explain, in words, why it won."""
    best_f2 = float(table["f2"].max())
    tied = table[table["f2"] >= best_f2 - F2_TOLERANCE].copy()
    tied["priority"] = tied["model"].apply(
        lambda m: DEPLOY_PRIORITY.index(m) if m in DEPLOY_PRIORITY else 99
    )
    winner = tied.sort_values(
        ["recall", "priority"], ascending=[False, True], kind="mergesort"
    ).iloc[0]

    return {
        "model": str(winner["model"]),
        "cv_f2": float(winner["f2"]),
        "cv_recall": float(winner["recall"]),
        "best_f2_in_table": round(best_f2, 4),
        "tied_with": [m for m in tied["model"] if m != winner["model"]],
        "rule": (
            f"models within {F2_TOLERANCE} F2 of the best are treated as tied; "
            "the tie is broken by out-of-fold recall, then by a fixed "
            "interpretability/deployability priority list"
        ),
    }
