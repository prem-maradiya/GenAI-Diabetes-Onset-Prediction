"""Generative layer 1 - synthetic minority patients with deep generative models.

The question the jury asked: does a *learned* generator of patients (CTGAN,
TVAE) help a recall-first screener more than SMOTE's straight-line
interpolation, or than no augmentation at all?

How the comparison is kept honest
---------------------------------
* Every generator is fitted **inside each training fold only**, on the
  imputed diabetic patients of that fold.  Validation patients are never seen
  by the generator, so a synthetic row cannot leak a validation patient.
* Every variant uses the same Random Forest and the same 5 stratified folds.
* Synthetic rows are only ever used for *training*.  Every score below is
  measured on real, held-out patients.
* Each variant gets its own recall-first threshold (max recall s.t.
  precision >= 0.50) on its out-of-fold probabilities, because a fixed 0.50
  cut-off would reward whichever method happens to shift probabilities up.

Generators compared
-------------------
  none (class weights)   the deployed model - re-weighting, no new rows
  none (unweighted)      the naive baseline
  SMOTE                  interpolates between a patient and a neighbour
  Gaussian Copula        statistical generative model (marginals + correlation)
  CTGAN                  conditional GAN for tabular data (generator vs critic)
  TVAE                   variational autoencoder for tabular data

Fidelity and privacy of the synthetic patients are measured as well:
  * per-feature Kolmogorov-Smirnov statistic (0 = identical distributions)
  * discriminator AUC - can a classifier tell real from synthetic? (0.5 = no)
  * distance to closest real record (DCR) - is the generator copying patients?
"""
from __future__ import annotations

import logging
import os
import warnings

import numpy as np
import pandas as pd
from imblearn.over_sampling import SMOTE
from scipy.stats import ks_2samp
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.metrics import roc_auc_score
from sklearn.preprocessing import StandardScaler

from config import CV_FOLDS, FEATURES, MIN_PRECISION, RANDOM_STATE
from evaluate import classification_report_dict

warnings.filterwarnings("ignore")
logging.getLogger("sdv").setLevel(logging.ERROR)
logging.getLogger("rdt").setLevel(logging.ERROR)
logging.getLogger("copulas").setLevel(logging.ERROR)
os.environ.setdefault("SDV_DISABLE_TELEMETRY", "1")
os.environ.setdefault("LOKY_MAX_CPU_COUNT", str(os.cpu_count() or 4))

GENERATIVE_EPOCHS = 300

VARIANTS = [
    "none (class weights)",
    "none (unweighted)",
    "SMOTE",
    "Gaussian Copula",
    "CTGAN",
    "TVAE",
]

VARIANT_NOTES = {
    "none (class weights)": "Deployed model. Re-weights real patients; generates nothing.",
    "none (unweighted)": "Naive baseline - the minority class is simply outnumbered.",
    "SMOTE": "Interpolates on the straight line between a patient and a neighbour.",
    "Gaussian Copula": "Statistical generator: per-feature marginals joined by a correlation matrix.",
    "CTGAN": "Conditional GAN: a generator learns to fool a critic that sees real patients.",
    "TVAE": "Variational autoencoder: encodes patients to a latent space and samples from it.",
}


def _forest(weighted: bool) -> RandomForestClassifier:
    """The deployed forest's hyper-parameters, with or without class weights."""
    return RandomForestClassifier(
        n_estimators=500,
        max_depth=6,
        min_samples_leaf=4,
        class_weight="balanced_subsample" if weighted else None,
        random_state=RANDOM_STATE,
        n_jobs=-1,
    )


def _seed_everything(seed: int = RANDOM_STATE) -> None:
    np.random.seed(seed)
    try:
        import torch

        torch.manual_seed(seed)
    except ImportError:  # pragma: no cover - torch ships with sdv
        pass


def fit_generator(kind: str, minority: pd.DataFrame, epochs: int = GENERATIVE_EPOCHS):
    """Fit one SDV synthesizer on real (imputed) diabetic patients."""
    from sdv.metadata import Metadata
    from sdv.single_table import CTGANSynthesizer, GaussianCopulaSynthesizer, TVAESynthesizer

    _seed_everything()
    metadata = Metadata.load_from_dict(
        {
            "tables": {
                "patients": {
                    "columns": {
                        f: {"sdtype": "numerical"}
                        for f in FEATURES
                    }
                }
            }
        }
    )

    if kind == "CTGAN":
        model = CTGANSynthesizer(metadata, epochs=epochs, batch_size=50, verbose=False, enable_gpu=False)
    elif kind == "TVAE":
        model = TVAESynthesizer(metadata, epochs=epochs, batch_size=50, enable_gpu=False)
    elif kind == "Gaussian Copula":
        model = GaussianCopulaSynthesizer(metadata, default_distribution="beta")
    else:
        raise ValueError(kind)
    model.fit({"patients": minority})
    return model


def sample_generator(model, n: int) -> pd.DataFrame:
    _seed_everything()
    rows = model.sample(num_rows=int(n))
    if isinstance(rows, dict):  # SDV 2.x returns {table_name: frame}
        rows = rows["patients"]
    return rows[FEATURES].astype(float)


def _augment(variant: str, X_imp: pd.DataFrame, y: pd.Series):
    """Return (X, y, weighted) to train the forest on, for one training fold."""
    if variant == "none (class weights)":
        return X_imp, y, True
    if variant == "none (unweighted)":
        return X_imp, y, False

    n_needed = int((y == 0).sum() - (y == 1).sum())
    if variant == "SMOTE":
        X_res, y_res = SMOTE(random_state=RANDOM_STATE, k_neighbors=5).fit_resample(X_imp, y)
        return pd.DataFrame(X_res, columns=FEATURES), pd.Series(y_res), False

    minority = X_imp[y.values == 1].reset_index(drop=True)
    generator = fit_generator(variant, minority)
    synthetic = sample_generator(generator, n_needed)
    X_aug = pd.concat([X_imp.reset_index(drop=True), synthetic], ignore_index=True)
    y_aug = pd.concat(
        [y.reset_index(drop=True), pd.Series(np.ones(len(synthetic), dtype=int))],
        ignore_index=True,
    )
    return X_aug, y_aug, False


def _best_recall_at_guard(y_true, proba) -> dict:
    """Recall-first operating point for one variant (same rule as the deployed model)."""
    best = None
    for t in np.round(np.arange(0.05, 0.96, 0.01), 2):
        s = classification_report_dict(y_true, proba, float(t))
        if s["precision"] < MIN_PRECISION:
            continue
        key = (s["recall"], s["precision"])
        if best is None or key > (best["recall"], best["precision"]):
            best = s
    return best or classification_report_dict(y_true, proba, 0.5)


def compare_augmentation(X_train: pd.DataFrame, y_train: pd.Series, log=print) -> pd.DataFrame:
    """Out-of-fold comparison of every augmentation strategy on real patients."""
    cv = StratifiedKFold(n_splits=CV_FOLDS, shuffle=True, random_state=RANDOM_STATE)
    y_train = y_train.reset_index(drop=True)
    X_train = X_train.reset_index(drop=True)
    oof = {v: np.zeros(len(y_train)) for v in VARIANTS}
    synthetic_rows = {v: 0 for v in VARIANTS}

    for fold, (tr, va) in enumerate(cv.split(X_train, y_train), start=1):
        imputer = SimpleImputer(strategy="median").fit(X_train.iloc[tr])
        X_tr = pd.DataFrame(imputer.transform(X_train.iloc[tr]), columns=FEATURES)
        X_va = pd.DataFrame(imputer.transform(X_train.iloc[va]), columns=FEATURES)
        y_tr = y_train.iloc[tr].reset_index(drop=True)
        for variant in VARIANTS:
            X_fit, y_fit, weighted = _augment(variant, X_tr, y_tr)
            synthetic_rows[variant] += len(X_fit) - len(X_tr)
            model = _forest(weighted).fit(X_fit, y_fit)
            oof[variant][va] = model.predict_proba(X_va)[:, 1]
        log(f"fold {fold}/{CV_FOLDS} done")

    rows = []
    for variant in VARIANTS:
        at_half = classification_report_dict(y_train, oof[variant], 0.5)
        tuned = _best_recall_at_guard(y_train, oof[variant])
        rows.append(
            {
                "variant": variant,
                "synthetic_rows_per_fold": int(round(synthetic_rows[variant] / CV_FOLDS)),
                "recall_at_050": at_half["recall"],
                "precision_at_050": at_half["precision"],
                "f2_at_050": at_half["f2"],
                "tuned_threshold": tuned["threshold"],
                "recall_tuned": tuned["recall"],
                "precision_tuned": tuned["precision"],
                "f2_tuned": tuned["f2"],
                "missed_tuned": tuned["fn"],
                "roc_auc": at_half["roc_auc"],
                "pr_auc": at_half["pr_auc"],
                "brier": at_half["brier"],
                "note": VARIANT_NOTES[variant],
            }
        )
    return pd.DataFrame(rows)


# --------------------------------------------------------------------------- #
# Fidelity and privacy of the generated patients
# --------------------------------------------------------------------------- #
def _discriminator_auc(real: pd.DataFrame, fake: pd.DataFrame) -> float:
    """Cross-validated AUC of a classifier asked to spot the synthetic rows."""
    X = pd.concat([real, fake], ignore_index=True)
    y = np.r_[np.zeros(len(real)), np.ones(len(fake))]
    clf = RandomForestClassifier(n_estimators=300, max_depth=6, random_state=RANDOM_STATE, n_jobs=-1)
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)
    proba = cross_val_predict(clf, X, y, cv=cv, method="predict_proba")[:, 1]
    return float(roc_auc_score(y, proba))


def _dcr(real: pd.DataFrame, fake: pd.DataFrame) -> dict:
    """Distance from each synthetic row to its closest real row (standardised).

    Compared against the real-to-real nearest-neighbour distance: a generator
    whose synthetic rows sit much closer to real patients than real patients sit
    to each other is memorising, which is a privacy problem.
    """
    scaler = StandardScaler().fit(real)
    R = scaler.transform(real)
    F = scaler.transform(fake)
    d_fake = np.sqrt(((F[:, None, :] - R[None, :, :]) ** 2).sum(-1)).min(1)
    d_rr = np.sqrt(((R[:, None, :] - R[None, :, :]) ** 2).sum(-1))
    np.fill_diagonal(d_rr, np.inf)
    d_real = d_rr.min(1)
    return {
        "median_dcr_synthetic": round(float(np.median(d_fake)), 3),
        "median_nn_real": round(float(np.median(d_real)), 3),
        "exact_copies": int((d_fake < 1e-6).sum()),
    }


def fidelity_report(X_train: pd.DataFrame, y_train: pd.Series, n: int = 400) -> dict:
    """Fit each generator on every training diabetic and audit what it produces."""
    imputer = SimpleImputer(strategy="median").fit(X_train)
    X_imp = pd.DataFrame(imputer.transform(X_train), columns=FEATURES)
    minority = X_imp[y_train.reset_index(drop=True).values == 1].reset_index(drop=True)

    samples, summary = {}, []
    smote_X, smote_y = SMOTE(random_state=RANDOM_STATE).fit_resample(X_imp, y_train.values)
    smote_new = pd.DataFrame(smote_X[len(X_imp):], columns=FEATURES)
    samples["SMOTE"] = smote_new.sample(min(n, len(smote_new)), random_state=RANDOM_STATE, replace=len(smote_new) < n)

    for kind in ["Gaussian Copula", "CTGAN", "TVAE"]:
        samples[kind] = sample_generator(fit_generator(kind, minority), n)

    for kind, fake in samples.items():
        ks = {f: round(float(ks_2samp(minority[f], fake[f]).statistic), 3) for f in FEATURES}
        summary.append(
            {
                "generator": kind,
                "mean_ks": round(float(np.mean(list(ks.values()))), 3),
                "discriminator_auc": round(_discriminator_auc(minority, fake), 3),
                **_dcr(minority, fake),
                "ks_by_feature": ks,
            }
        )

    # Small, plottable distributions for the dashboard: real vs each generator.
    dists = {}
    for feature in ["Glucose", "BMI", "Age", "Insulin"]:
        dists[feature] = {
            "real": [round(float(v), 2) for v in minority[feature]],
            **{k: [round(float(v), 2) for v in s[feature].head(250)] for k, s in samples.items()},
        }
    return {"summary": summary, "distributions": dists, "n_real_minority": int(len(minority)), "samples": samples}


if __name__ == "__main__":
    import sys
    from pathlib import Path

    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from data_loader import load_raw
    from train import make_split

    X_tr, X_te, y_tr, y_te = make_split(load_raw())
    table = compare_augmentation(X_tr, y_tr)
    print(table.drop(columns=["note"]).to_string(index=False))
    fid = fidelity_report(X_tr, y_tr)
    print(pd.DataFrame(fid["summary"]).drop(columns=["ks_by_feature"]).to_string(index=False))
