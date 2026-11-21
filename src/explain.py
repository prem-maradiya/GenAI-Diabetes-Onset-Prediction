"""Step 4 - Feature importance: which factors actually drive predicted risk.

Three complementary views, because no single importance measure is trustworthy
on its own:

1. Permutation importance - model-agnostic, measured as the *drop in recall*
   when one column is shuffled.  Scored on held-out data, so it answers
   "what does this model rely on to catch real cases?"
2. Impurity importance - the tree-internal view.  Fast, but biased toward
   high-cardinality / continuous features, so it is reported as a cross-check
   rather than the headline.
3. Standardised logistic coefficients (odds ratios) - the only view that gives
   a *direction* and a magnitude a clinician can read: "+1 SD of glucose
   multiplies the odds of diabetes by X".

A local, per-patient explanation is provided by median substitution (occlusion):
replace one feature with the training median, re-score, and report the change in
predicted risk.  This is not SHAP - it ignores feature interactions - and it is
labelled as such wherever it is shown.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from config import FEATURES, RANDOM_STATE
from preprocess import build_imputer


def permutation_view(fitted_pipeline, X, y, scoring: str = "recall", n_repeats: int = 30) -> pd.DataFrame:
    """Drop in `scoring` when each column is shuffled. Higher = more relied upon."""
    result = permutation_importance(
        fitted_pipeline,
        X,
        y,
        scoring=scoring,
        n_repeats=n_repeats,
        random_state=RANDOM_STATE,
        n_jobs=1,
    )
    return (
        pd.DataFrame(
            {
                "feature": list(X.columns),
                "importance": np.round(result.importances_mean, 4),
                "std": np.round(result.importances_std, 4),
            }
        )
        .sort_values("importance", ascending=False, ignore_index=True)
    )


def impurity_view(fitted_pipeline) -> pd.DataFrame | None:
    """Tree-internal importances, if the final estimator exposes them."""
    model = fitted_pipeline.named_steps.get("model")
    if not hasattr(model, "feature_importances_"):
        return None
    return (
        pd.DataFrame(
            {"feature": FEATURES, "importance": np.round(model.feature_importances_, 4)}
        )
        .sort_values("importance", ascending=False, ignore_index=True)
    )


def fit_surrogate(X_train, y_train, imputation: str = "median") -> Pipeline:
    """An interpretable logistic model fitted alongside the deployed one, so a
    *direction* of effect is available even when the deployed model is an
    ensemble."""
    return Pipeline(
        [
            ("impute", build_imputer(imputation)),
            ("scale", StandardScaler()),
            (
                "model",
                LogisticRegression(max_iter=2000, class_weight="balanced", random_state=RANDOM_STATE),
            ),
        ]
    ).fit(X_train, y_train)


def odds_ratio_view(X_train, y_train, imputation: str = "median") -> pd.DataFrame:
    """Standardised logistic coefficients expressed as an odds ratio per +1 SD."""
    surrogate = fit_surrogate(X_train, y_train, imputation)
    coefs = surrogate.named_steps["model"].coef_[0]
    frame = pd.DataFrame(
        {
            "feature": FEATURES,
            "coefficient": np.round(coefs, 4),
            "odds_ratio_per_sd": np.round(np.exp(coefs), 3),
            "direction": ["increases risk" if c > 0 else "decreases risk" for c in coefs],
        }
    )
    frame["abs_coefficient"] = frame["coefficient"].abs()
    return frame.sort_values("abs_coefficient", ascending=False, ignore_index=True)


def consensus_ranking(perm: pd.DataFrame, impurity: pd.DataFrame | None, odds: pd.DataFrame) -> pd.DataFrame:
    """Average rank across the available views - the chart we actually present."""
    views = {"permutation": perm.set_index("feature")["importance"]}
    if impurity is not None:
        views["impurity"] = impurity.set_index("feature")["importance"]
    views["abs_logit_coef"] = odds.set_index("feature")["abs_coefficient"]

    frame = pd.DataFrame(views).reindex(FEATURES)
    ranks = frame.rank(ascending=False)
    frame["mean_rank"] = ranks.mean(axis=1).round(2)
    # Normalise each view to 0-1 so the three can share one chart axis.
    for col in views:
        span = frame[col].max() - frame[col].min()
        frame[f"{col}_norm"] = ((frame[col] - frame[col].min()) / span).round(3) if span else 0.0
    return frame.sort_values("mean_rank").reset_index().rename(columns={"index": "feature"})


def local_contributions(fitted_pipeline, patient: dict, medians: dict) -> list[dict]:
    """Per-patient occlusion explanation (NOT SHAP - no interaction handling).

    For each feature: how much does predicted risk fall if we replace this
    patient's value with the population median?  A large positive delta means
    that feature is pushing this individual's risk up.
    """
    base_row = pd.DataFrame([{f: patient[f] for f in FEATURES}])[FEATURES]
    base_risk = float(fitted_pipeline.predict_proba(base_row)[0, 1])

    out = []
    for feature in FEATURES:
        perturbed = base_row.copy()
        perturbed.loc[0, feature] = medians[feature]
        risk = float(fitted_pipeline.predict_proba(perturbed)[0, 1])
        out.append(
            {
                "feature": feature,
                "value": float(patient[feature]),
                "median": round(float(medians[feature]), 2),
                "contribution": round(base_risk - risk, 4),
            }
        )
    out.sort(key=lambda d: abs(d["contribution"]), reverse=True)
    return out


def risk_curve(fitted_pipeline, feature: str, medians: dict, lo: float, hi: float, points: int = 40) -> list[dict]:
    """One-dimensional partial-dependence style curve for the web UI: hold every
    other feature at its median and sweep one feature across its range."""
    grid = np.linspace(lo, hi, points)
    rows = []
    template = {f: medians[f] for f in FEATURES}
    frame = pd.DataFrame([template] * points)[FEATURES]
    frame[feature] = grid
    probs = fitted_pipeline.predict_proba(frame)[:, 1]
    for value, prob in zip(grid, probs):
        rows.append({"x": round(float(value), 2), "y": round(float(prob), 4)})
    return rows
