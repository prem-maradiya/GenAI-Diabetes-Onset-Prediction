"""Figures 18-24: the generative layer and the evaluation-rigour additions.

Same light-theme design system as plots.py - tokens and helpers are imported
from there so every figure in the report reads as one set.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from matplotlib.colors import LinearSegmentedColormap

from plots import (
    AXIS, CRITICAL, INK_2, MUTED, S1, S2, S3, S4, S7, SURFACE,
    _save, _style, _title, plt,
)

VARIANT_COLOR = {
    "none (class weights)": S1,
    "none (unweighted)": MUTED,
    "SMOTE": S3,
    "Gaussian Copula": S4,
    "CTGAN": S2,
    "TVAE": S7,
}


def plot_synthetic_comparison(table: pd.DataFrame) -> str:
    """Recall at each variant's recall-first threshold, and PR-AUC."""
    fig, axes = plt.subplots(1, 2, figsize=(11.5, 4.6))
    order = table.sort_values("recall_tuned")
    colors = [VARIANT_COLOR[v] for v in order["variant"]]
    for ax, col, label, lo, hi in (
        (axes[0], "recall_tuned", "Out-of-fold recall at its recall-first threshold", 0.80, 0.96),
        (axes[1], "pr_auc", "Out-of-fold PR-AUC (threshold-free)", 0.60, 0.75),
    ):
        bars = ax.barh(order["variant"], order[col], color=colors, height=0.62)
        for b, v in zip(bars, order[col]):
            ax.text(v + 0.002, b.get_y() + b.get_height() / 2, f"{v:.3f}", va="center", fontsize=9, color=INK_2)
        ax.set_xlim(lo, hi)
        ax.set_xlabel(label)
        _style(ax, xgrid=True, ygrid=False)
    _title(axes[0], "Synthetic patients vs class weights",
           "Same forest, same folds; generators fitted inside each training fold only")
    fig.tight_layout()
    return _save(fig, "18_synthetic_comparison.png")


def plot_synthetic_fidelity(fidelity: dict) -> str:
    """Real vs synthetic distributions, plus the realism and privacy audit."""
    fig, axes = plt.subplots(1, 3, figsize=(13.5, 4.4), gridspec_kw={"width_ratios": [1, 1, 1.15]})
    for ax, feature in zip(axes[:2], ["Glucose", "BMI"]):
        d = fidelity["distributions"][feature]
        bins = np.linspace(min(d["real"]), max(d["real"]), 22)
        ax.hist(d["real"], bins=bins, density=True, color=AXIS, label="Real diabetic patients")
        for kind in ["SMOTE", "CTGAN", "TVAE"]:
            hist, edges = np.histogram(np.asarray(d[kind]), bins=bins, density=True)
            ax.plot((edges[:-1] + edges[1:]) / 2, hist, color=VARIANT_COLOR[kind], linewidth=2, label=kind)
        ax.set_xlabel(feature)
        ax.set_yticks([])
        _style(ax, ygrid=False)
    axes[0].legend(loc="upper right", fontsize=8)
    _title(axes[0], "Real vs generated patients", "Density of the diabetic class")

    ax = axes[2]
    s = pd.DataFrame(fidelity["summary"]).set_index("generator")
    gens = list(s.index)
    x = np.arange(len(gens))
    ratio = s["median_dcr_synthetic"] / s["median_nn_real"]
    ax.bar(x - 0.2, s["discriminator_auc"], width=0.38, color=S2, label="Discriminator AUC (0.5 = indistinguishable)")
    ax.bar(x + 0.2, ratio, width=0.38, color=S1, label="Nearest-real distance ratio (<1 = closer than real patients are)")
    ax.axhline(0.5, color=MUTED, linewidth=1, linestyle=(0, (4, 3)))
    ax.axhline(1.0, color=MUTED, linewidth=1, linestyle=(0, (1, 2)))
    ax.set_xticks(x, gens, fontsize=9)
    ax.set_ylim(0, 1.75)
    ax.legend(loc="upper left", fontsize=7.8)
    _style(ax)
    _title(ax, "Realism and privacy audit", "Fitted on all 214 training diabetics")
    fig.tight_layout()
    return _save(fig, "19_synthetic_fidelity.png")


def plot_bootstrap_ci(ci: dict) -> str:
    keys = [("recall", "Recall"), ("precision", "Precision"), ("specificity", "Specificity"),
            ("f2", "F2 score"), ("roc_auc", "ROC-AUC"), ("accuracy", "Accuracy")]
    fig, ax = plt.subplots(figsize=(8.2, 4.2))
    for i, (k, label) in enumerate(keys[::-1]):
        c = ci[k]
        color = S1 if k == "recall" else INK_2
        ax.plot([c["lo"], c["hi"]], [i, i], color=color, linewidth=3.2, solid_capstyle="round", alpha=0.45)
        ax.plot(c["point"], i, "o", color=color, markersize=9, markeredgecolor=SURFACE, markeredgewidth=2)
        ax.text(c["hi"] + 0.012, i, f"{c['point']:.3f}   [{c['lo']:.3f} - {c['hi']:.3f}]",
                va="center", fontsize=9, color=INK_2)
    ax.set_yticks(range(len(keys)), [lbl for _, lbl in keys[::-1]])
    ax.set_xlim(0.35, 1.22)
    ax.set_xlabel(f"Held-out test metric at threshold {ci['threshold']:.2f}  "
                  f"(95% percentile bootstrap, {ci['n_boot']} resamples)")
    _style(ax, xgrid=True, ygrid=False)
    _title(ax, "How sure are we? Bootstrap confidence intervals",
           "154 test patients, 54 diabetic - every headline number carries an interval")
    return _save(fig, "20_bootstrap_ci.png")


def plot_calibration_comparison(cal: dict) -> str:
    fig, ax = plt.subplots(figsize=(6.8, 4.9))
    ax.plot([0, 1], [0, 1], color=MUTED, linewidth=1.2, linestyle=(0, (4, 3)), label="Perfect calibration")
    for key, color, label in (("raw", S1, "Deployed forest"), ("isotonic", S2, "Isotonic-calibrated copy")):
        t = pd.DataFrame(cal[key]["curve"])
        st = cal[key]
        ax.plot(t["mean_predicted"], t["observed_rate"], color=color, linewidth=2, marker="o", markersize=7,
                markeredgecolor=SURFACE, markeredgewidth=2,
                label=f"{label}  (Brier {st['brier']:.3f}, slope {st['slope']:.2f})")
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.set_xlabel("Mean predicted probability")
    ax.set_ylabel("Observed diabetes rate")
    ax.legend(loc="upper left", fontsize=8.5)
    _style(ax)
    _title(ax, "Calibration curve on the held-out test set",
           "Brier score and calibration slope (1.0 = perfectly calibrated)")
    return _save(fig, "21_calibration_comparison.png")


def plot_decision_curve(rows: list, chosen: float, cost_point: float) -> str:
    t = pd.DataFrame(rows)
    fig, ax = plt.subplots(figsize=(7.8, 4.6))
    ax.plot(t["threshold"], t["model"], color=S1, linewidth=2.4, label="Screen with the model")
    ax.plot(t["threshold"], t["test_all"], color=S2, linewidth=1.6, label="Test everyone")
    ax.plot(t["threshold"], t["test_none"], color=MUTED, linewidth=1.4, label="Test no one")
    top = max(0.4, float(t["model"].max()) + 0.05)
    ax.set_ylim(-0.05, top)
    ax.axvline(cost_point, color=S3, linewidth=1.2, linestyle=(0, (4, 3)))
    ax.text(cost_point + 0.006, top * 0.93, "FN = 5 x FP\n(pt = 1/6)", fontsize=8.5, color=S3, va="top")
    ax.axvline(chosen, color=INK_2, linewidth=1, linestyle=(0, (1, 2)))
    ax.text(chosen + 0.006, top * 0.70, f"deployed\ncut-off {chosen:.2f}", fontsize=8.5, color=INK_2, va="top")
    ax.set_xlabel("Threshold probability (pt)")
    ax.set_ylabel("Net benefit (true cases found per patient)")
    ax.legend(loc="upper right")
    _style(ax)
    _title(ax, "Decision-curve analysis: is the model clinically useful?",
           "Above both reference lines = better than testing everyone or no one")
    return _save(fig, "22_decision_curve.png")


def plot_shap_summary(global_rows: list, beeswarm: list) -> str:
    order = [r["feature"] for r in global_rows][::-1]
    lookup = {b["feature"]: b["points"] for b in beeswarm}
    fig, ax = plt.subplots(figsize=(8.4, 4.9))
    rng = np.random.default_rng(0)
    cmap = LinearSegmentedColormap.from_list("lowhigh", [S1, "#c9c7c0", S2])
    for i, f in enumerate(order):
        pts = lookup[f]
        sv = np.array([p["shap"] for p in pts])
        vals = np.array([p["value"] for p in pts])
        norm = (vals - vals.min()) / (np.ptp(vals) or 1)
        ax.scatter(sv, i + rng.uniform(-0.28, 0.28, len(sv)), c=cmap(norm), s=13, linewidths=0)
    ax.axvline(0, color=AXIS, linewidth=1)
    ax.set_yticks(range(len(order)), order)
    ax.set_xlabel("SHAP value - change in predicted probability for each test patient")
    _style(ax, xgrid=True, ygrid=False)
    ax.text(1.0, -0.14, "colour: blue = low measurement, orange = high", transform=ax.transAxes,
            ha="right", fontsize=8.5, color=MUTED)
    _title(ax, "SHAP: how each measurement moves each patient's risk",
           "TreeSHAP on the deployed forest, 154 held-out patients")
    return _save(fig, "23_shap_summary.png")


def plot_prevalence_transport(curve: list, scenarios: list, guard: float, threshold: float) -> str:
    t = pd.DataFrame(curve)
    fig, ax = plt.subplots(figsize=(7.8, 4.7))
    ax.plot(t["prevalence"], t["precision"], color=S1, linewidth=2.4,
            label=f"Precision at the {threshold:.2f} threshold")
    ax.axhline(guard, color=CRITICAL, linewidth=1.2, linestyle=(0, (4, 3)), label=f"Precision guard {guard:.2f}")
    offsets = [(-150, 8), (8, -22), (10, -4), (-178, 6)]
    for sc, color, off in zip(scenarios, [INK_2, S2, S4, S7], offsets):
        ax.plot(sc["prevalence"], sc["precision"], "o", color=color, markersize=9,
                markeredgecolor=SURFACE, markeredgewidth=2)
        ax.annotate(f"{sc['name']}: {sc['precision']:.0%}", (sc["prevalence"], sc["precision"]),
                    textcoords="offset points", xytext=off, fontsize=8, color=color)
    ax.set_xlabel("Prevalence of diabetes in the screened population")
    ax.set_ylabel("Precision (share of flags that are real cases)")
    ax.set_ylim(0, 0.9)
    ax.legend(loc="upper left")
    _style(ax)
    _title(ax, "Transportability: the same model in an Indian population",
           "Recall carries over; precision falls with prevalence - re-tune before use")
    return _save(fig, "24_prevalence_transport.png")
