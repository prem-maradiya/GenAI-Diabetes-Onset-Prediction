"""Step 1 - Load the dataset and inspect features and target."""
from __future__ import annotations

import io
import urllib.request

import pandas as pd

from config import DATA_RAW, FEATURES, IMPOSSIBLE_ZERO_COLUMNS, TARGET

SOURCE_URL = (
    "https://raw.githubusercontent.com/jbrownlee/Datasets/master/"
    "pima-indians-diabetes.data.csv"
)
COLUMNS = FEATURES + [TARGET]


def download_if_missing() -> None:
    """Fetch the Pima Indians Diabetes dataset once and cache it on disk."""
    if DATA_RAW.exists():
        return
    DATA_RAW.parent.mkdir(parents=True, exist_ok=True)
    raw = urllib.request.urlopen(SOURCE_URL, timeout=30).read().decode()
    pd.read_csv(io.StringIO(raw), header=None, names=COLUMNS).to_csv(DATA_RAW, index=False)


def load_raw() -> pd.DataFrame:
    """Return the raw dataset exactly as published (zeros still present)."""
    download_if_missing()
    return pd.read_csv(DATA_RAW)


def inspect(df: pd.DataFrame) -> dict:
    """Produce the Step-1 inspection summary used by the notebook and the UI."""
    counts = df[TARGET].value_counts().to_dict()
    positives, negatives = int(counts.get(1, 0)), int(counts.get(0, 0))
    zero_counts = {c: int((df[c] == 0).sum()) for c in IMPOSSIBLE_ZERO_COLUMNS}

    describe = df[FEATURES].describe().T
    feature_stats = {
        col: {
            "mean": round(float(describe.loc[col, "mean"]), 2),
            "std": round(float(describe.loc[col, "std"]), 2),
            "min": round(float(describe.loc[col, "min"]), 2),
            "median": round(float(df[col].median()), 2),
            "max": round(float(describe.loc[col, "max"]), 2),
        }
        for col in FEATURES
    }

    # Class-conditional means: the first evidence of which features separate classes.
    by_class = df.groupby(TARGET)[FEATURES].mean().round(2)
    class_means = {
        col: {
            "non_diabetic": float(by_class.loc[0, col]),
            "diabetic": float(by_class.loc[1, col]),
        }
        for col in FEATURES
    }

    return {
        "n_rows": int(df.shape[0]),
        "n_features": len(FEATURES),
        "target": TARGET,
        "positives": positives,
        "negatives": negatives,
        "positive_rate": round(positives / len(df), 4),
        "duplicate_rows": int(df.duplicated().sum()),
        "declared_nulls": int(df.isna().sum().sum()),
        "impossible_zeros": zero_counts,
        "impossible_zero_pct": {
            c: round(100 * n / len(df), 2) for c, n in zero_counts.items()
        },
        "feature_stats": feature_stats,
        "class_means": class_means,
        "correlation_with_target": {
            col: round(float(df[col].corr(df[TARGET])), 3) for col in FEATURES
        },
    }


if __name__ == "__main__":
    import json

    frame = load_raw()
    print(frame.head())
    print(json.dumps(inspect(frame), indent=2))
