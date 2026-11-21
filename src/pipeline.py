"""End-to-end runner: executes Steps 1-6 and writes every artefact.

    python src/pipeline.py

Produces
    models/diabetes_model.joblib   deployed pipeline (imputer -> model)
    models/model_card.json         what it is, what it is for, where it fails
    reports/metrics.json           every number quoted in the notebook and UI
    reports/figures/*.png          the report figures
    app/static/data/results.json   the bundle the web dashboard reads
    data/processed/pima_imputed.csv
"""
from __future__ import annotations

import json
import os
import sys
import time

# joblib otherwise shells out to wmic to count cores on Windows and prints a traceback
os.environ.setdefault("LOKY_MAX_CPU_COUNT", str(os.cpu_count() or 4))
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import joblib
import numpy as np
import pandas as pd
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler

import plots
import plots_genai
from config import (
    CLINICAL_RANGES,
    COST_FALSE_NEGATIVE,
    COST_FALSE_POSITIVE,
    CV_FOLDS,
    DATA_PROCESSED,
    FEATURE_META,
    FEATURES,
    METRICS_PATH,
    MIN_PRECISION,
    MODEL_CARD_PATH,
    MODEL_PATH,
    RANDOM_STATE,
    ROOT,
    TEST_SIZE,
    ensure_dirs,
)
from data_loader import inspect, load_raw
from evaluate import (
    calibration_table,
    classification_report_dict,
    confusion_frame,
    curve_points,
    screening_impact,
)
from explain import (
    consensus_ranking,
    fit_surrogate,
    impurity_view,
    odds_ratio_view,
    permutation_view,
    risk_curve,
)
from genai_explain import global_shap
from rigour import (
    PREVALENCE_SCENARIOS,
    REVALIDATION_PROTOCOL,
    bootstrap_ci,
    calibration_comparison,
    decision_curve,
    external_validation,
    prevalence_curve,
    prevalence_transport,
)
from synthetic import VARIANT_NOTES, compare_augmentation, fidelity_report
from preprocess import (
    imputed_frame,
    mark_missing,
    missingness_report,
    missingness_vs_target,
)
from train import (
    candidate_models,
    choose_threshold,
    compare_imputation,
    compare_models,
    make_split,
    select_model,
)

WEB_DATA = ROOT / "app" / "static" / "data" / "results.json"
WEB_SURROGATE = ROOT / "app" / "static" / "data" / "surrogate.json"


def export_surrogate(X_train, y_train, medians: dict) -> None:
    """Export the interpretable logistic model as plain JSON.

    The dashboard calls the Flask API for real Random-Forest scores; this
    surrogate is the browser-side fallback so the page still demonstrates the
    input-to-risk flow when the server is not running.  It is labelled as a
    surrogate in the UI - it is not the deployed model.
    """
    surrogate = fit_surrogate(X_train, y_train)
    scaler = surrogate.named_steps["scale"]
    model = surrogate.named_steps["model"]
    imputer = surrogate.named_steps["impute"]

    payload = {
        "note": "Standardised logistic surrogate - browser fallback only, not the deployed model.",
        "features": FEATURES,
        "mean": [round(float(v), 6) for v in scaler.mean_],
        "scale": [round(float(v), 6) for v in scaler.scale_],
        "coef": [round(float(v), 6) for v in model.coef_[0]],
        "intercept": round(float(model.intercept_[0]), 6),
        "medians": {k: round(float(v), 4) for k, v in medians.items()},
        "train_medians": {
            f: round(float(v), 4) for f, v in zip(FEATURES, imputer.statistics_)
        },
    }
    WEB_SURROGATE.parent.mkdir(parents=True, exist_ok=True)
    WEB_SURROGATE.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def log(step: str, message: str) -> None:
    print(f"[{step}] {message}", flush=True)


def to_records(frame: pd.DataFrame) -> list[dict]:
    return json.loads(frame.to_json(orient="records"))


def main(fast: bool = False) -> dict:
    started = time.time()
    cached = json.loads(METRICS_PATH.read_text(encoding="utf-8")) if (fast and METRICS_PATH.exists()) else {}
    ensure_dirs()
    WEB_DATA.parent.mkdir(parents=True, exist_ok=True)

    # ---------------- Step 1 - load and inspect ---------------------------- #
    log("Step 1", "Loading the Pima Indians Diabetes dataset")
    raw = load_raw()
    overview = inspect(raw)
    log("Step 1", f"{overview['n_rows']} rows, {overview['n_features']} features, "
                  f"{overview['positives']} positive ({overview['positive_rate']:.1%})")

    # ---------------- Step 2 - impossible zeros -> missing ----------------- #
    log("Step 2", "Flagging biologically impossible zeros and imputing")
    miss_report = missingness_report(raw)
    miss_target = missingness_vs_target(raw)
    flagged = mark_missing(raw)
    imputed = imputed_frame(raw, "median")
    imputed.to_csv(DATA_PROCESSED, index=False)
    log("Step 2", f"{int(miss_report['missing'].sum())} values recovered as missing "
                  f"across {int((miss_report['missing'] > 0).sum())} columns")

    # ---------------- Step 3 - train and evaluate for recall --------------- #
    log("Step 3", f"Stratified split: {1 - TEST_SIZE:.0%} train / {TEST_SIZE:.0%} test")
    X_train, X_test, y_train, y_test = make_split(raw)

    log("Step 3", f"Cross-validating 7 models with {CV_FOLDS}-fold stratified CV")
    comparison, oof = compare_models(X_train, y_train)
    selection = select_model(comparison)
    log("Step 3", f"Selected: {selection['model']}  (CV recall {selection['cv_recall']:.3f}, "
                  f"F2 {selection['cv_f2']:.3f})")

    log("Step 3", "Comparing imputation strategies on the selected model family")
    imputation_table = compare_imputation(X_train, y_train, "Random Forest")

    log("Step 3", "Tuning the decision threshold on out-of-fold probabilities")
    thresholds = choose_threshold(y_train, oof[selection["model"]])
    sweep = thresholds.pop("sweep")
    tuned = thresholds["recall_first"]
    log("Step 3", f"Threshold {tuned:.2f} chosen ({thresholds['rule']})")

    log("Step 3", "Refitting on the full training set and scoring the untouched test set")
    pipeline = candidate_models()[selection["model"]]["pipeline"]
    pipeline.fit(X_train, y_train)
    test_proba = pipeline.predict_proba(X_test)[:, 1]

    metrics_default = classification_report_dict(y_test, test_proba, 0.5)
    metrics_tuned = classification_report_dict(y_test, test_proba, tuned)
    curves = curve_points(y_test, test_proba)
    calibration = calibration_table(y_test, test_proba, bins=6)
    impact_default = screening_impact(metrics_default)
    impact_tuned = screening_impact(metrics_tuned)
    log("Step 3", f"TEST recall: {metrics_default['recall']:.3f} @0.50  ->  "
                  f"{metrics_tuned['recall']:.3f} @{tuned:.2f}   "
                  f"(missed {metrics_default['fn']} -> {metrics_tuned['fn']} of "
                  f"{metrics_default['tp'] + metrics_default['fn']} real cases)")

    # ---------------- Step 4 - feature importance -------------------------- #
    log("Step 4", "Computing permutation, impurity and odds-ratio importances")
    perm = permutation_view(pipeline, X_test, y_test, scoring="recall", n_repeats=30)
    impurity = impurity_view(pipeline)
    odds = odds_ratio_view(X_train, y_train)
    consensus = consensus_ranking(perm, impurity, odds)
    top3 = list(consensus["feature"].head(3))
    log("Step 4", f"Consensus top drivers: {', '.join(top3)}")

    medians = {f: float(flagged[f].median()) for f in FEATURES}
    curves_by_feature = {
        f: risk_curve(pipeline, f, medians, FEATURE_META[f]["min"], FEATURE_META[f]["max"])
        for f in top3
    }

    # ---------------- Generative layer: synthetic patients ----------------- #
    if fast and "step3_synthetic" in cached:
        log("GenAI", "Re-using cached CTGAN / TVAE comparison (--fast)")
        synthetic_table = pd.DataFrame(cached["step3_synthetic"])
        fidelity = cached["step3_synthetic_fidelity"]
    else:
        log("GenAI", "Fitting CTGAN, TVAE and Gaussian-Copula generators inside each CV fold (~4 min)")
        synthetic_table = compare_augmentation(X_train, y_train, log=lambda m: log("GenAI", m))
        fidelity = fidelity_report(X_train, y_train)
        fidelity.pop("samples", None)
    best_gen = synthetic_table.sort_values("recall_tuned", ascending=False).iloc[0]
    log("GenAI", f"Best augmentation by recall: {best_gen['variant']} ({best_gen['recall_tuned']:.3f})")

    # ---------------- Evaluation rigour ------------------------------------ #
    log("Rigour", "Bootstrap 95% CIs, calibration, decision curve, transportability")
    ci_tuned = bootstrap_ci(y_test, test_proba, tuned)
    ci_default = bootstrap_ci(y_test, test_proba, 0.5)
    calibration_cmp = calibration_comparison(
        lambda: candidate_models()[selection["model"]]["pipeline"],
        X_train, y_train, X_test, y_test, test_proba,
    )
    dca = decision_curve(y_test, test_proba)
    transport = prevalence_transport(metrics_tuned["recall"], metrics_tuned["specificity"])
    transport_curve = prevalence_curve(metrics_tuned["recall"], metrics_tuned["specificity"])
    external = external_validation(pipeline, tuned)
    log("Rigour", f"Recall {ci_tuned['recall']['point']:.3f} "
                  f"[{ci_tuned['recall']['lo']:.3f}-{ci_tuned['recall']['hi']:.3f}]; "
                  f"external datasets scored: {len(external)}")

    log("Step 4", "TreeSHAP on the held-out patients")
    shap_global, shap_beeswarm = global_shap(pipeline, X_test)

    # Latent-space view (syllabus link: latent representations)
    latent_input = StandardScaler().fit_transform(imputed[FEATURES])
    pca = PCA(n_components=2, random_state=RANDOM_STATE)
    components = pca.fit_transform(latent_input)

    # ---------------- Figures ---------------------------------------------- #
    log("Figures", "Rendering report figures")
    figures = {
        "class_balance": plots.plot_class_balance(raw),
        "feature_distributions": plots.plot_feature_distributions(imputed),
        "missingness": plots.plot_missingness(miss_report),
        "imputation_effect": plots.plot_imputation_effect(raw, flagged, imputed),
        "correlation": plots.plot_correlation(imputed),
        "model_comparison": plots.plot_model_comparison(comparison),
        "imputation_comparison": plots.plot_imputation_comparison(imputation_table),
        "threshold_sweep": plots.plot_threshold_sweep(sweep, tuned),
        "cost_curve": plots.plot_cost_curve(sweep, tuned),
        "confusion_pair": plots.plot_confusion_pair(
            confusion_frame(y_test, test_proba, 0.5).values,
            confusion_frame(y_test, test_proba, tuned).values,
            0.5, tuned,
        ),
        "roc_pr": plots.plot_roc_pr(curves, float(np.mean(y_test))),
        "calibration": plots.plot_calibration(calibration),
        "feature_importance": plots.plot_feature_importance(perm),
        "importance_consensus": plots.plot_importance_consensus(consensus),
        "risk_curves": plots.plot_risk_curves(curves_by_feature),
        "latent_space": plots.plot_latent_space(
            components, imputed["Outcome"].values, pca.explained_variance_ratio_
        ),
        "screening_impact": plots.plot_impact(impact_default, impact_tuned),
        "synthetic_comparison": plots_genai.plot_synthetic_comparison(synthetic_table),
        "synthetic_fidelity": plots_genai.plot_synthetic_fidelity(fidelity),
        "bootstrap_ci": plots_genai.plot_bootstrap_ci(ci_tuned),
        "calibration_comparison": plots_genai.plot_calibration_comparison(calibration_cmp),
        "decision_curve": plots_genai.plot_decision_curve(
            dca, tuned, COST_FALSE_POSITIVE / (COST_FALSE_POSITIVE + COST_FALSE_NEGATIVE)
        ),
        "shap_summary": plots_genai.plot_shap_summary(shap_global, shap_beeswarm),
        "prevalence_transport": plots_genai.plot_prevalence_transport(
            transport_curve, transport, MIN_PRECISION, tuned
        ),
    }
    figures = {k: str(Path(v).relative_to(ROOT)).replace("\\", "/") for k, v in figures.items()}
    log("Figures", f"{len(figures)} figures written to reports/figures/")

    # ---------------- Persist model + metrics ------------------------------ #
    bundle = {
        "pipeline": pipeline,
        "threshold": tuned,
        "features": FEATURES,
        "medians": medians,
        "model_name": selection["model"],
    }
    joblib.dump(bundle, MODEL_PATH)
    log("Save", f"Model bundle -> {MODEL_PATH.relative_to(ROOT)}")

    export_surrogate(X_train, y_train, medians)
    log("Save", "Logistic surrogate exported for the browser fallback")

    results = {
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "runtime_seconds": round(time.time() - started, 1),
        "config": {
            "test_size": TEST_SIZE,
            "cv_folds": CV_FOLDS,
            "random_state": RANDOM_STATE,
            "cost_fn": COST_FALSE_NEGATIVE,
            "cost_fp": COST_FALSE_POSITIVE,
            "min_precision": MIN_PRECISION,
        },
        "step1_overview": overview,
        "step2_missingness": to_records(miss_report),
        "step2_missing_vs_target": to_records(miss_target),
        "step2_medians": {k: round(v, 2) for k, v in medians.items()},
        "step3_model_comparison": to_records(comparison),
        "step3_selection": selection,
        "step3_imputation_comparison": to_records(imputation_table),
        "step3_thresholds": thresholds,
        "step3_threshold_sweep": to_records(
            sweep[["threshold", "recall", "precision", "f1", "f2", "cost", "fn", "fp", "tp", "tn"]]
        ),
        "step3_test_default": metrics_default,
        "step3_test_tuned": metrics_tuned,
        "step3_curves": curves,
        "step3_calibration": to_records(calibration),
        "step3_confusion_default": confusion_frame(y_test, test_proba, 0.5).values.tolist(),
        "step3_confusion_tuned": confusion_frame(y_test, test_proba, tuned).values.tolist(),
        "step3_impact_default": impact_default,
        "step3_impact_tuned": impact_tuned,
        "step3_synthetic": to_records(synthetic_table),
        "step3_synthetic_fidelity": fidelity,
        "step3_ci_tuned": ci_tuned,
        "step3_ci_default": ci_default,
        "step3_calibration_comparison": calibration_cmp,
        "step3_decision_curve": dca,
        "step5_transport": transport,
        "step5_transport_curve": transport_curve,
        "step5_revalidation_protocol": REVALIDATION_PROTOCOL,
        "step5_external_validation": external,
        "step4_shap_global": shap_global,
        "step4_shap_beeswarm": shap_beeswarm,
        "step4_permutation": to_records(perm),
        "step4_impurity": to_records(impurity) if impurity is not None else [],
        "step4_odds_ratio": to_records(odds),
        "step4_consensus": to_records(consensus),
        "step4_risk_curves": curves_by_feature,
        "step4_top_drivers": top3,
        "latent_space": {
            "explained_variance": [round(float(v), 4) for v in pca.explained_variance_ratio_],
            "points": [
                {"x": round(float(a), 3), "y": round(float(b), 3), "c": int(c)}
                for a, b, c in zip(components[:, 0], components[:, 1], imputed["Outcome"].values)
            ],
        },
        "feature_meta": FEATURE_META,
        "clinical_ranges": CLINICAL_RANGES,
        "figures": figures,
        "split": {
            "train_rows": int(len(X_train)),
            "test_rows": int(len(X_test)),
            "train_positives": int(y_train.sum()),
            "test_positives": int(y_test.sum()),
        },
    }

    METRICS_PATH.write_text(json.dumps(results, indent=2), encoding="utf-8")
    WEB_DATA.write_text(json.dumps(results), encoding="utf-8")
    log("Save", f"Metrics -> {METRICS_PATH.relative_to(ROOT)} and the web bundle")

    # ---------------- Steps 5 & 6 - ethics and lifecycle ------------------- #
    write_model_card(results)
    log("Step 5", "Model card written (intended use, limitations, false-negative policy)")
    log("Step 6", f"Supervised-learning lifecycle complete in {results['runtime_seconds']}s")
    return results


def write_model_card(results: dict) -> None:
    """Step 5 - the ethics artefact, stored next to the weights it describes."""
    tuned = results["step3_test_tuned"]
    card = {
        "model_name": "Diabetes Onset Risk Screener",
        "version": "2.0",
        "date": results["generated_at"],
        "model_type": results["step3_selection"]["model"],
        "task": "Binary classification - probability of diabetes onset",
        "training_data": {
            "dataset": "Pima Indians Diabetes Database (UCI / NIDDK)",
            "population": "Female patients of Pima Indian heritage, at least 21 years old",
            "rows": results["step1_overview"]["n_rows"],
            "positive_rate": results["step1_overview"]["positive_rate"],
        },
        "intended_use": (
            "Educational demonstration of a recall-first screening triage. It ranks "
            "patients for a confirmatory blood test; it is a prioritisation aid, not a "
            "diagnosis."
        ),
        "out_of_scope_uses": [
            "Any real clinical diagnosis or treatment decision",
            "Insurance pricing, employment screening or eligibility decisions",
            "Populations unlike the training cohort (men, under-21s, other ancestries)",
        ],
        "operating_point": {
            "threshold": results["step3_thresholds"]["recall_first"],
            "rule": results["step3_thresholds"]["rule"],
            "test_recall": tuned["recall"],
            "test_precision": tuned["precision"],
            "test_specificity": tuned["specificity"],
            "missed_cases_on_test": tuned["fn"],
            "per_10k_missed": results["step3_impact_tuned"]["missed_cases"],
            "per_10k_false_alarms": results["step3_impact_tuned"]["false_alarms"],
        },
        "ethical_considerations": {
            "false_negative_harm": (
                "A missed case is told they are healthy and exits the screening funnel; "
                "harm compounds silently over years. This is why the threshold is tuned "
                "for recall and why the model must never be the last check."
            ),
            "false_positive_harm": (
                "Anxiety plus one confirmatory test. Real but recoverable - which is why "
                "we accept more of them."
            ),
            "representation": (
                "A single-ancestry, female-only cohort. Applying this model to any other "
                "population is extrapolation, not prediction."
            ),
            "automation_bias": (
                "A clinician who sees 'low risk' may stop looking. The UI therefore shows "
                "a probability with its uncertainty, never a bare 'negative'."
            ),
            "data_provenance": (
                "The impossible zeros prove the source data was silently corrupted. Any "
                "deployment needs the same audit on its own intake pipeline."
            ),
        },
        "limitations": [
            f"Only {results['step1_overview']['n_rows']} patients - confidence intervals are wide",
            "Insulin missing in 48.7% of rows; its imputed values are weakly informed",
            "Cross-sectional data: the model predicts a label, not a time-to-onset",
            "No external validation cohort; at Indian prevalence (ICMR-INDIAB 11.4%) precision "
            "at this threshold falls to about 21%, so the cut-off must be re-tuned before any use in India",
            "Synthetic augmentation (CTGAN / TVAE / SMOTE) did not beat class weighting on 214 "
            "diabetic training patients, so the deployed model is trained on real patients only",
        ],
        "generative_components": {
            "llm_explanations": (
                "Patient-facing summaries are written by an LLM from SHAP values and clinical "
                "reference bands only; a fixed clinician-review disclaimer is appended server-side "
                "and a deterministic template is used whenever the LLM is unavailable."
            ),
            "synthetic_data": "CTGAN, TVAE and Gaussian Copula benchmarked against SMOTE and no augmentation.",
        },
        "monitoring_plan": [
            "Track realised recall against confirmed follow-up results every quarter",
            "Alert on feature drift (mean glucose, BMI) versus the training distribution",
            "Re-tune the threshold if prevalence shifts - the cut-off is prevalence-dependent",
        ],
    }
    MODEL_CARD_PATH.write_text(json.dumps(card, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main(fast="--fast" in sys.argv)
