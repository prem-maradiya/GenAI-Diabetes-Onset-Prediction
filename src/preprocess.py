"""Step 2 - Treat biologically impossible zeros as missing values and impute them.

Design rule enforced here: converting 0 -> NaN is a *deterministic domain rule*
(no parameter is learned from the data) so it may safely be applied to the whole
frame before splitting.  The actual imputation *does* learn from the data
(medians, neighbours), so it lives inside a scikit-learn Pipeline and is fitted
on training folds only.  That is what keeps the evaluation leakage-free.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.experimental import enable_iterative_imputer  # noqa: F401
from sklearn.impute import IterativeImputer, KNNImputer, SimpleImputer

from config import FEATURES, IMPOSSIBLE_ZERO_COLUMNS


def mark_missing(df: pd.DataFrame) -> pd.DataFrame:
    """Replace impossible zeros with NaN in the five clinical columns."""
    out = df.copy()
    out[IMPOSSIBLE_ZERO_COLUMNS] = out[IMPOSSIBLE_ZERO_COLUMNS].replace(0, np.nan)
    return out


def missingness_report(df: pd.DataFrame) -> pd.DataFrame:
    """Per-column missing counts after `mark_missing`, sorted worst-first."""
    flagged = mark_missing(df)
    rows = []
    for col in FEATURES:
        n_missing = int(flagged[col].isna().sum())
        rows.append(
            {
                "feature": col,
                "missing": n_missing,
                "missing_pct": round(100 * n_missing / len(df), 2),
                "treated_as_missing": col in IMPOSSIBLE_ZERO_COLUMNS,
            }
        )
    return pd.DataFrame(rows).sort_values("missing", ascending=False, ignore_index=True)


def missingness_vs_target(df: pd.DataFrame) -> pd.DataFrame:
    """Is a value missing *because* of the outcome?  (MCAR / MAR / MNAR check.)

    If the diabetic rate among rows with a missing Insulin differs sharply from
    rows where it was recorded, the missingness itself carries signal and simple
    imputation silently destroys it - which is why we also keep missing-indicator
    flags as an option.
    """
    flagged = mark_missing(df)
    rows = []
    for col in IMPOSSIBLE_ZERO_COLUMNS:
        mask = flagged[col].isna()
        if mask.sum() == 0:
            continue
        rows.append(
            {
                "feature": col,
                "n_missing": int(mask.sum()),
                "positive_rate_when_missing": round(float(df.loc[mask, "Outcome"].mean()), 3),
                "positive_rate_when_present": round(float(df.loc[~mask, "Outcome"].mean()), 3),
            }
        )
    out = pd.DataFrame(rows)
    out["gap"] = (out["positive_rate_when_missing"] - out["positive_rate_when_present"]).round(3)
    return out


def build_imputer(strategy: str = "median", add_indicator: bool = False):
    """Return an unfitted imputer.  Fitted inside a Pipeline -> no leakage."""
    if strategy == "median":
        return SimpleImputer(strategy="median", add_indicator=add_indicator)
    if strategy == "mean":
        return SimpleImputer(strategy="mean", add_indicator=add_indicator)
    if strategy == "knn":
        return KNNImputer(n_neighbors=5, weights="distance", add_indicator=add_indicator)
    if strategy == "iterative":
        return IterativeImputer(
            max_iter=15, random_state=42, sample_posterior=False, add_indicator=add_indicator
        )
    raise ValueError(f"Unknown imputation strategy: {strategy!r}")


def imputed_frame(df: pd.DataFrame, strategy: str = "median") -> pd.DataFrame:
    """Convenience: a fully imputed copy for plots / export (not for scoring)."""
    flagged = mark_missing(df)
    imputer = build_imputer(strategy)
    values = imputer.fit_transform(flagged[FEATURES])
    out = pd.DataFrame(values, columns=FEATURES, index=df.index)
    out["Outcome"] = df["Outcome"].values
    return out


if __name__ == "__main__":
    from data_loader import load_raw

    raw = load_raw()
    print(missingness_report(raw).to_string(index=False))
    print()
    print(missingness_vs_target(raw).to_string(index=False))
