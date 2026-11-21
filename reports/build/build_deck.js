/* Final-jury deck builder.  node build_deck.js <project_root> <out.pptx> */
const path = require("path");
const fs = require("fs");
const pptxgen = require("pptxgenjs");

const ROOT = process.argv[2];
const OUT = process.argv[3];
const HERE = __dirname;
const SKILL = process.env.PPTX_SKILL;
const M = JSON.parse(fs.readFileSync(path.join(ROOT, "reports", "metrics.json"), "utf8"));
const DIMS = JSON.parse(fs.readFileSync(path.join(HERE, "dims.json"), "utf8"));
const FIG = f => path.join(ROOT, "reports", "figures", f).replace(/\\/g, "/");
const ASSET = f => path.join(HERE, "assets", f).replace(/\\/g, "/");

const THEME = {
  name: "Diabetes Screener",
  headFontFace: "Calibri",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "0E1116", lt1: "FFFFFF", dk2: "0F1B2D", lt2: "F3F4F1",
    accent1: "2A78D6", accent2: "EB6834", accent3: "1BAF7A", accent4: "4A3AA7",
    accent5: "EDA100", accent6: "D03B3B", hlink: "2A78D6", folHlink: "4A3AA7"
  }
};
const HEX = THEME.colors;
const MUTED = "6B7078", GRID = "E4E4DE", INK2 = "4A4D52";

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
pres.title = "Diabetes Onset Risk Screener - Final Jury";
pres.author = "Prem Maradiya, Saanvi Dhote, Suvesha Khan, Atharva Dhobale";
pres.company = "MIT ADT University";
const C = pres.SchemeColor;

const W = 13.333, H = 7.5, MX = 0.6;

/* ------------------------------------------------------------------ layouts */
pres.defineSlideMaster({
  title: "TITLE_DARK",
  background: { color: HEX.dk2 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: MX, y: 2.0, w: 9.6, h: 1.9, fontSize: 44, bold: true, color: C.background1, valign: "bottom", margin: 0 }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", x: MX, y: 4.05, w: 9.2, h: 0.9, fontSize: 18, color: "C5D2E3", valign: "top", margin: 0 }, text: "" } }
  ]
});
pres.defineSlideMaster({
  title: "SECTION_DARK",
  background: { color: HEX.dk2 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: MX, y: 2.6, w: 12.1, h: 1.3, fontSize: 38, bold: true, color: C.background1, valign: "bottom", margin: 0 }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", x: MX, y: 4.05, w: 11.0, h: 0.9, fontSize: 18, color: "9CC4F5", valign: "top", margin: 0 }, text: "" } }
  ],
  slideNumber: { x: W - 1.1, y: H - 0.5, w: 0.6, h: 0.3, fontSize: 10, color: "8FA1BA", align: "right" }
});
pres.defineSlideMaster({
  title: "CONTENT",
  background: { color: HEX.lt1 },
  margin: [0.5, 0.6, 0.6, 0.6],
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: MX, y: 0.38, w: W - 2 * MX, h: 0.75, fontSize: 30, bold: true, color: C.text2, valign: "middle", margin: 0 }, text: "" } },
    { text: { text: "Diabetes Onset Risk Screener  |  Final Jury", options: { x: MX, y: H - 0.42, w: 6, h: 0.28, fontSize: 10, color: MUTED, margin: 0 } } }
  ],
  slideNumber: { x: W - 1.1, y: H - 0.42, w: 0.5, h: 0.28, fontSize: 10, color: MUTED, align: "right" }
});

/* ------------------------------------------------------------------ helpers */
let order = 0;
function slide(layout, section, title, notes) {
  const s = pres.addSlide({ masterName: layout, sectionTitle: section });
  if (title) s.addText(title, { placeholder: "title" });
  if (notes) s.addNotes(notes);
  order += 1;
  return s;
}
function sub(s, text, y = 1.08) {
  s.addText(text, { x: MX, y, w: W - 2 * MX, h: 0.4, fontSize: 15, color: INK2, margin: 0, isTextBox: true, objectName: "subtitle" });
}
function card(s, x, y, w, h, fill = "F6F7F4", name = "card") {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, fill: { color: fill }, line: { color: "E1E2DC", width: 0.75 }, rectRadius: 0.08, objectName: name });
}
function stat(s, x, y, w, value, label, color, sublabel) {
  s.addText(value, { x, y, w, h: 0.85, fontSize: 44, bold: true, color, margin: 0, isTextBox: true, objectName: "stat-value" });
  s.addText(label, { x, y: y + 0.85, w, h: 0.35, fontSize: 14, bold: true, color: HEX.dk1, margin: 0, isTextBox: true, objectName: "stat-label" });
  if (sublabel) s.addText(sublabel, { x, y: y + 1.2, w, h: 0.55, fontSize: 12, color: MUTED, margin: 0, valign: "top", isTextBox: true, objectName: "stat-sub" });
}
function fit(file, maxW, maxH) {
  const d = DIMS[file];
  if (!d) throw new Error("no dims for " + file);
  const r = d[0] / d[1];
  let w = maxW, h = maxW / r;
  if (h > maxH) { h = maxH; w = maxH * r; }
  return { w, h };
}
function image(s, file, x, y, maxW, maxH, alt, center = true) {
  const { w, h } = fit(file, maxW, maxH);
  const ox = center ? (maxW - w) / 2 : 0;
  s.addImage({ path: file, x: x + ox, y, w, h, altText: alt, objectName: "image" });
  return { w, h, x: x + ox };
}
function bullets(s, items, x, y, w, h, size = 15) {
  s.addText(items.map((t, i) => {
    const runs = typeof t === "string" ? [{ text: t }] : t;
    return runs.map((r, j) => ({ text: r.text, options: Object.assign({ bullet: j === 0, breakLine: j === runs.length - 1 && i < items.length - 1 }, r.options || {}) }));
  }).flat(), { x, y, w, h, fontSize: size, color: HEX.dk1, valign: "top", paraSpaceAfter: 8, margin: 0, isTextBox: true, objectName: "bullets" });
}
function pill(s, x, y, w, text, fill, color) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h: 0.34, fill: { color: fill }, line: { color: fill }, rectRadius: 0.17, objectName: "pill" });
  s.addText(text, { x, y, w, h: 0.34, fontSize: 11, bold: true, color, align: "center", valign: "middle", margin: 0, isTextBox: true, objectName: "pill-text" });
}

const t = M.step3_test_tuned, d = M.step3_test_default, ci = M.step3_ci_tuned;
const pct = (v, n = 1) => (v * 100).toFixed(n) + "%";
const chartBase = () => ({
  catAxisLabelColor: INK2, valAxisLabelColor: MUTED, catAxisLabelFontFace: "+mn-lt", valAxisLabelFontFace: "+mn-lt",
  catAxisLabelFontSize: 12, valAxisLabelFontSize: 11, dataLabelFontFace: "+mn-lt", dataLabelFontSize: 11, dataLabelColor: INK2,
  valGridLine: { color: GRID, size: 0.75 }, catGridLine: { style: "none" }, legendFontFace: "+mn-lt", legendFontSize: 12, legendColor: INK2,
  titleFontFace: "+mn-lt"
});

/* =================================================================== slides */
pres.addSection({ title: "Opening" });

// 1 - Title
let s = slide("TITLE_DARK", "Opening", "Catching diabetes before it catches the patient",
  "SPEAKER: Suvesha (0:30).\nGood morning. We built a screening model that predicts diabetes onset from eight routine clinical measurements - and, since Jury 2, a generative AI layer that explains every result in plain language. The interesting part is that we deliberately made the model worse at being right overall, so it would be better at not missing sick people. Four of us will each present one part.");
s.addText("A recall-first screener with a generative AI explanation layer - Pima Indians Diabetes Database", { placeholder: "body" });
s.addText("Prem Rasik Maradiya  ·  Saanvi Rajendra Dhote  ·  Suvesha Anil Khan  ·  Atharva Dhobale", { x: MX, y: 5.35, w: 11, h: 0.4, fontSize: 15, color: "FFFFFF", margin: 0, isTextBox: true, objectName: "team" });
s.addText("LY CORE-3  ·  Generative AI  ·  Model Making  ·  MIT ADT University, Pune", { x: MX, y: 5.8, w: 11, h: 0.35, fontSize: 13, color: "8FA1BA", margin: 0, isTextBox: true, objectName: "course" });
[["90.7%", "test recall", "7EE2A8"], ["5 / 54", "cases missed", "FF9F9F"], ["2", "generative layers", "C4B5FD"]].forEach(([v, l, c], i) => {
  const x = 10.25, y = 1.2 + i * 1.45;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: 2.5, h: 1.2, fill: { color: "1B2B44" }, line: { color: "2B3E5C", width: 0.75 }, rectRadius: 0.1, objectName: "hero-kpi" });
  s.addText(v, { x: x + 0.22, y: y + 0.12, w: 2.1, h: 0.62, fontSize: 30, bold: true, color: c, margin: 0, isTextBox: true, objectName: "hero-kpi-value" });
  s.addText(l, { x: x + 0.22, y: y + 0.74, w: 2.1, h: 0.32, fontSize: 13, color: "C5D2E3", margin: 0, isTextBox: true, objectName: "hero-kpi-label" });
});

// 2 - What changed since Jury 2
s = slide("CONTENT", "Opening", "What we changed after the Jury 2 review",
  "SPEAKER: Suvesha (0:45).\nAt Jury 2 you gave us five concrete asks. Every one of them is now a working part of the system, and we will show each live. The biggest: the project now has two generative components - CTGAN and TVAE synthetic patients, and an LLM that turns SHAP values into a patient-friendly explanation with a clinician-review disclaimer.");
const rows2 = [
  ["Add a generative AI component", "Two layers: CTGAN / TVAE synthetic patients, and an LLM risk explanation", "Slides 11-14"],
  ["LLM explanation from SHAP + disclaimer", "Exact TreeSHAP -> structured prompt -> Claude -> 4-part summary; disclaimer added by the server", "Slides 13-14"],
  ["CTGAN vs SMOTE vs no augmentation", "Six variants on identical folds, generators fitted inside each training fold, realism + privacy audit", "Slides 11-12"],
  ["Precision, F1, confusion at 0.28 + calibration", "Every metric with a 95% bootstrap CI, calibration curve, Brier, decision-curve analysis", "Slides 8-9"],
  ["Imputation inside the CV pipeline", "Median imputer is a Pipeline step, refitted on every training fold - shown in code", "Slide 5"],
  ["External validity for Indian patients", "Prevalence transport to ICMR-INDIAB rates, Asian-Indian BMI cut-offs, re-validation protocol", "Slide 15"]
];
const hdr = ["Jury asked for", "What we built", "Where"].map(h => ({ text: h, options: { bold: true, color: "FFFFFF", fill: { color: HEX.dk2 }, fontSize: 13 } }));
s.addTable([hdr].concat(rows2.map((r, i) => r.map((c, j) => ({ text: c, options: { fontSize: 13, bold: j === 0, color: j === 2 ? HEX.accent1 : HEX.dk1, fill: { color: i % 2 ? "FFFFFF" : "F6F7F4" } } })))),
  { x: MX, y: 1.35, w: W - 2 * MX, colW: [3.5, 6.83, 1.8], rowH: 0.62, border: { type: "solid", pt: 0.75, color: "E1E2DC" }, valign: "middle", margin: [0.06, 0.12, 0.06, 0.12], fontFace: "Calibri", objectName: "jury-table" });

// 3 - Accuracy is the wrong objective
pres.addSection({ title: "Problem and data" });
s = slide("CONTENT", "Problem and data", "Accuracy is the wrong objective for screening",
  "SPEAKER: Suvesha (1:00).\n34.9% of this cohort is diabetic, so a model that says 'nobody has diabetes' scores 65.1% accuracy and catches zero patients. Accuracy treats both mistakes as one unit of wrongness. In screening they are nothing alike: a missed case leaves the funnel and the harm compounds silently for years; a false alarm costs one blood test. So we optimise recall, with precision >= 0.50 as a guard so the follow-up clinic stays viable, and we price a missed case at five false alarms.");
stat(s, MX, 1.5, 3.4, "34.9%", "of patients are diabetic", HEX.accent2, "268 of 768 - an imbalanced problem");
stat(s, MX, 3.6, 3.4, "65.1%", "accuracy of 'nobody has diabetes'", HEX.accent6, "...and it catches zero patients");
card(s, 4.5, 1.45, 3.95, 4.9, "FDF0EE", "fn-card");
s.addText("False negative", { x: 4.8, y: 1.7, w: 3.4, h: 0.45, fontSize: 20, bold: true, color: HEX.accent6, margin: 0, isTextBox: true });
bullets(s, ["A patient who will develop diabetes is told they are fine", "Leaves the screening funnel; nothing prompts a second look", "Harm compounds silently for years - often irreversible"], 4.8, 2.3, 3.4, 3.2, 15);
card(s, 8.7, 1.45, 4.03, 4.9, "EEF4FC", "fp-card");
s.addText("False positive", { x: 9.0, y: 1.7, w: 3.5, h: 0.45, fontSize: 20, bold: true, color: HEX.accent1, margin: 0, isTextBox: true });
bullets(s, ["A healthy patient is called back", "Costs one confirmatory blood test (fasting glucose / HbA1c)", "Anxiety, but recoverable within days"], 9.0, 2.3, 3.5, 3.2, 15);
s.addText("Objective: maximise recall subject to precision >= 0.50  ·  cost model FN = 5 x FP", { x: 4.5, y: 6.5, w: 8.2, h: 0.4, fontSize: 14, bold: true, color: HEX.dk2, margin: 0, isTextBox: true, objectName: "objective" });

// 4 - Hidden missing values
s = slide("CONTENT", "Problem and data", "The dataset reports zero missing values. It has 652",
  "SPEAKER: Saanvi (1:00).\ndf.isnull().sum() returns zero, because missing values were written as 0. We audited each column on clinical grounds: zero glucose, blood pressure, skin fold, insulin or BMI is impossible in a living patient - 652 values in five columns. Pregnancies is deliberately excluded: zero pregnancies is valid, and blanket-replacing every zero would destroy real information for 111 patients. Insulin is missing in nearly half the rows, which is a limitation we carry forward.");
const miss = M.step2_missingness.filter(m => m.missing > 0);
s.addChart(pres.charts.BAR, [{ name: "Impossible zeros", labels: miss.map(m => m.feature), values: miss.map(m => m.missing) }],
  Object.assign(chartBase(), { x: MX, y: 1.4, w: 6.6, h: 4.9, barDir: "bar", chartColors: [HEX.accent1], showValue: true, dataLabelPosition: "outEnd", showLegend: false, catAxisOrientation: "maxMin", showTitle: true, title: "Rows recorded as 0 (biologically impossible)", titleFontSize: 14, titleColor: HEX.dk1, valAxisHidden: true, valGridLine: { style: "none" }, objectName: "missing-chart" }));
card(s, 7.6, 1.45, 5.13, 2.3, "F6F7F4");
s.addText([{ text: "Why each zero is impossible", options: { bold: true, breakLine: true, fontSize: 16 } },
  { text: "Glucose 0 is incompatible with life · diastolic BP 0 means no circulation · a skin fold cannot be 0 mm · BMI 0 implies zero mass", options: { fontSize: 14, color: INK2 } }],
  { x: 7.85, y: 1.6, w: 4.65, h: 2.0, valign: "top", margin: 0, isTextBox: true, color: HEX.dk1 });
card(s, 7.6, 3.95, 5.13, 2.35, "FDF3DD");
s.addText([{ text: "Deliberately excluded: Pregnancies", options: { bold: true, breakLine: true, fontSize: 16, color: "8A5C00" } },
  { text: "Zero pregnancies is valid. The usual shortcut - replace every zero - would corrupt 111 real records.", options: { fontSize: 14, color: INK2 } }],
  { x: 7.85, y: 4.1, w: 4.65, h: 2.05, valign: "top", margin: 0, isTextBox: true, color: HEX.dk1 });

// 5 - Block diagram
s = slide("CONTENT", "Problem and data", "Block diagram: one pipeline, two generative layers",
  "SPEAKER: Saanvi (1:00).\nThis is the block diagram. Everything that learns from data sits inside one scikit-learn Pipeline and is refitted on each training fold - including the median imputer, which answers the jury's point about imputation inside cross-validation. The two violet blocks are the generative layers: G1 generates synthetic patients during training experiments, G2 turns each prediction and its SHAP values into a plain-language explanation. The output is a flag for a confirmatory test, never a diagnosis.");
const blocks = [
  ["Raw data", "768 patients\n8 measurements", HEX.dk2],
  ["Domain rule", "Impossible zeros\n-> missing", HEX.accent1],
  ["Pipeline", "Median imputer\n+ Random Forest", HEX.accent1],
  ["Threshold", "0.28, tuned\nout-of-fold", HEX.accent1],
  ["Decision", "Flag for a\nconfirmatory test", HEX.accent3]
];
const bw = 2.15, gap = 0.37, by = 1.75;
blocks.forEach(([h1, d1, col], i) => {
  const x = MX + i * (bw + gap);
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: by, w: bw, h: 1.35, fill: { color: col }, line: { color: col }, rectRadius: 0.1, objectName: "block" });
  s.addText([{ text: h1, options: { bold: true, fontSize: 16, breakLine: true } }, { text: d1, options: { fontSize: 12.5 } }], { x: x + 0.1, y: by + 0.08, w: bw - 0.2, h: 1.2, color: "FFFFFF", align: "center", valign: "middle", margin: 0, isTextBox: true });
  if (i < blocks.length - 1) s.addShape(pres.shapes.RIGHT_ARROW, { x: x + bw + 0.05, y: by + 0.52, w: gap - 0.1, h: 0.3, fill: { color: "B8BCC4" }, line: { color: "B8BCC4" }, objectName: "arrow" });
});
const gx1 = MX + 1 * (bw + gap), gx2 = MX + 3 * (bw + gap);
[[gx1 + (bw + gap) / 2, "G1  Synthetic patients", "CTGAN · TVAE · Gaussian Copula\nbenchmarked against SMOTE"], [gx2, "G2  LLM explanation", "TreeSHAP + clinical bands -> Claude\n-> summary + clinician disclaimer"]].forEach(([x, h1, d1]) => {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 3.75, w: 3.0, h: 1.35, fill: { color: "EEECF9" }, line: { color: HEX.accent4, width: 1.25 }, rectRadius: 0.1, objectName: "gen-block" });
  s.addText([{ text: h1, options: { bold: true, fontSize: 15, color: HEX.accent4, breakLine: true } }, { text: d1, options: { fontSize: 12.5, color: INK2 } }], { x: x + 0.12, y: 3.8, w: 2.76, h: 1.25, align: "center", valign: "middle", margin: 0, isTextBox: true });
  s.addShape(pres.shapes.LINE, { x: x + 1.5, y: by + 1.35, w: 0, h: 3.75 - by - 1.35, line: { color: HEX.accent4, width: 1.25, dashType: "dash" }, objectName: "gen-link" });
});
s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: MX, y: 5.55, w: W - 2 * MX, h: 1.05, fill: { color: "F6F7F4" }, line: { color: "E1E2DC" }, rectRadius: 0.08, objectName: "code-card" });
s.addText([{ text: "Leak-free by construction:  ", options: { bold: true, color: HEX.dk1 } },
  { text: 'Pipeline([("impute", SimpleImputer(strategy="median")), ("model", RandomForestClassifier(500 trees, depth 6, balanced))])', options: { fontFace: "Consolas", color: HEX.accent4 } },
  { text: "  - refitted inside every CV fold; the test set is touched once.", options: { color: INK2 } }],
  { x: MX + 0.25, y: 5.6, w: W - 2 * MX - 0.5, h: 0.95, fontSize: 13, valign: "middle", margin: 0, isTextBox: true, objectName: "code-text" });

// 6 - Seven models
pres.addSection({ title: "Model and evaluation" });
s = slide("CONTENT", "Model and evaluation", "Seven models, identical folds, one selection rule",
  "SPEAKER: Atharva (1:00).\nWe compared seven models on identical stratified folds and selected on F2, which weights recall four times more than precision. On 614 training rows a 0.002 F2 gap is noise, so models within 0.01 F2 are treated as tied; ties break on out-of-fold recall, then a fixed interpretability priority. Random Forest and Logistic Regression + SMOTE tied at 0.724 recall; Random Forest won because it gives native feature importances and needs no synthetic data at training time. Gaussian Naive Bayes is our generative classifier baseline.");
const mc = M.step3_model_comparison.slice().sort((a, b) => a.recall - b.recall);
s.addChart(pres.charts.BAR, [
  { name: "Recall", labels: mc.map(m => m.model), values: mc.map(m => +m.recall.toFixed(3)) },
  { name: "Precision", labels: mc.map(m => m.model), values: mc.map(m => +m.precision.toFixed(3)) }],
  Object.assign(chartBase(), { x: MX, y: 1.3, w: 8.0, h: 5.4, barDir: "bar", barGrouping: "clustered", chartColors: [HEX.accent1, HEX.accent2], showValue: true, dataLabelPosition: "outEnd", dataLabelFormatCode: "0.000", showLegend: true, legendPos: "b", valAxisMinVal: 0, valAxisMaxVal: 0.85, valAxisHidden: true, valGridLine: { style: "none" }, showTitle: true, title: "Out-of-fold, 5-fold stratified CV, threshold 0.50", titleFontSize: 13, titleColor: INK2, objectName: "model-chart" }));
card(s, 8.95, 1.45, 3.78, 5.1, "F6F7F4");
s.addText([{ text: "Selected: Random Forest", options: { bold: true, fontSize: 18, color: HEX.dk2, breakLine: true } },
  { text: "500 trees · depth 6 · balanced class weights · median imputer in the pipeline", options: { fontSize: 13, color: INK2 } }],
  { x: 9.2, y: 1.65, w: 3.3, h: 1.4, valign: "top", margin: 0, isTextBox: true });
bullets(s, ["Selected on F2, not accuracy", "Within 0.01 F2 = tied; tie broken on recall, then interpretability", "Tied with LR + SMOTE at 0.724 recall - won on native importances and no synthetic training data"], 9.2, 3.15, 3.3, 3.3, 14);

// 7 - Threshold
s = slide("CONTENT", "Model and evaluation", "The threshold is the lever - and nobody chose 0.50",
  "SPEAKER: Atharva (1:00).\nSame model on both sides. We tuned the cut-off on out-of-fold probabilities - never the test set - for maximum recall with precision at least 0.50. Recall goes from 74.1% to 90.7%; missed diabetic patients fall from 14 to 5 out of 54, at the price of 18 extra confirmatory tests. Accuracy falls from 74.0% to 68.2% - that is not a regression, it is the trade being made on purpose. ROC-AUC is unchanged because the model never changed.");
[[MX, "DEFAULT  -  threshold 0.50", d, "F6F7F4", INK2], [6.85, "RECALL-FIRST  -  threshold 0.28", t, "E9F7EF", "0B7A3B"]].forEach(([x, lab, m, fill, col]) => {
  card(s, x, 1.4, 5.88, 4.25, fill);
  s.addText(lab, { x: x + 0.3, y: 1.55, w: 5.3, h: 0.4, fontSize: 14, bold: true, color: col, margin: 0, isTextBox: true });
  s.addText(String(m.fn), { x: x + 0.3, y: 2.05, w: 1.8, h: 1.2, fontSize: 72, bold: true, color: m === t ? "0B7A3B" : HEX.accent6, margin: 0, isTextBox: true });
  s.addText("of 54 diabetic patients missed", { x: x + 2.05, y: 2.4, w: 3.5, h: 0.6, fontSize: 16, color: HEX.dk1, margin: 0, isTextBox: true });
  [["Recall", pct(m.recall)], ["Precision", pct(m.precision)], ["F2", m.f2.toFixed(3)], ["Accuracy", pct(m.accuracy)]].forEach(([k, v], i) => {
    const xx = x + 0.3 + i * 1.38;
    s.addText(v, { x: xx, y: 3.65, w: 1.3, h: 0.55, fontSize: 22, bold: true, color: HEX.dk1, margin: 0, isTextBox: true });
    s.addText(k, { x: xx, y: 4.2, w: 1.3, h: 0.3, fontSize: 12, color: MUTED, margin: 0, isTextBox: true });
  });
});
s.addText([{ text: "9 more diabetic patients caught", options: { bold: true, color: "0B7A3B" } }, { text: " for 18 extra confirmatory tests.  Per 10,000 screened: 584 people rescued from a false all-clear for 1,169 extra blood tests.", options: { color: HEX.dk1 } }],
  { x: MX, y: 5.9, w: W - 2 * MX, h: 0.6, fontSize: 16, margin: 0, isTextBox: true, objectName: "trade" });

// 8 - CIs and confusion matrix
s = slide("CONTENT", "Model and evaluation", "Every metric at 0.28, with its 95% interval",
  "SPEAKER: Atharva (1:00).\nThe jury asked for precision, F1 and the confusion matrix at 0.28. Here they are, each with a 95% bootstrap interval from 2,000 resamples of the 154 test patients. With only 54 diabetic patients in the test set, recall of 90.7% really means somewhere between 82 and 98 percent - we report the interval rather than hide it. The confusion matrix: 49 caught, 5 missed, 44 false alarms, 56 correctly cleared.");
const ciRows = [["Recall", "recall"], ["Precision", "precision"], ["F1", "f1"], ["F2", "f2"], ["Specificity", "specificity"], ["ROC-AUC", "roc_auc"], ["Brier score", "brier"]];
s.addTable([["Metric at 0.28", "Value", "95% CI"].map(h => ({ text: h, options: { bold: true, color: "FFFFFF", fill: { color: HEX.dk2 } } }))].concat(
  ciRows.map(([n, k], i) => [{ text: n, options: { bold: true } }, { text: ci[k].point.toFixed(3), options: { bold: k === "recall", color: k === "recall" ? "0B7A3B" : HEX.dk1, align: "right" } }, { text: `${ci[k].lo.toFixed(3)} - ${ci[k].hi.toFixed(3)}`, options: { color: INK2, align: "right" } }].map(c => { c.options.fill = { color: i % 2 ? "FFFFFF" : "F6F7F4" }; return c; }))),
  { x: MX, y: 1.4, w: 6.2, colW: [2.3, 1.6, 2.3], rowH: 0.56, fontSize: 15, border: { type: "solid", pt: 0.75, color: "E1E2DC" }, valign: "middle", margin: [0.05, 0.15, 0.05, 0.15], fontFace: "Calibri", objectName: "ci-table" });
const cmx = 7.35, cmy = 1.85, cw = 2.6, ch = 1.75;
s.addText("Predicted:  no diabetes          diabetes", { x: cmx, y: 1.4, w: 2 * cw + 0.1, h: 0.35, fontSize: 13, color: MUTED, margin: 0, isTextBox: true });
[[t.tn, "True negatives", "F1F2EE", HEX.dk1], [t.fp, "False alarms", "F1F2EE", HEX.dk1], [t.fn, "MISSED cases", "FBEAEA", HEX.accent6], [t.tp, "Caught cases", "E8F7E8", "0B7A3B"]].forEach(([v, l, f, c], i) => {
  const x = cmx + (i % 2) * (cw + 0.1), y = cmy + Math.floor(i / 2) * (ch + 0.1);
  card(s, x, y, cw, ch, f, "cm-cell");
  s.addText(String(v), { x: x + 0.25, y: y + 0.18, w: cw - 0.5, h: 0.9, fontSize: 48, bold: true, color: c, margin: 0, isTextBox: true });
  s.addText(l, { x: x + 0.25, y: y + 1.1, w: cw - 0.5, h: 0.4, fontSize: 14, bold: i === 2, color: c, margin: 0, isTextBox: true });
});
s.addText("Actual: no diabetes (top) · diabetes (bottom)  ·  154 held-out patients", { x: cmx, y: 5.6, w: 5.6, h: 0.5, fontSize: 12, color: MUTED, margin: 0, isTextBox: true });

// 9 - Calibration + DCA
s = slide("CONTENT", "Model and evaluation", "Calibrated enough to read, useful enough to act on",
  "SPEAKER: Atharva (0:50).\nLeft: the calibration curve the jury asked for. The forest's calibration slope is 1.07 and the Brier score 0.167; an isotonic-calibrated copy barely changes either, so we keep the raw scores as the decision variable. Right: decision-curve analysis, the standard clinical-utility check. At the threshold implied by our cost model - one missed case worth five false alarms, pt = 1/6 - the model's net benefit is 0.259 against 0.218 for testing everyone: about 416 more true cases per 10,000 without extra false alarms.");
image(s, FIG("21_calibration_comparison.png"), MX, 1.35, 5.95, 5.0, "Calibration curve");
image(s, FIG("22_decision_curve.png"), 6.75, 1.35, 5.98, 5.0, "Decision curve");

// 10 - SHAP
s = slide("CONTENT", "Model and evaluation", "Four methods agree: glucose, BMI and age drive risk",
  "SPEAKER: Prem (0:50).\nWe now explain the forest with exact TreeSHAP: every dot is one held-out patient, and its position is how many percentage points that measurement moved the risk. Glucose dominates, then BMI, then age - the same order as permutation importance, impurity importance and logistic odds ratios. A one-SD rise in glucose multiplies the odds of diabetes by 3.3. Importance is association, not causation, and is learned from one cohort.");
image(s, FIG("23_shap_summary.png"), MX, 1.3, 7.6, 5.4, "SHAP summary", false);
[["Glucose", "3.27x odds per +1 SD", "mean |SHAP| 13.8 pts"], ["BMI", "2.03x odds per +1 SD", "mean |SHAP| 8.0 pts"], ["Age", "established risk factor", "mean |SHAP| 6.0 pts"]].forEach(([f, a, b], i) => {
  const y = 1.45 + i * 1.62;
  card(s, 8.55, y, 4.18, 1.42, "F6F7F4");
  s.addText(String(i + 1), { x: 8.75, y: y + 0.3, w: 0.8, h: 0.8, fontSize: 36, bold: true, color: HEX.accent2, margin: 0, isTextBox: true });
  s.addText([{ text: f, options: { bold: true, fontSize: 18, breakLine: true } }, { text: a, options: { fontSize: 13, color: INK2, breakLine: true } }, { text: b, options: { fontSize: 13, color: INK2 } }], { x: 9.55, y: y + 0.12, w: 3.05, h: 1.2, valign: "middle", margin: 0, isTextBox: true, color: HEX.dk1 });
});

// 11 - GenAI 1 comparison
pres.addSection({ title: "Generative AI" });
s = slide("CONTENT", "Generative AI", "Generative layer 1: do synthetic patients help?",
  "SPEAKER: Prem (1:00).\nThe jury asked us to generate synthetic minority patients with CTGAN and compare against SMOTE and no augmentation. We went further: CTGAN (a GAN for tables), TVAE (a variational autoencoder) and a Gaussian Copula, all fitted inside each training fold so a synthetic patient can never leak a validation patient, all feeding the same forest, each with its own tuned threshold. The honest finding: no generator beat class weighting. CTGAN missed 8 more patients. With about 170 diabetic patients per fold a GAN cannot learn the joint distribution. TVAE does raise recall at 0.50 - but once every variant gets its own threshold that advantage disappears. The threshold was the real lever.");
const syn = M.step3_synthetic.slice().sort((a, b) => a.recall_tuned - b.recall_tuned || a.pr_auc - b.pr_auc);
s.addChart(pres.charts.BAR, [{ name: "Recall at its recall-first threshold", labels: syn.map(v => v.variant), values: syn.map(v => +v.recall_tuned.toFixed(3)) }],
  Object.assign(chartBase(), { x: MX, y: 1.3, w: 7.3, h: 5.3, barDir: "bar", chartColors: syn.map(v => ({ "none (class weights)": HEX.accent1, "none (unweighted)": "9A9DA3", SMOTE: HEX.accent3, "Gaussian Copula": HEX.accent5, CTGAN: HEX.accent2, TVAE: HEX.accent4 }[v.variant])), showValue: true, dataLabelPosition: "outEnd", dataLabelFormatCode: "0.000", showLegend: false, valAxisMinVal: 0.8, valAxisMaxVal: 0.95, valAxisHidden: true, valGridLine: { style: "none" }, showTitle: true, title: "Out-of-fold recall on real patients (same forest, same folds)", titleFontSize: 13, titleColor: INK2, objectName: "synthetic-chart" }));
card(s, 8.2, 1.45, 4.53, 5.1, "EEECF9");
s.addText([{ text: "Finding", options: { bold: true, fontSize: 18, color: HEX.accent4, breakLine: true } },
  { text: "No generator beat class weighting.", options: { bold: true, fontSize: 16, breakLine: true } }], { x: 8.45, y: 1.6, w: 4.0, h: 0.9, valign: "top", margin: 0, isTextBox: true, color: HEX.dk1 });
bullets(s, [
  [{ text: "Class weights / SMOTE: ", options: { bold: true } }, { text: "0.916 recall" }],
  [{ text: "TVAE: ", options: { bold: true } }, { text: "0.902  ·  CTGAN: 0.878 (8 more missed)" }],
  "~170 diabetic patients per fold is too few for a GAN to learn 8 joint features",
  "TVAE's edge at 0.50 vanishes once each variant gets its own threshold",
  [{ text: "Deployed model trains on real patients only", options: { bold: true } }]], 8.45, 2.6, 4.05, 3.8, 14);

// 12 - Fidelity
s = slide("CONTENT", "Generative AI", "Are the synthetic patients realistic - and private?",
  "SPEAKER: Prem (0:40).\nWe audited what the generators produce. Left: real versus generated glucose and BMI. CTGAN piles patients onto the lower bound - classic GAN boundary collapse on small data. Right: a discriminator trying to spot fakes reaches 0.93 AUC on CTGAN - they are easy to tell apart - versus 0.75 for SMOTE. But SMOTE's rows sit much closer to real patients than real patients sit to each other: it is the closest to copying people, which is a privacy consideration. No method produced exact copies.");
image(s, FIG("19_synthetic_fidelity.png"), MX, 1.35, W - 2 * MX, 4.2, "Synthetic fidelity audit");
const fid = M.step3_synthetic_fidelity.summary;
s.addTable([["Generator", "Mean KS (0 = identical)", "Discriminator AUC (0.5 = realistic)", "Nearest-real distance (real-to-real 1.31)"].map(h => ({ text: h, options: { bold: true, color: "FFFFFF", fill: { color: HEX.dk2 } } }))].concat(
  fid.map((f, i) => [f.generator, f.mean_ks.toFixed(3), f.discriminator_auc.toFixed(3), f.median_dcr_synthetic.toFixed(2)].map((c, j) => ({ text: c, options: { bold: j === 0, align: j ? "right" : "left", fill: { color: i % 2 ? "FFFFFF" : "F6F7F4" } } })))),
  { x: MX, y: 5.6, w: W - 2 * MX, colW: [2.6, 2.8, 3.4, 3.33], rowH: 0.27, fontSize: 11, border: { type: "solid", pt: 0.5, color: "E1E2DC" }, valign: "middle", margin: [0.02, 0.12, 0.02, 0.12], fontFace: "Calibri", objectName: "fidelity-table" });

// 13 - LLM pipeline
s = slide("CONTENT", "Generative AI", "Generative layer 2: SHAP values to plain language",
  "SPEAKER: Prem (1:00).\nThe second generative layer is the one the jury asked for: prompt plus SHAP values to a plain-language risk summary with a clinician-review disclaimer. TreeSHAP gives exact contributions - the baseline plus the contributions equals the prediction. Those numbers plus WHO, ADA and Asian-Indian clinical bands become a structured prompt. Claude writes four fixed sections. It may only restate computed numbers, may not diagnose or prescribe, and may not blame non-modifiable factors. The disclaimer is appended by our server, not requested from the model, so it is on every response. Without a key or network the same SHAP values feed a deterministic template, and the screen says which one wrote the text.");
const steps = [["1", "Patient -> forest", "Probability vs the\n0.28 cut-off", HEX.accent1], ["2", "TreeSHAP", "Exact contributions\nthat sum to the prediction", HEX.accent1], ["3", "Structured prompt", "Numbers + WHO / ADA /\nAsian-Indian bands only", HEX.accent1], ["G2", "Claude writes", "4 fixed sections,\nno diagnosis, no drugs", HEX.accent4], ["5", "Safety layer", "Disclaimer appended;\ntemplate fallback offline", HEX.accent3]];
steps.forEach(([n, h1, d1, col], i) => {
  const x = MX + i * 2.46;
  card(s, x, 1.45, 2.2, 2.1, i === 3 ? "EEECF9" : "F6F7F4");
  s.addShape(pres.shapes.OVAL, { x: x + 0.2, y: 1.62, w: 0.55, h: 0.55, fill: { color: col }, line: { color: col }, objectName: "step-dot" });
  s.addText(n, { x: x + 0.2, y: 1.62, w: 0.55, h: 0.55, fontSize: 13, bold: true, color: "FFFFFF", align: "center", valign: "middle", margin: 0, isTextBox: true });
  s.addText([{ text: h1, options: { bold: true, fontSize: 15, breakLine: true } }, { text: d1, options: { fontSize: 12.5, color: INK2 } }], { x: x + 0.2, y: 2.28, w: 1.85, h: 1.2, valign: "top", margin: 0, isTextBox: true, color: HEX.dk1 });
});
[["Grounded", "Sees only computed values and recognised clinical cut-offs; told never to invent a statistic"], ["Bounded", "May not diagnose, prescribe, or blame age and family history"], ["Honest provenance", "Every summary labelled LLM or template; the exact prompt is viewable"]].forEach(([h1, d1], i) => {
  const x = MX + i * 4.1;
  s.addText([{ text: h1, options: { bold: true, fontSize: 16, color: HEX.accent4, breakLine: true } }, { text: d1, options: { fontSize: 14, color: INK2 } }], { x, y: 3.85, w: 3.8, h: 1.2, valign: "top", margin: 0, isTextBox: true });
});
card(s, MX, 5.3, W - 2 * MX, 1.25, "FDF3DD");
s.addText([{ text: "Disclaimer appended by the server to every summary:  ", options: { bold: true, color: "8A5C00" } },
  { text: "\"This summary was generated automatically from a screening model trained on 768 women of Pima heritage. It is not a diagnosis and must be reviewed by a qualified clinician.\"", options: { italic: true, color: HEX.dk1 } }],
  { x: MX + 0.25, y: 5.38, w: W - 2 * MX - 0.5, h: 1.1, fontSize: 14, valign: "middle", margin: 0, isTextBox: true });

// 14 - Live demo
s = slide("CONTENT", "Generative AI", "Live demo: score, explain, and ask the AI",
  "SPEAKER: Prem (2:00 demo).\nSwitch to the dashboard (python app/app.py; press P for presentation mode). 1) Load a real held-out patient - the true outcome is shown beside the score. 2) Load the high-risk example: 92.6% risk, flagged. The SHAP waterfall shows glucose adding 18 points. 3) Press Explain with AI - Claude writes the four-section summary with the disclaimer; open 'Show the exact prompt'. 4) What-if: bring BMI to the Asian-Indian healthy limit of 23 and risk drops 23 points. Backup if audio or network fails: the template fallback works offline, and these screenshots are in the report.");
image(s, ASSET("pred_left.png"), MX, 1.3, 4.5, 5.35, "Predictor inputs with clinical bands");
image(s, ASSET("pred_right.png"), 5.35, 1.3, 2.85, 5.35, "Prediction, SHAP and AI explanation");
bullets(s, [
  [{ text: "Real held-out patient ", options: { bold: true } }, { text: "with the true outcome beside the score" }],
  [{ text: "Clinical bands ", options: { bold: true } }, { text: "on every input - WHO / ADA, Asian-Indian BMI" }],
  [{ text: "Exact SHAP waterfall: ", options: { bold: true } }, { text: "50% baseline + contributions = 92.6%" }],
  [{ text: "Explain with AI: ", options: { bold: true } }, { text: "4-part summary + disclaimer + the exact prompt" }],
  [{ text: "What-if: ", options: { bold: true } }, { text: "BMI to 23 lowers risk by 23 points" }]], 8.55, 1.5, 4.2, 4.6, 15);
s.addText("Run:  python app/app.py  ->  http://127.0.0.1:5000  ·  press P for presentation mode", { x: 8.55, y: 6.2, w: 4.2, h: 0.45, fontSize: 12, color: MUTED, margin: 0, isTextBox: true });

// 15 - India
pres.addSection({ title: "Ethics and India" });
s = slide("CONTENT", "Ethics and India", "For Indian patients, the threshold must be re-tuned",
  "SPEAKER: Saanvi (1:00).\nThe jury asked about external validity for Indian patients. Pima is a cohort of women aged 21+ of one ancestry. Under a prevalence shift, recall carries over but precision does not. At the ICMR-INDIAB national prevalence of 11.4%, precision at our 0.28 threshold falls to about 21% - below our 0.50 guard - so the threshold must be re-tuned. Indians also develop diabetes at lower BMI, so the predictor uses the Asian-Indian cut-offs of 23 and 25. Our re-validation protocol: collect an Indian cohort with OGTT or HbA1c labels, score it with the frozen pipeline, check feature shift, re-tune only the threshold, and refit if calibration or AUC degrade. Any same-schema CSV dropped in data/external is scored automatically.");
image(s, FIG("24_prevalence_transport.png"), MX, 1.35, 6.6, 5.0, "Prevalence transport");
const tr = M.step5_transport;
s.addTable([["Population", "Prevalence", "Precision", "Missed / 10k"].map(h => ({ text: h, options: { bold: true, color: "FFFFFF", fill: { color: HEX.dk2 } } }))].concat(
  tr.map((r, i) => [r.name, pct(r.prevalence), pct(r.precision, 0), String(r.per_10k_missed)].map((c, j) => ({ text: c, options: { bold: j === 2, align: j ? "right" : "left", color: j === 2 ? (r.meets_precision_guard ? "0B7A3B" : HEX.accent6) : HEX.dk1, fill: { color: i % 2 ? "FFFFFF" : "F6F7F4" } } })))),
  { x: 7.45, y: 1.4, w: 5.28, colW: [2.4, 1.0, 0.94, 0.94], rowH: 0.48, fontSize: 12, border: { type: "solid", pt: 0.5, color: "E1E2DC" }, valign: "middle", margin: [0.03, 0.08, 0.03, 0.08], fontFace: "Calibri", objectName: "transport-table" });
s.addText([{ text: "Re-validation protocol", options: { bold: true, fontSize: 15, breakLine: true, color: HEX.dk2 } }], { x: 7.45, y: 4.05, w: 5.28, h: 0.35, margin: 0, isTextBox: true });
s.addText([
  "Indian cohort with OGTT / HbA1c labels",
  "Score with the frozen pipeline; report CIs and calibration",
  "Check feature shift (BMI-risk relation differs)",
  "Re-tune only the threshold; refit if AUC degrades"].map((x, i, a) => ({ text: x, options: { bullet: { type: "number" }, breakLine: i < a.length - 1 } })),
  { x: 7.45, y: 4.45, w: 5.28, h: 2.1, fontSize: 13.5, color: HEX.dk1, valign: "top", paraSpaceAfter: 6, margin: 0, isTextBox: true });

// 16 - Ethics
s = slide("CONTENT", "Ethics and India", "The trade in people, and the limits we state",
  "SPEAKER: Saanvi (0:50).\nPer 10,000 screened, the recall-first threshold rescues 584 people from a false all-clear at the cost of 1,169 additional blood tests - we consider that defensible and we state it. The limits are written in the model card shipped beside the weights: single-ancestry female cohort, 54 positive test cases, no external validation, a prevalence-dependent threshold, and an LLM that can be fluent and wrong - which is why it only sees computed numbers and every summary needs clinician review.");
stat(s, MX, 1.45, 3.6, "-584", "people wrongly cleared, per 10,000", "0B7A3B", "909 at 0.50 -> 325 at 0.28");
stat(s, MX, 3.6, 3.6, "+1,169", "extra confirmatory tests, per 10,000", HEX.accent2, "the price of the trade, stated openly");
card(s, 4.55, 1.45, 8.18, 5.1, "F6F7F4");
s.addText("Stated in models/model_card.json, shipped beside the weights", { x: 4.85, y: 1.6, w: 7.6, h: 0.4, fontSize: 15, bold: true, color: HEX.dk2, margin: 0, isTextBox: true });
bullets(s, [
  [{ text: "Population: ", options: { bold: true } }, { text: "768 women of Pima heritage, 21+. Anything else is extrapolation." }],
  [{ text: "Sample size: ", options: { bold: true } }, { text: "54 positive test cases - hence the bootstrap intervals." }],
  [{ text: "Prevalence: ", options: { bold: true } }, { text: "threshold tuned at 34.9%; must be re-tuned for India (21% precision at 11.4%)." }],
  [{ text: "LLM risk: ", options: { bold: true } }, { text: "fluent but fallible - grounded inputs, no diagnosis, mandatory clinician review." }],
  [{ text: "Automation bias: ", options: { bold: true } }, { text: "UI shows a probability, band and action - never a bare 'negative'." }],
  [{ text: "Not a diagnosis: ", options: { bold: true } }, { text: "it ranks patients for a confirmatory blood test." }]], 4.85, 2.15, 7.6, 4.3, 15);

// 17 - Conclusion
pres.addSection({ title: "Close" });
s = slide("SECTION_DARK", "Close", "The threshold mattered more than the model",
  "SPEAKER: Suvesha (0:40).\nThree takeaways. One: recognising the hidden missing values and tuning the threshold for recall bought 17 points of recall - more than any model choice. Two: generative AI earned its place where it explains, and we measured honestly where it did not help - CTGAN did not beat class weights on 214 patients. Three: the process transfers even though this model does not - next we would validate on an Indian cohort. Thank you; we are happy to take questions.");
s.addText("Generative AI earned its place where it explains - and we measured honestly where it did not help.", { placeholder: "body" });
s.addText("90.7% recall [82.4 - 98.0]  ·  5 of 54 missed  ·  CTGAN / TVAE benchmarked  ·  SHAP -> LLM explanations", { x: MX, y: 5.0, w: 12.1, h: 0.45, fontSize: 15, color: "C5D2E3", margin: 0, isTextBox: true, objectName: "summary-line" });
s.addText("Next: validate on an Indian cohort  ·  re-tune the threshold at local prevalence  ·  clinician study of the AI explanations", { x: MX, y: 5.6, w: 12.1, h: 0.6, fontSize: 15, color: "FFFFFF", margin: 0, isTextBox: true, objectName: "next-steps" });

// 18-19 Appendix
pres.addSection({ title: "Appendix" });
s = slide("CONTENT", "Appendix", "Prepared answers: generative AI questions",
  "APPENDIX - not presented. All four members should be able to answer these.");
const qa = [
  ["Why not deploy the CTGAN-augmented model?", "Because it was measured and lost: 0.878 recall vs 0.916, and its samples are easy to spot (discriminator AUC 0.93). On 214 diabetics a GAN under-fits. We report the negative result rather than ship a worse model to tick a box."],
  ["Can the LLM hallucinate a wrong number?", "It only receives numbers our pipeline computed, is told not to invent statistics, and the prompt is shown on screen. It cannot change the prediction - the forest decides; the LLM only explains. The disclaimer is added by our code, not the model."],
  ["Why SHAP instead of the old occlusion method?", "TreeSHAP is exact for tree ensembles and additive: baseline + contributions = prediction (gap 0). Occlusion ignored interactions; SHAP accounts for them."],
  ["What if there is no internet in the jury room?", "The same SHAP values feed a deterministic template, labelled as such on screen. Nothing silently pretends an LLM was used."]
];
qa.forEach(([q, a], i) => {
  const x = MX + (i % 2) * 6.17, y = 1.4 + Math.floor(i / 2) * 2.6;
  card(s, x, y, 5.95, 2.4, i % 3 === 0 ? "EEECF9" : "F6F7F4");
  s.addText([{ text: q, options: { bold: true, fontSize: 15, breakLine: true, color: HEX.dk2 } }, { text: a, options: { fontSize: 13, color: INK2 } }], { x: x + 0.22, y: y + 0.15, w: 5.5, h: 2.1, valign: "top", margin: 0, isTextBox: true });
});

s = slide("CONTENT", "Appendix", "Where the project maps onto the syllabus",
  "APPENDIX - syllabus mapping.");
s.addTable([["Concept", "Where it appears"].map(h => ({ text: h, options: { bold: true, color: "FFFFFF", fill: { color: HEX.dk2 } } }))].concat([
  ["Generative vs discriminative", "Gaussian Naive Bayes (models P(x|y)) vs discriminative models; CTGAN, TVAE, Copula generate patients"],
  ["GANs and VAEs", "CTGAN (generator vs critic) and TVAE (latent-space sampling) benchmarked on identical folds"],
  ["Large language models", "Claude turns SHAP values into a patient-facing explanation, with grounding, bounds and a disclaimer"],
  ["Latent representations", "PCA latent view of the 8 features; TVAE's learned latent space"],
  ["ML lifecycle", "Problem framing -> data audit -> model selection -> tuning -> evaluation -> ethics -> deployment -> monitoring"],
  ["Responsible AI", "Model card, per-10,000 impact, bootstrap CIs, India transport analysis, LLM provenance labels"]
].map((r, i) => r.map((c, j) => ({ text: c, options: { bold: j === 0, fill: { color: i % 2 ? "FFFFFF" : "F6F7F4" } } })))),
  { x: MX, y: 1.4, w: W - 2 * MX, colW: [3.2, 8.93], rowH: 0.7, fontSize: 14, border: { type: "solid", pt: 0.75, color: "E1E2DC" }, valign: "middle", margin: [0.05, 0.15, 0.05, 0.15], fontFace: "Calibri", objectName: "syllabus-table" });

(async () => {
  await pres.writeFile({ fileName: OUT });
  if (SKILL) {
    const { applyTheme } = require(path.join(SKILL, "scripts", "apply_theme.js"));
    await applyTheme(OUT, THEME);
  }
  console.log("wrote", OUT, "slides:", order);
})();
