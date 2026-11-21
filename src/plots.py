"""All report figures, in one light-theme visual system.

Palette, mark specs and chrome follow a single validated light-mode system:
categorical hues are assigned in fixed slot order (never cycled), magnitude uses
one blue ramp, correlations use a blue<->red diverging pair with a neutral grey
midpoint, and status colours are reserved for good/critical meaning only.
Gridlines and axes are solid hairlines one shade off the surface.
"""
from __future__ import annotations

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.colors import LinearSegmentedColormap
from matplotlib.patches import Rectangle

from config import FEATURES, FIGURES_DIR, IMPOSSIBLE_ZERO_COLUMNS

# --------------------------------------------------------------------------- #
# Design tokens (light mode)
# --------------------------------------------------------------------------- #
SURFACE = "#fcfcfb"
PAGE = "#f9f9f7"
INK = "#0b0b0b"
INK_2 = "#52514e"
MUTED = "#898781"
GRID = "#e1e0d9"
AXIS = "#c3c2b7"

S1, S2, S3 = "#2a78d6", "#eb6834", "#1baf7a"   # categorical slots 1-3
S4, S7 = "#eda100", "#4a3aa7"                   # slots 4 and 7
GOOD, WARNING, CRITICAL = "#0ca30c", "#fab219", "#d03b3b"

BLUE_RAMP = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#2a78d6", "#1c5cab", "#104281"]
SEQ_BLUE = LinearSegmentedColormap.from_list("seq_blue", ["#f4f8fe", "#2a78d6", "#0d366b"])
DIVERGING = LinearSegmentedColormap.from_list("div_br", ["#184f95", "#86b6ef", "#f0efec", "#ec835a", "#d03b3b"])

FONT = ["Segoe UI", "DejaVu Sans", "sans-serif"]

plt.rcParams.update(
    {
        "figure.facecolor": SURFACE,
        "axes.facecolor": SURFACE,
        "savefig.facecolor": SURFACE,
        "font.family": "sans-serif",
        "font.sans-serif": FONT,
        "text.color": INK,
        "axes.labelcolor": INK_2,
        "axes.edgecolor": AXIS,
        "axes.linewidth": 0.8,
        "axes.titlesize": 13,
        "axes.titleweight": "600",
        "axes.labelsize": 10,
        "xtick.color": MUTED,
        "ytick.color": MUTED,
        "xtick.labelsize": 9,
        "ytick.labelsize": 9,
        "grid.color": GRID,
        "grid.linewidth": 0.8,
        "grid.linestyle": "-",
        "legend.frameon": False,
        "legend.fontsize": 9,
        "figure.dpi": 130,
    }
)


def _style(ax, xgrid=False, ygrid=True):
    ax.set_axisbelow(True)
    ax.grid(axis="y" if ygrid else "x", visible=ygrid or xgrid)
    if xgrid:
        ax.grid(axis="x", visible=True)
    if not ygrid:
        ax.grid(axis="y", visible=False)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(AXIS)
    return ax


def _title(ax, title, subtitle=None):
    """Left-aligned title with an optional deck line above the plot.

    Both lines are drawn as axes-relative text so the deck can never collide
    with the title the way a padded `set_title` does.
    """
    if subtitle:
        ax.text(0, 1.135, title, transform=ax.transAxes, color=INK,
                fontsize=13, fontweight="600", va="bottom")
        ax.text(0, 1.035, subtitle, transform=ax.transAxes, color=MUTED,
                fontsize=9.5, va="bottom")
    else:
        ax.text(0, 1.035, title, transform=ax.transAxes, color=INK,
                fontsize=13, fontweight="600", va="bottom")


def _save(fig, name: str) -> str:
    FIGURES_DIR.mkdir(parents=True, exist_ok=True)
    path = FIGURES_DIR / name
    fig.savefig(path, bbox_inches="tight", facecolor=SURFACE)
    plt.close(fig)
    return str(path)


# --------------------------------------------------------------------------- #
# Step 1 - the data
# --------------------------------------------------------------------------- #
def plot_class_balance(df) -> str:
    counts = df["Outcome"].value_counts().sort_index()
    total = int(counts.sum())
    fig, ax = plt.subplots(figsize=(8, 1.9))
    left = 0
    for value, colour, label in [(0, S1, "No diabetes"), (1, S2, "Diabetes onset")]:
        width = int(counts[value])
        ax.barh(0, width, left=left, height=0.55, color=colour, edgecolor=SURFACE, linewidth=2)
        ax.text(
            left + width / 2,
            0,
            f"{label}\n{width}  ({width / total:.1%})",
            ha="center", va="center", color="#ffffff", fontsize=10.5, fontweight="600",
        )
        left += width
    ax.set_xlim(0, total)
    ax.set_ylim(-0.5, 0.5)
    ax.axis("off")
    _title(
        ax,
        "Class balance: 1 in 3 patients develops diabetes",
        f"{total} patients - the minority class is the one we must not miss",
    )
    return _save(fig, "01_class_balance.png")


def plot_feature_distributions(df) -> str:
    fig, axes = plt.subplots(2, 4, figsize=(13, 6))
    for ax, feature in zip(axes.ravel(), FEATURES):
        neg = df.loc[df["Outcome"] == 0, feature]
        pos = df.loc[df["Outcome"] == 1, feature]
        bins = np.histogram_bin_edges(df[feature].dropna(), bins=22)
        ax.hist(neg, bins=bins, color=S1, alpha=0.75, label="No diabetes")
        ax.hist(pos, bins=bins, color=S2, alpha=0.75, label="Diabetes")
        ax.set_title(feature, loc="left", fontsize=10.5, color=INK)
        _style(ax)
        ax.tick_params(labelsize=8)
    axes[0, 0].legend(loc="upper right", fontsize=8.5)
    fig.suptitle(
        "Feature distributions by outcome - Glucose and BMI separate the classes most",
        x=0.007, ha="left", color=INK, fontsize=13, fontweight="600", y=1.005,
    )
    fig.tight_layout()
    return _save(fig, "02_feature_distributions.png")


# --------------------------------------------------------------------------- #
# Step 2 - missingness and imputation
# --------------------------------------------------------------------------- #
def plot_missingness(report: pd.DataFrame) -> str:
    data = report[report["missing"] > 0].sort_values("missing")
    fig, ax = plt.subplots(figsize=(8.5, 3.6))
    bars = ax.barh(data["feature"], data["missing"], color=S1, height=0.62)
    for bar, pct in zip(bars, data["missing_pct"]):
        ax.text(
            bar.get_width() + 5, bar.get_y() + bar.get_height() / 2,
            f"{int(bar.get_width())}  ({pct:.1f}%)",
            va="center", color=INK_2, fontsize=9.5,
        )
    ax.set_xlim(0, data["missing"].max() * 1.22)
    ax.set_xlabel("Rows recorded as 0 (biologically impossible)")
    _style(ax, xgrid=True, ygrid=False)
    _title(
        ax,
        "Hidden missing data: zeros that cannot be real measurements",
        "A living person cannot have 0 glucose, 0 blood pressure or 0 BMI",
    )
    return _save(fig, "03_missingness.png")


def plot_imputation_effect(raw, flagged, imputed) -> str:
    cols = ["Insulin", "SkinThickness", "BloodPressure", "BMI"]
    fig, axes = plt.subplots(1, 4, figsize=(13.5, 3.5))
    for ax, col in zip(axes, cols):
        # Bin edges must span BOTH frames, otherwise the raw zeros fall outside
        # the range and the very spike this figure exists to show is invisible.
        bins = np.histogram_bin_edges(
            np.concatenate([raw[col].values, imputed[col].values]), bins=26
        )
        ax.hist(raw[col], bins=bins, color=MUTED, alpha=0.75, label="Raw (zeros kept)")
        ax.hist(imputed[col], bins=bins, color=S1, alpha=0.85, label="After imputation")
        n_missing = int(flagged[col].isna().sum())
        ax.set_title(f"{col}  ({n_missing} imputed)", loc="left", fontsize=10.5, color=INK)
        _style(ax)
        ax.tick_params(labelsize=8)
    axes[0].legend(loc="upper right", fontsize=8.5)
    fig.suptitle(
        "Step 2 - the spike at zero is removed without inventing a new distribution shape",
        x=0.007, ha="left", color=INK, fontsize=13, fontweight="600", y=1.02,
    )
    fig.tight_layout()
    return _save(fig, "04_imputation_effect.png")


def plot_correlation(df) -> str:
    corr = df[FEATURES + ["Outcome"]].corr()
    fig, ax = plt.subplots(figsize=(7.6, 6.2))
    im = ax.imshow(corr, cmap=DIVERGING, vmin=-1, vmax=1)
    labels = [c if len(c) < 14 else c[:12] + "." for c in corr.columns]
    ax.set_xticks(range(len(labels)), labels, rotation=45, ha="right", fontsize=8.5)
    ax.set_yticks(range(len(labels)), labels, fontsize=8.5)
    for i in range(len(corr)):
        for j in range(len(corr)):
            value = corr.iloc[i, j]
            ax.text(
                j, i, f"{value:.2f}", ha="center", va="center", fontsize=7.8,
                color="#ffffff" if abs(value) > 0.55 else INK_2,
            )
    ax.grid(False)
    for side in ax.spines:
        ax.spines[side].set_visible(False)
    cbar = fig.colorbar(im, ax=ax, shrink=0.8)
    cbar.outline.set_visible(False)
    cbar.set_label("Pearson correlation", color=INK_2, fontsize=9)
    _title(ax, "Correlation after imputation", "Glucose is the strongest single correlate of the outcome")
    fig.tight_layout()
    return _save(fig, "05_correlation.png")


# --------------------------------------------------------------------------- #
# Step 3 - models, thresholds, evaluation
# --------------------------------------------------------------------------- #
def plot_model_comparison(table: pd.DataFrame) -> str:
    data = table.sort_values("recall")
    y = np.arange(len(data))
    fig, ax = plt.subplots(figsize=(9.6, 5.2))
    ax.barh(y + 0.19, data["recall"], height=0.34, color=S1, label="Recall (catch rate)")
    ax.barh(y - 0.19, data["precision"], height=0.34, color=S2, label="Precision")
    for i, (r, p) in enumerate(zip(data["recall"], data["precision"])):
        ax.text(r + 0.008, i + 0.19, f"{r:.2f}", va="center", fontsize=9, color=INK_2)
        ax.text(p + 0.008, i - 0.19, f"{p:.2f}", va="center", fontsize=9, color=INK_2)
    ax.set_yticks(y, data["model"], fontsize=9.5)
    ax.set_xlim(0, 1.0)
    ax.set_xlabel("Out-of-fold score (5-fold CV on the training set, threshold 0.50)")
    ax.legend(loc="lower right")
    _style(ax, xgrid=True, ygrid=False)
    _title(
        ax,
        "Model comparison - ranked by recall, not accuracy",
        "Every model is scored on data it never saw during its own fold",
    )
    return _save(fig, "06_model_comparison.png")


def plot_imputation_comparison(table: pd.DataFrame) -> str:
    data = table.sort_values("f2")
    y = np.arange(len(data))
    fig, ax = plt.subplots(figsize=(8, 3.2))
    ax.barh(y + 0.18, data["recall"], height=0.32, color=S1, label="Recall")
    ax.barh(y - 0.18, data["f2"], height=0.32, color=S3, label="F2")
    for i, (r, f) in enumerate(zip(data["recall"], data["f2"])):
        ax.text(r + 0.006, i + 0.18, f"{r:.3f}", va="center", fontsize=9, color=INK_2)
        ax.text(f + 0.006, i - 0.18, f"{f:.3f}", va="center", fontsize=9, color=INK_2)
    ax.set_yticks(y, data["imputation"], fontsize=10)
    ax.set_xlim(0, max(data["recall"].max(), data["f2"].max()) * 1.2)
    ax.legend(loc="lower right")
    _style(ax, xgrid=True, ygrid=False)
    _title(ax, "Does the imputation strategy matter?", "Same model, same folds - only the imputer changes")
    return _save(fig, "07_imputation_comparison.png")


def plot_threshold_sweep(sweep: pd.DataFrame, chosen: float, default: float = 0.5) -> str:
    fig, ax = plt.subplots(figsize=(9.6, 4.8))
    ax.plot(sweep["threshold"], sweep["recall"], color=S1, linewidth=2, label="Recall")
    ax.plot(sweep["threshold"], sweep["precision"], color=S2, linewidth=2, label="Precision")
    ax.plot(sweep["threshold"], sweep["f2"], color=S3, linewidth=2, linestyle="-", label="F2 score")

    # Marker labels live inside the plot so they can never collide with the deck.
    for x, colour, text in [(default, MUTED, "default 0.50"), (chosen, CRITICAL, f"chosen {chosen:.2f}")]:
        ax.axvline(x, color=colour, linewidth=1.4, linestyle=(0, (4, 3)), zorder=1)
        ax.text(x, 0.035, f" {text}", ha="left", va="bottom", color=colour,
                fontsize=9, fontweight="600", transform=ax.get_xaxis_transform())

    row = sweep.loc[(sweep["threshold"] - chosen).abs().idxmin()]
    ax.scatter([chosen], [row["recall"]], s=70, color=S1, edgecolor=SURFACE, linewidth=2, zorder=3)
    ax.annotate(
        f"recall {row['recall']:.2f}",
        (chosen, row["recall"]), textcoords="offset points", xytext=(10, 6),
        fontsize=9.5, color=INK, fontweight="600",
    )
    ax.set_xlabel("Decision threshold on predicted probability")
    ax.set_ylabel("Score")
    ax.set_ylim(0, 1.02)
    # Above ~0.88 the model predicts too few positives for precision to be a
    # stable estimate, so the axis stops before that noisy tail.
    ax.set_xlim(0.05, 0.88)
    ax.legend(loc="lower left")
    _style(ax)
    _title(
        ax,
        "The threshold is the recall dial",
        "Lowering the cut-off buys recall and pays for it in precision - a design choice, not an accident",
    )
    return _save(fig, "08_threshold_sweep.png")


def plot_cost_curve(sweep: pd.DataFrame, chosen: float) -> str:
    fig, ax = plt.subplots(figsize=(9.6, 3.8))
    ax.plot(sweep["threshold"], sweep["cost"], color=S7, linewidth=2, label="Weighted error cost")
    best = sweep.loc[sweep["cost"].idxmin()]
    ax.scatter([best["threshold"]], [best["cost"]], s=80, color=S7, edgecolor=SURFACE, linewidth=2, zorder=3)
    ax.annotate(
        f"minimum at {best['threshold']:.2f}",
        (best["threshold"], best["cost"]), textcoords="offset points", xytext=(10, 8),
        fontsize=9.5, color=INK, fontweight="600",
    )
    ax.axvline(0.5, color=MUTED, linewidth=1.4, linestyle=(0, (4, 3)))
    ax.text(0.5, 0.9, " default 0.50", color=MUTED, fontsize=9,
            transform=ax.get_xaxis_transform())
    ax.set_xlabel("Decision threshold")
    ax.set_ylabel("Cost  (5 x FN + 1 x FP)")
    _style(ax)
    _title(
        ax,
        "Cost-weighted view: where the clinical damage is lowest",
        "Assumes a missed diagnosis is five times worse than a false alarm",
    )
    return _save(fig, "09_cost_curve.png")


def plot_confusion_pair(cm_default, cm_tuned, t_default, t_tuned) -> str:
    fig, axes = plt.subplots(1, 2, figsize=(11, 4.3))
    panels = [
        (axes[0], cm_default, f"Default threshold {t_default:.2f}"),
        (axes[1], cm_tuned, f"Recall-first threshold {t_tuned:.2f}"),
    ]
    for ax, cm, title in panels:
        values = np.array(cm, dtype=float)
        ax.imshow(values, cmap=SEQ_BLUE, vmin=0, vmax=values.max() * 1.05)
        for i in range(2):
            for j in range(2):
                count = int(values[i, j])
                is_fn = (i == 1) and (j == 0)
                ax.text(
                    j, i - 0.09, f"{count}",
                    ha="center", va="center", fontsize=21, fontweight="700",
                    color="#ffffff" if values[i, j] > values.max() * 0.55 else INK,
                )
                label = ["True negative", "False alarm", "MISSED CASE", "Caught case"][i * 2 + j]
                ax.text(
                    j, i + 0.24, label, ha="center", va="center", fontsize=9,
                    color=CRITICAL if is_fn else ("#ffffff" if values[i, j] > values.max() * 0.55 else INK_2),
                    fontweight="700" if is_fn else "400",
                )
                if is_fn:
                    ax.add_patch(
                        Rectangle((j - 0.5, i - 0.5), 1, 1, fill=False, edgecolor=CRITICAL, linewidth=2.5)
                    )
        ax.set_xticks([0, 1], ["Predicted\nno diabetes", "Predicted\ndiabetes"], fontsize=9)
        ax.set_yticks([0, 1], ["Actual\nno diabetes", "Actual\ndiabetes"], fontsize=9)
        ax.set_title(title, loc="left", fontsize=11.5, color=INK)
        ax.grid(False)
        for side in ax.spines:
            ax.spines[side].set_visible(False)
    fig.suptitle(
        "Held-out test set: the red box is the only error that costs a life",
        x=0.007, ha="left", color=INK, fontsize=13, fontweight="600", y=1.02,
    )
    fig.tight_layout()
    return _save(fig, "10_confusion_pair.png")


def plot_roc_pr(curves: dict, base_rate: float) -> str:
    fig, axes = plt.subplots(1, 2, figsize=(11.5, 4.4))

    ax = axes[0]
    ax.plot([p["x"] for p in curves["roc"]], [p["y"] for p in curves["roc"]],
            color=S1, linewidth=2, label=f"Model (AUC {curves['roc_auc']:.3f})")
    ax.plot([0, 1], [0, 1], color=MUTED, linewidth=1.2, linestyle=(0, (4, 3)), label="Random")
    ax.set_xlabel("False positive rate")
    ax.set_ylabel("True positive rate (recall)")
    ax.set_title("ROC curve", loc="left", fontsize=11.5, color=INK)
    ax.legend(loc="lower right")
    _style(ax)

    ax = axes[1]
    ax.plot([p["x"] for p in curves["pr"]], [p["y"] for p in curves["pr"]],
            color=S2, linewidth=2, label=f"Model (AP {curves['pr_auc']:.3f})")
    ax.axhline(base_rate, color=MUTED, linewidth=1.2, linestyle=(0, (4, 3)),
               label=f"Prevalence ({base_rate:.2f})")
    ax.set_xlabel("Recall")
    ax.set_ylabel("Precision")
    ax.set_title("Precision-Recall curve", loc="left", fontsize=11.5, color=INK)
    ax.legend(loc="upper right")
    _style(ax)

    fig.suptitle(
        "Ranking quality on the held-out test set",
        x=0.007, ha="left", color=INK, fontsize=13, fontweight="600", y=1.02,
    )
    fig.tight_layout()
    return _save(fig, "11_roc_pr.png")


def plot_calibration(table: pd.DataFrame) -> str:
    fig, ax = plt.subplots(figsize=(6.4, 4.6))
    ax.plot([0, 1], [0, 1], color=MUTED, linewidth=1.2, linestyle=(0, (4, 3)), label="Perfect calibration")
    ax.plot(table["mean_predicted"], table["observed_rate"], color=S1, linewidth=2,
            marker="o", markersize=8, markeredgecolor=SURFACE, markeredgewidth=2, label="Model")
    ax.set_xlabel("Mean predicted probability")
    ax.set_ylabel("Observed diabetes rate")
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.legend(loc="upper left")
    _style(ax)
    _title(ax, "Calibration: does 0.70 really mean 70%?", "A screening score is only actionable if its probabilities are honest")
    return _save(fig, "12_calibration.png")


# --------------------------------------------------------------------------- #
# Step 4 - feature importance (the required deliverable chart)
# --------------------------------------------------------------------------- #
def plot_feature_importance(perm: pd.DataFrame) -> str:
    data = perm.sort_values("importance")
    fig, ax = plt.subplots(figsize=(9.2, 4.8))
    bars = ax.barh(
        data["feature"], data["importance"], height=0.62, color=S1,
        xerr=data["std"], error_kw={"ecolor": MUTED, "elinewidth": 1.2, "capsize": 3},
    )
    top = float(data["importance"].max())
    pad = top * 0.03
    # Label sits just past this bar's own error whisker, never over it.
    for bar, value, err in zip(bars, data["importance"], data["std"]):
        ax.text(
            max(value, 0.0) + err + pad,
            bar.get_y() + bar.get_height() / 2,
            f"{value:+.3f}", va="center", fontsize=9.5, color=INK_2,
        )
    ax.axvline(0, color=AXIS, linewidth=1)
    ax.set_xlabel("Drop in recall when the feature is shuffled  (higher = more relied upon)")
    ax.set_xlim(min(0.0, float(data["importance"].min()) - float(data["std"].max()) - pad),
                top + float(data["std"].max()) + pad * 6)
    _style(ax, xgrid=True, ygrid=False)
    _title(
        ax,
        "Feature importance - what the model uses to catch real cases",
        "Permutation importance on the held-out test set, 30 shuffles, scored on recall",
    )
    return _save(fig, "13_feature_importance.png")


def plot_importance_consensus(consensus: pd.DataFrame) -> str:
    data = consensus.sort_values("mean_rank", ascending=False)
    y = np.arange(len(data))
    views = [
        ("permutation_norm", S1, "Permutation (recall drop)"),
        ("impurity_norm", S2, "Tree impurity"),
        ("abs_logit_coef_norm", S3, "|Logistic coefficient|"),
    ]
    views = [v for v in views if v[0] in data.columns]
    height = 0.8 / len(views)
    fig, ax = plt.subplots(figsize=(9.6, 5))
    for k, (col, colour, label) in enumerate(views):
        offset = (k - (len(views) - 1) / 2) * height
        ax.barh(y + offset, data[col], height=height * 0.88, color=colour, label=label)
    ax.set_yticks(y, data["feature"], fontsize=9.5)
    ax.set_xlabel("Normalised importance within each view (0-1)")
    ax.set_xlim(0, 1.08)
    ax.legend(loc="lower right")
    _style(ax, xgrid=True, ygrid=False)
    _title(
        ax,
        "Three independent views agree on the top three drivers",
        "Glucose, BMI and Age lead every measure - the ranking is not an artefact of one method",
    )
    return _save(fig, "14_importance_consensus.png")


def plot_risk_curves(curves: dict) -> str:
    fig, axes = plt.subplots(1, len(curves), figsize=(4.4 * len(curves), 3.6))
    axes = np.atleast_1d(axes)
    for ax, (feature, points) in zip(axes, curves.items()):
        ax.plot([p["x"] for p in points], [p["y"] for p in points], color=S1, linewidth=2)
        ax.set_title(feature, loc="left", fontsize=11, color=INK)
        ax.set_xlabel(feature)
        ax.set_ylabel("Predicted risk")
        ax.set_ylim(0, 1)
        _style(ax)
    fig.suptitle(
        "How predicted risk moves with one feature (all others held at the median)",
        x=0.007, ha="left", color=INK, fontsize=13, fontweight="600", y=1.03,
    )
    fig.tight_layout()
    return _save(fig, "15_risk_curves.png")


def plot_latent_space(components, labels, explained) -> str:
    fig, ax = plt.subplots(figsize=(6.8, 5.2))
    for value, colour, label in [(0, S1, "No diabetes"), (1, S2, "Diabetes")]:
        mask = labels == value
        ax.scatter(
            components[mask, 0], components[mask, 1], s=26, color=colour, alpha=0.72,
            edgecolor=SURFACE, linewidth=0.8, label=label,
        )
    ax.set_xlabel(f"PC 1  ({explained[0]:.0%} of variance)")
    ax.set_ylabel(f"PC 2  ({explained[1]:.0%} of variance)")
    ax.legend(loc="upper right")
    _style(ax)
    _title(
        ax,
        "A 2-D latent space of the eight clinical features",
        "The classes overlap heavily - which is exactly why recall has to be bought with a threshold",
    )
    return _save(fig, "16_latent_space.png")


def plot_impact(impact_default: dict, impact_tuned: dict) -> str:
    labels = ["Cases caught", "Cases MISSED", "False alarms"]
    keys = ["true_positives", "missed_cases", "false_alarms"]
    a = [impact_default[k] for k in keys]
    b = [impact_tuned[k] for k in keys]
    y = np.arange(len(labels))
    fig, ax = plt.subplots(figsize=(9.4, 3.6))
    ax.barh(y + 0.19, a, height=0.34, color=MUTED, label="Default threshold 0.50")
    ax.barh(y - 0.19, b, height=0.34, color=S1, label="Recall-first threshold")
    for i, (v1, v2) in enumerate(zip(a, b)):
        ax.text(v1 + 30, i + 0.19, f"{v1:,}", va="center", fontsize=9.5, color=INK_2)
        ax.text(v2 + 30, i - 0.19, f"{v2:,}", va="center", fontsize=9.5, color=INK_2)
    ax.set_yticks(y, labels, fontsize=10.5)
    ax.set_xlim(0, max(a + b) * 1.2)
    ax.set_xlabel("People per 10,000 screened")
    ax.legend(loc="lower right")
    _style(ax, xgrid=True, ygrid=False)
    _title(
        ax,
        "What the threshold choice means in people, not percentages",
        "Per 10,000 screened - the trade we are explicitly choosing to make",
    )
    return _save(fig, "17_screening_impact.png")
