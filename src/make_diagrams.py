"""Block diagram and flowchart for the report and deck.

    python src/make_diagrams.py   ->  reports/figures/diagram_block.png, diagram_flowchart.png
"""
from __future__ import annotations

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch

from config import FIGURES_DIR

INK, INK2, MUTED = "#0e1116", "#4a4d52", "#82858a"
NAVY, BLUE, GREEN, VIOLET, ORANGE = "#0f1b2d", "#2a78d6", "#1baf7a", "#4a3aa7", "#eb6834"
SOFT_V, SOFT, SOFT_G, SOFT_O = "#eeecf9", "#f4f5f2", "#e7f7f1", "#fdeee7"
plt.rcParams.update({"font.family": "sans-serif", "font.sans-serif": ["Segoe UI", "DejaVu Sans"]})


def box(ax, x, y, w, h, title, body="", fill=SOFT, edge=MUTED, title_color=INK, lw=1.2, dashed=False, size=11):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.02,rounding_size=0.12",
                                fc=fill, ec=edge, lw=lw, ls="--" if dashed else "-"))
    if body:
        ax.text(x + w / 2, y + h * 0.66, title, ha="center", va="center", fontsize=size, weight="bold", color=title_color)
        ax.text(x + w / 2, y + h * 0.32, body, ha="center", va="center", fontsize=size - 2.2, color=INK2, linespacing=1.35)
    else:
        ax.text(x + w / 2, y + h / 2, title, ha="center", va="center", fontsize=size, weight="bold", color=title_color)


def arrow(ax, a, b, color=MUTED, dashed=False, rad=0.0):
    ax.add_patch(FancyArrowPatch(a, b, arrowstyle="-|>", mutation_scale=13, color=color, lw=1.4,
                                 ls="--" if dashed else "-", connectionstyle=f"arc3,rad={rad}"))


def block_diagram() -> str:
    fig, ax = plt.subplots(figsize=(13, 8.2))
    ax.set_xlim(0, 13); ax.set_ylim(0, 8.2); ax.axis("off")
    ax.text(0.2, 7.9, "System block diagram", fontsize=16, weight="bold", color=INK, va="top")
    ax.text(0.2, 7.45, "Offline training pipeline (top), online serving with the generative explanation layer (bottom)",
            fontsize=10.5, color=MUTED, va="top")

    # band labels
    for y, label in ((6.55, "TRAINING  ·  src/pipeline.py"), (3.1, "SERVING  ·  app/app.py")):
        ax.text(0.2, y, label, fontsize=9.5, weight="bold", color=BLUE, va="center")

    ty, th, tw = 4.95, 1.35, 1.95
    train = [
        ("Pima dataset", "768 patients\n8 measurements", NAVY),
        ("Domain rule", "impossible zeros\n-> NaN (652)", BLUE),
        ("Stratified split", "614 train\n154 test", BLUE),
        ("5-fold CV", "7 models, F2\nselection rule", BLUE),
        ("Threshold", "max recall s.t.\nprecision >= 0.50", BLUE),
        ("Artefacts", "model.joblib\nmetrics · figures", GREEN),
    ]
    xs = [0.2 + i * 2.13 for i in range(len(train))]
    for x, (t, b, c) in zip(xs, train):
        box(ax, x, ty, tw, th, t, b, fill="white", edge=c, title_color=c, lw=1.6)
    for i in range(len(xs) - 1):
        arrow(ax, (xs[i] + tw, ty + th / 2), (xs[i + 1], ty + th / 2))

    # pipeline inner detail
    box(ax, 6.2, 3.85, 4.6, 0.8, "Pipeline: median imputer -> Random Forest (refit per fold)",
        fill=SOFT, edge=MUTED, size=9.2)
    arrow(ax, (xs[3] + tw / 2, 3.85 + 0.8), (xs[3] + tw / 2, ty), dashed=True)

    # G1
    box(ax, xs[1] + 0.2, 3.85, 3.5, 0.8, "G1  CTGAN · TVAE · Copula vs SMOTE", fill=SOFT_V, edge=VIOLET,
        title_color=VIOLET, size=9.8, lw=1.5)
    arrow(ax, (xs[1] + 1.95, 3.85 + 0.8), (xs[3] + 0.2, ty), color=VIOLET, dashed=True, rad=-0.25)

    # serving row
    sy, sh = 0.9, 1.6
    serve = [
        ("Clinician / jury", "8 measurements\nin the dashboard", NAVY, "white"),
        ("Flask API", "validate + clamp\n/api/predict", BLUE, "white"),
        ("Model bundle", "probability +\n0.28 cut-off", BLUE, "white"),
        ("TreeSHAP", "exact per-feature\ncontributions", BLUE, "white"),
        ("G2  LLM (Claude)", "grounded prompt ->\n4-part summary", VIOLET, SOFT_V),
        ("Safety layer", "disclaimer +\ntemplate fallback", GREEN, SOFT_G),
    ]
    for x, (t, b, c, f) in zip(xs, serve):
        box(ax, x, sy, tw, sh, t, b, fill=f, edge=c, title_color=c, lw=1.6)
    for i in range(len(xs) - 1):
        arrow(ax, (xs[i] + tw, sy + sh / 2), (xs[i + 1], sy + sh / 2))
    cxa, cxb, yb = xs[5] + tw / 2, xs[2] + tw / 2, 2.95
    ax.plot([cxa, cxa], [ty, yb], color=GREEN, lw=1.4, ls="--")
    ax.plot([cxa, cxb], [yb, yb], color=GREEN, lw=1.4, ls="--")
    arrow(ax, (cxb, yb), (cxb, sy + sh), color=GREEN, dashed=True)
    ax.text(xs[3] + 0.1, yb + 0.12, "deployed model bundle loaded at start-up", fontsize=9, color=GREEN, style="italic")
    ax.text(xs[0], 0.45, "Output to the user: risk %, band, flag decision, SHAP waterfall, what-if scenarios, "
            "plain-language explanation + clinician-review disclaimer", fontsize=9.8, color=INK2)
    path = FIGURES_DIR / "diagram_block.png"
    fig.savefig(path, dpi=170, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    return str(path)


def flowchart() -> str:
    fig, ax = plt.subplots(figsize=(11, 16))
    ax.set_xlim(0, 11); ax.set_ylim(0, 16); ax.axis("off")
    ax.text(0.2, 15.85, "Process flowchart", fontsize=16, weight="bold", color=INK, va="top")
    cx, w, h = 3.2, 4.4, 0.78
    steps = [
        ("Start: load Pima dataset (768 x 8)", NAVY, "white"),
        ("Audit columns: is a 0 clinically possible?", BLUE, "white"),
        ("Mark 652 impossible zeros as missing (NaN)", BLUE, "white"),
        ("Stratified 80/20 split - test set locked away", BLUE, "white"),
        ("5-fold CV: 7 models in Pipeline(imputer, model)", BLUE, "white"),
        ("Select on F2 with tie-break rule -> Random Forest", BLUE, "white"),
        ("Tune threshold on out-of-fold probabilities", BLUE, "white"),
        ("Score test set once: CIs, calibration, decision curve", BLUE, "white"),
        ("Save model + threshold + metrics + model card", GREEN, SOFT_G),
    ]
    ys = [14.6 - i * 1.12 for i in range(len(steps))]
    for y, (t, c, f) in zip(ys, steps):
        box(ax, cx, y, w, h, t, fill=f, edge=c, title_color=INK, size=10, lw=1.5)
    for i in range(len(ys) - 1):
        arrow(ax, (cx + w / 2, ys[i]), (cx + w / 2, ys[i + 1] + h))

    # decision diamond for precision guard
    dy = ys[6] + h / 2
    ax.add_patch(plt.Polygon([(8.6, dy + 0.6), (9.9, dy), (8.6, dy - 0.6), (7.3, dy)], fc=SOFT_O, ec=ORANGE, lw=1.5))
    ax.text(8.6, dy + 0.05, "precision\n>= 0.50?", ha="center", va="center", fontsize=9.5, weight="bold", color=ORANGE)
    arrow(ax, (cx + w, dy), (7.3, dy), color=ORANGE)
    ax.text(9.95, dy + 0.15, "no: raise\nthe cut-off", fontsize=8.8, color=ORANGE, va="bottom")
    arrow(ax, (8.6, dy + 0.6), (cx + w + 0.05, ys[6] + h - 0.05), color=ORANGE, dashed=True, rad=0.35)
    ax.text(8.75, dy - 0.85, "yes: keep the\nhighest-recall cut-off", fontsize=8.8, color=GREEN, va="top")

    # G1 side branch
    gy = ys[4] + h / 2
    box(ax, 0.15, ys[4] - 0.25, 2.6, 1.3, "G1 experiment", "CTGAN / TVAE / Copula\nvs SMOTE, inside folds",
        fill=SOFT_V, edge=VIOLET, title_color=VIOLET, size=10)
    arrow(ax, (cx, gy), (2.75, gy), color=VIOLET, dashed=True)

    # serving loop
    sy0 = ys[-1] - 1.55
    box(ax, cx, sy0, w, h, "Serve: user enters 8 measurements", fill="white", edge=NAVY, size=10)
    arrow(ax, (cx + w / 2, ys[-1]), (cx + w / 2, sy0 + h))
    box(ax, cx, sy0 - 1.12, w, h, "Predict probability + exact TreeSHAP", fill="white", edge=BLUE, size=10)
    arrow(ax, (cx + w / 2, sy0), (cx + w / 2, sy0 - 1.12 + h))
    dd = sy0 - 1.12 + h / 2
    ax.add_patch(plt.Polygon([(8.6, dd + 0.55), (9.9, dd), (8.6, dd - 0.55), (7.3, dd)], fc=SOFT_V, ec=VIOLET, lw=1.5))
    ax.text(8.6, dd, "LLM key &\nnetwork?", ha="center", va="center", fontsize=9.3, weight="bold", color=VIOLET)
    arrow(ax, (cx + w, dd), (7.3, dd), color=VIOLET)
    box(ax, 6.2, dd - 1.75, 2.0, 0.8, "G2 Claude\nsummary", fill=SOFT_V, edge=VIOLET, title_color=VIOLET, size=9.5)
    box(ax, 8.8, dd - 1.75, 2.0, 0.8, "Template\nsummary", fill=SOFT, edge=MUTED, size=9.5)
    arrow(ax, (8.3, dd - 0.3), (7.2, dd - 0.95), color=VIOLET)
    arrow(ax, (8.9, dd - 0.3), (9.8, dd - 0.95), color=MUTED)
    ax.text(7.05, dd - 0.55, "yes", fontsize=8.8, color=VIOLET)
    ax.text(9.6, dd - 0.55, "no", fontsize=8.8, color=MUTED)
    fy = dd - 3.2
    box(ax, cx - 0.3, fy, w + 0.6, h, "Show risk, flag, SHAP + summary + clinician disclaimer", fill=SOFT_G, edge=GREEN, size=9.6)
    arrow(ax, (7.2, dd - 1.75), (cx + w + 0.1, fy + h), color=GREEN)
    arrow(ax, (9.8, dd - 1.75), (cx + w + 0.3, fy + h / 2), color=GREEN)
    path = FIGURES_DIR / "diagram_flowchart.png"
    fig.savefig(path, dpi=170, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    return str(path)


if __name__ == "__main__":
    print(block_diagram())
    print(flowchart())
