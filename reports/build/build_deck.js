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
/* Nine slides in the faculty format: Title, Objective, Design Principles, Block Diagram,
   Flowchart, Technical model detail, Generative AI, Working model, Conclusion. */
pres.addSection({ title: "Introduction" });

// 1 - Title
let s = slide("TITLE_DARK", "Introduction", "Catching diabetes before it catches the patient",
  "SPEAKER: Suvesha (0:30).\nGood morning. We built a screening model that predicts diabetes onset from eight routine clinical measurements, plus a generative AI layer that explains every result in plain language. We deliberately tuned the model to miss as few sick people as possible, even if that costs some overall accuracy. Each of us will present one part.");
s.addText("A recall-first screener with a generative AI explanation layer - Pima Indians Diabetes Database", { placeholder: "body" });
s.addText("Prem Rasik Maradiya  ·  Saanvi Rajendra Dhote  ·  Suvesha Anil Khan  ·  Atharva Dhobale", { x: MX, y: 5.35, w: 11, h: 0.4, fontSize: 15, color: "FFFFFF", margin: 0, isTextBox: true, objectName: "team" });
s.addText("LY CORE-3  ·  Generative AI  ·  Model Making  ·  MIT ADT University, Pune", { x: MX, y: 5.8, w: 11, h: 0.35, fontSize: 13, color: "8FA1BA", margin: 0, isTextBox: true, objectName: "course" });
[["90.7%", "test recall", "7EE2A8"], ["5 / 54", "cases missed", "FF9F9F"], ["2", "generative layers", "C4B5FD"]].forEach(([v, l, c], i) => {
  const x = 10.25, y = 1.2 + i * 1.45;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: 2.5, h: 1.2, fill: { color: "1B2B44" }, line: { color: "2B3E5C", width: 0.75 }, rectRadius: 0.1, objectName: "hero-kpi" });
  s.addText(v, { x: x + 0.22, y: y + 0.12, w: 2.1, h: 0.62, fontSize: 30, bold: true, color: c, margin: 0, isTextBox: true, objectName: "hero-kpi-value" });
  s.addText(l, { x: x + 0.22, y: y + 0.74, w: 2.1, h: 0.32, fontSize: 13, color: "C5D2E3", margin: 0, isTextBox: true, objectName: "hero-kpi-label" });
});

// 2 - Objective
s = slide("CONTENT", "Introduction", "Objective: don't miss the patient who is becoming diabetic",
  "SPEAKER: Suvesha (1:00).\n34.9% of this cohort is diabetic, so a model that says 'nobody has diabetes' scores 65.1% accuracy and catches zero patients. The two mistakes are not equal: a missed case leaves the screening funnel and the harm grows silently for years, while a false alarm costs one blood test. So our objective is recall - catch as many future diabetics as possible - while keeping precision at least 0.50 so the follow-up clinic stays manageable. Second objective: explain every result in plain language using generative AI.");
stat(s, MX, 1.5, 3.4, "34.9%", "of patients are diabetic", HEX.accent2, "268 of 768 - an imbalanced problem");
stat(s, MX, 3.6, 3.4, "65.1%", "accuracy of 'nobody has diabetes'", HEX.accent6, "...and it catches zero patients");
card(s, 4.5, 1.45, 3.95, 4.5, "FDF0EE", "fn-card");
s.addText("Missed case (false negative)", { x: 4.75, y: 1.7, w: 3.6, h: 0.45, fontSize: 16.5, bold: true, color: HEX.accent6, margin: 0, isTextBox: true });
bullets(s, ["Patient is told they are fine", "Leaves the screening funnel", "Harm grows silently for years"], 4.8, 2.35, 3.4, 3.2, 16);
card(s, 8.7, 1.45, 4.03, 4.5, "EEF4FC", "fp-card");
s.addText("False alarm (false positive)", { x: 8.95, y: 1.7, w: 3.65, h: 0.45, fontSize: 16.5, bold: true, color: HEX.accent1, margin: 0, isTextBox: true });
bullets(s, ["Healthy patient is called back", "Costs one confirmatory blood test", "Resolved within days"], 9.0, 2.35, 3.5, 3.2, 16);
card(s, 4.5, 6.1, 8.23, 0.75, HEX.dk2, "objective-card");
s.addText("Goal: maximise recall (precision ≥ 0.50)  +  explain every result in plain language", { x: 4.7, y: 6.1, w: 7.9, h: 0.75, fontSize: 15, bold: true, color: "FFFFFF", valign: "middle", margin: 0, isTextBox: true, objectName: "objective" });

// 3 - Design principles
pres.addSection({ title: "Design" });
s = slide("CONTENT", "Design", "Design principles",
  "SPEAKER: Saanvi (1:00).\nSix rules shaped every decision. Recall first, because a missed case is far worse than a false alarm. Clean the data honestly: 652 zeros were really missing values. No leakage: the imputer and model are one Pipeline refitted inside each fold, and the threshold is tuned without touching the test set. Every prediction is explained with exact SHAP values. Generative AI is measured, not assumed. And it is safe by design: it flags people for a blood test, never diagnoses, and every AI summary carries a clinician-review disclaimer.");
const principles = [
  ["Recall first", "A missed patient costs far more than a false alarm, so the cut-off is tuned for recall with a precision floor of 0.50.", HEX.accent6],
  ["Honest data", "652 biologically impossible zeros (glucose, BP, BMI...) are treated as missing; zero pregnancies stay as real values.", HEX.accent2],
  ["No data leakage", "Imputer + model in one Pipeline, refitted per CV fold; threshold chosen out-of-fold; test set used once.", HEX.accent1],
  ["Explain every result", "Exact TreeSHAP shows how many points each measurement moved the risk.", HEX.accent5],
  ["GenAI, measured", "CTGAN / TVAE tested against SMOTE; the LLM sees only computed numbers.", HEX.accent4],
  ["Safe by design", "Flags for a confirmatory test, never diagnoses; clinician disclaimer on every AI summary.", HEX.accent3]
];
const pw = (W - 2 * MX - 0.5) / 3;
principles.forEach(([h1, d1, col], i) => {
  const x = MX + (i % 3) * (pw + 0.25), y = 1.4 + Math.floor(i / 3) * 2.65;
  card(s, x, y, pw, 2.4, "F6F7F4", "principle-card");
  s.addShape(pres.shapes.OVAL, { x: x + 0.25, y: y + 0.25, w: 0.55, h: 0.55, fill: { color: col }, line: { color: col }, objectName: "principle-dot" });
  s.addText(String(i + 1), { x: x + 0.25, y: y + 0.25, w: 0.55, h: 0.55, fontSize: 16, bold: true, color: "FFFFFF", align: "center", valign: "middle", margin: 0, isTextBox: true });
  s.addText(h1, { x: x + 0.95, y: y + 0.25, w: pw - 1.15, h: 0.55, fontSize: 19, bold: true, color: HEX.dk2, valign: "middle", margin: 0, isTextBox: true });
  s.addText(d1, { x: x + 0.25, y: y + 0.95, w: pw - 0.5, h: 1.3, fontSize: 14, color: INK2, valign: "top", margin: 0, isTextBox: true });
});

// 4 - Block diagram
s = slide("CONTENT", "Design", "Block diagram",
  "SPEAKER: Saanvi (1:00).\nThe main path runs left to right: raw data, the domain rule that turns impossible zeros into missing values, one scikit-learn Pipeline with the median imputer and Random Forest, the tuned threshold of 0.28, and the decision - a flag for a confirmatory blood test. The two violet blocks are the generative layers: G1 creates synthetic patients for the training experiments, and G2 turns each prediction and its SHAP values into a plain-language explanation written by Gemini.");
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
[[gx1 + (bw + gap) / 2, "G1  Synthetic patients", "CTGAN · TVAE · Gaussian Copula\nbenchmarked against SMOTE"], [gx2, "G2  LLM explanation", "TreeSHAP + clinical bands -> Gemini\n-> summary + clinician disclaimer"]].forEach(([x, h1, d1]) => {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 3.75, w: 3.0, h: 1.35, fill: { color: "EEECF9" }, line: { color: HEX.accent4, width: 1.25 }, rectRadius: 0.1, objectName: "gen-block" });
  s.addText([{ text: h1, options: { bold: true, fontSize: 15, color: HEX.accent4, breakLine: true } }, { text: d1, options: { fontSize: 12.5, color: INK2 } }], { x: x + 0.12, y: 3.8, w: 2.76, h: 1.25, align: "center", valign: "middle", margin: 0, isTextBox: true });
  s.addShape(pres.shapes.LINE, { x: x + 1.5, y: by + 1.35, w: 0, h: 3.75 - by - 1.35, line: { color: HEX.accent4, width: 1.25, dashType: "dash" }, objectName: "gen-link" });
});
s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: MX, y: 5.55, w: W - 2 * MX, h: 1.05, fill: { color: "F6F7F4" }, line: { color: "E1E2DC" }, rectRadius: 0.08, objectName: "code-card" });
s.addText([{ text: "Leak-free by construction:  ", options: { bold: true, color: HEX.dk1 } },
  { text: 'Pipeline([("impute", SimpleImputer(strategy="median")), ("model", RandomForestClassifier(500 trees, depth 6, balanced))])', options: { fontFace: "Consolas", color: HEX.accent4 } },
  { text: "  - refitted inside every CV fold; the test set is touched once.", options: { color: INK2 } }],
  { x: MX + 0.25, y: 5.6, w: W - 2 * MX - 0.5, h: 0.95, fontSize: 13, valign: "middle", margin: 0, isTextBox: true, objectName: "code-text" });

// 5 - Flowchart
s = slide("CONTENT", "Design", "Flowchart",
  "SPEAKER: Atharva (1:00).\nTraining, top half: load the data, audit every column, mark the 652 impossible zeros as missing, lock away a 20% test set, cross-validate seven models inside the Pipeline, pick Random Forest on F2, then lower the cut-off until precision would drop below 0.50 - that gives 0.28. Only then is the test set scored, once. Serving, bottom half: the user enters 8 measurements, the model predicts and computes SHAP, Gemini writes the summary - or a template if there is no key or network - and the screen shows risk, flag, SHAP and the disclaimer.");
image(s, FIG("diagram_flowchart.png"), MX, 1.25, 4.4, 5.55, "Process flowchart", false);
s.addText("Training", { x: 5.6, y: 1.4, w: 7.1, h: 0.4, fontSize: 18, bold: true, color: HEX.accent1, margin: 0, isTextBox: true });
s.addText([
  "Load 768 patients; mark 652 impossible zeros as missing",
  "Stratified 80/20 split - the test set is locked away",
  "5-fold CV of 7 models inside Pipeline(imputer, model)",
  "Pick Random Forest on F2; tune the cut-off out-of-fold to 0.28",
  "Score the test set once, with 95% confidence intervals"].map((x, i, a) => ({ text: x, options: { bullet: { type: "number" }, breakLine: i < a.length - 1 } })),
  { x: 5.6, y: 1.85, w: 7.1, h: 2.3, fontSize: 15, color: HEX.dk1, valign: "top", paraSpaceAfter: 6, margin: 0, isTextBox: true });
s.addText("Using the model", { x: 5.6, y: 4.35, w: 7.1, h: 0.4, fontSize: 18, bold: true, color: HEX.accent4, margin: 0, isTextBox: true });
s.addText([
  "User enters 8 measurements",
  "Model predicts the risk and computes exact SHAP values",
  "Gemini writes the summary (template if offline)",
  "Screen shows risk, flag, SHAP, summary and the disclaimer"].map((x, i, a) => ({ text: x, options: { bullet: { type: "number", numberStartAt: 6 }, breakLine: i < a.length - 1 } })),
  { x: 5.6, y: 4.8, w: 7.1, h: 1.9, fontSize: 15, color: HEX.dk1, valign: "top", paraSpaceAfter: 6, margin: 0, isTextBox: true });

// 6 - Technical model detail
pres.addSection({ title: "Model" });
s = slide("CONTENT", "Model", "Technical model detail",
  "SPEAKER: Atharva (1:30).\nWe compared seven models on identical folds and selected on F2, which weights recall four times more than precision. Random Forest won: 500 trees, depth 6, balanced class weights, with the median imputer inside the pipeline. The real lever was the threshold: at the default 0.50 the model misses 14 of 54 diabetic test patients; at our tuned 0.28 it misses only 5. On the right, every metric at 0.28 with its 95% bootstrap interval - recall 90.7%, between 82 and 98 percent because the test set has only 54 positive cases.");
card(s, MX, 1.4, 3.9, 5.2, "F6F7F4");
s.addText("The model", { x: MX + 0.25, y: 1.55, w: 3.4, h: 0.45, fontSize: 18, bold: true, color: HEX.dk2, margin: 0, isTextBox: true });
bullets(s, [
  "7 models compared on identical 5-fold CV",
  "Selected on F2 (recall-weighted)",
  "Random Forest: 500 trees, depth 6, balanced classes",
  "Median imputer inside the Pipeline",
  "Cut-off tuned out-of-fold: 0.28"], MX + 0.25, 2.1, 3.45, 4.3, 15);
[[1.4, "Default cut-off 0.50", d.fn, "F6F7F4", HEX.accent6], [4.05, "Tuned cut-off 0.28", t.fn, "E9F7EF", "0B7A3B"]].forEach(([y, lab, fn, fill, col]) => {
  card(s, 4.75, y, 3.4, 2.55, fill);
  s.addText(lab, { x: 5.0, y: y + 0.15, w: 3.0, h: 0.4, fontSize: 15, bold: true, color: INK2, margin: 0, isTextBox: true });
  s.addText(String(fn), { x: 5.0, y: y + 0.6, w: 1.3, h: 1.2, fontSize: 66, bold: true, color: col, margin: 0, isTextBox: true });
  s.addText("of 54 diabetic patients missed", { x: 6.3, y: y + 0.85, w: 1.75, h: 0.8, fontSize: 14, color: HEX.dk1, margin: 0, isTextBox: true });
});
const ciRows = [["Recall", "recall"], ["Precision", "precision"], ["F1", "f1"], ["Specificity", "specificity"], ["ROC-AUC", "roc_auc"], ["Brier score", "brier"]];
s.addTable([["At 0.28", "Value", "95% CI"].map(h => ({ text: h, options: { bold: true, color: "FFFFFF", fill: { color: HEX.dk2 } } }))].concat(
  ciRows.map(([n, k], i) => [{ text: n, options: { bold: true } }, { text: ci[k].point.toFixed(3), options: { bold: k === "recall", color: k === "recall" ? "0B7A3B" : HEX.dk1, align: "right" } }, { text: `${ci[k].lo.toFixed(2)} - ${ci[k].hi.toFixed(2)}`, options: { color: INK2, align: "right" } }].map(c => { c.options.fill = { color: i % 2 ? "FFFFFF" : "F6F7F4" }; return c; }))),
  { x: 8.4, y: 1.4, w: 4.33, colW: [1.55, 1.13, 1.65], rowH: 0.55, fontSize: 14, border: { type: "solid", pt: 0.75, color: "E1E2DC" }, valign: "middle", margin: [0.04, 0.12, 0.04, 0.12], fontFace: "Calibri", objectName: "ci-table" });
s.addText(`Confusion at 0.28 (154 test patients): ${t.tp} caught · ${t.fn} missed · ${t.fp} false alarms · ${t.tn} cleared`, { x: 8.4, y: 5.4, w: 4.33, h: 1.2, fontSize: 14, color: INK2, valign: "top", margin: 0, isTextBox: true, objectName: "confusion" });

// 7 - Generative AI
pres.addSection({ title: "Generative AI" });
s = slide("CONTENT", "Generative AI", "Generative AI: two layers",
  "SPEAKER: Prem (1:15).\nLayer one: we generated synthetic diabetic patients with CTGAN, TVAE and a Gaussian Copula, fitted inside each training fold, and compared them with SMOTE and no augmentation on the same forest and folds. Honest result: none beat simple class weighting - with about 170 diabetic patients per fold a GAN cannot learn the data well - so the final model trains on real patients only. Layer two is what the jury asked for: exact SHAP values plus clinical reference ranges go into a structured prompt, Gemini writes a four-part plain-language summary, and our server always adds the clinician-review disclaimer. Without internet a template uses the same numbers and says so.");
const syn = M.step3_synthetic.slice().sort((a, b) => a.recall_tuned - b.recall_tuned || a.pr_auc - b.pr_auc);
s.addText("G1  Synthetic patients", { x: MX, y: 1.35, w: 6.0, h: 0.45, fontSize: 19, bold: true, color: HEX.accent4, margin: 0, isTextBox: true });
s.addChart(pres.charts.BAR, [{ name: "Recall", labels: syn.map(v => v.variant), values: syn.map(v => +v.recall_tuned.toFixed(3)) }],
  Object.assign(chartBase(), { x: MX, y: 1.8, w: 6.0, h: 3.6, barDir: "bar", chartColors: syn.map(v => ({ "none (class weights)": HEX.accent1, "none (unweighted)": "9A9DA3", SMOTE: HEX.accent3, "Gaussian Copula": HEX.accent5, CTGAN: HEX.accent2, TVAE: HEX.accent4 }[v.variant])), showValue: true, dataLabelPosition: "outEnd", dataLabelFormatCode: "0.000", showLegend: false, valAxisMinVal: 0.8, valAxisMaxVal: 0.95, valAxisHidden: true, valGridLine: { style: "none" }, showTitle: true, title: "Recall on real patients (same forest, same folds)", titleFontSize: 12, titleColor: INK2, objectName: "synthetic-chart" }));
card(s, MX, 5.55, 6.0, 1.05, "EEECF9");
s.addText([{ text: "Result: ", options: { bold: true, color: HEX.accent4 } }, { text: "no generator beat class weighting (CTGAN 0.878 vs 0.916), so the final model trains on real patients only." }],
  { x: MX + 0.2, y: 5.6, w: 5.6, h: 0.95, fontSize: 14, color: HEX.dk1, valign: "middle", margin: 0, isTextBox: true });
s.addText("G2  LLM explanation (Gemini)", { x: 6.95, y: 1.35, w: 5.78, h: 0.45, fontSize: 19, bold: true, color: HEX.accent4, margin: 0, isTextBox: true });
[["1", "Exact TreeSHAP", "how much each measurement moved the risk"], ["2", "Structured prompt", "computed numbers + WHO / ADA / Asian-Indian ranges"], ["3", "Gemini writes", "4 sections: found · driving it · could help · next step"], ["4", "Safety layer", "server adds the clinician disclaimer; template if offline"]].forEach(([n, h1, d1], i) => {
  const y = 1.9 + i * 1.18;
  card(s, 6.95, y, 5.78, 1.03, i === 2 ? "EEECF9" : "F6F7F4");
  s.addShape(pres.shapes.OVAL, { x: 7.15, y: y + 0.24, w: 0.55, h: 0.55, fill: { color: i === 2 ? HEX.accent4 : HEX.accent1 }, line: { color: i === 2 ? HEX.accent4 : HEX.accent1 }, objectName: "step-dot" });
  s.addText(n, { x: 7.15, y: y + 0.24, w: 0.55, h: 0.55, fontSize: 14, bold: true, color: "FFFFFF", align: "center", valign: "middle", margin: 0, isTextBox: true });
  s.addText([{ text: h1, options: { bold: true, fontSize: 16, breakLine: true } }, { text: d1, options: { fontSize: 13, color: INK2 } }], { x: 7.9, y: y + 0.08, w: 4.7, h: 0.87, valign: "middle", margin: 0, isTextBox: true, color: HEX.dk1 });
});

// 8 - Working model
s = slide("CONTENT", "Generative AI", "Working model: the live predictor",
  "SPEAKER: Prem (2:00 demo).\nSwitch to the dashboard (python app/app.py; press P for presentation mode). 1) Load the high-risk example: 92.6% risk, flagged for a confirmatory test. 2) The SHAP chart shows glucose adding 18 points. 3) Press Explain with AI - Gemini writes the four-part summary with the disclaimer. 4) What-if: bring BMI to the Asian-Indian healthy limit of 23 and the risk drops 23 points. If the network fails, the template fallback works offline; the step-by-step screenshots are in the report.");
image(s, ASSET("pred_left.png"), MX, 1.3, 4.5, 5.35, "Predictor inputs with clinical bands");
image(s, ASSET("pred_right.png"), 5.35, 1.3, 2.85, 5.35, "Prediction, SHAP and AI explanation");
s.addText([
  "Enter the 8 measurements - each shows its clinical range",
  "Get the risk: 92.6%, flagged for a confirmatory test",
  "See why: exact SHAP bar for every measurement",
  "Explain with AI: Gemini's plain-language summary + disclaimer",
  "What-if: BMI to 23 lowers the risk by 23 points"].map((x, i, a) => ({ text: x, options: { bullet: { type: "number" }, breakLine: i < a.length - 1 } })),
  { x: 8.55, y: 1.5, w: 4.2, h: 4.6, fontSize: 15, color: HEX.dk1, valign: "top", paraSpaceAfter: 10, margin: 0, isTextBox: true, objectName: "steps" });
s.addText("Run:  python app/app.py  ->  http://127.0.0.1:5000", { x: 8.55, y: 6.2, w: 4.2, h: 0.45, fontSize: 12, color: MUTED, margin: 0, isTextBox: true });

// 9 - Conclusion
pres.addSection({ title: "Conclusion" });
s = slide("SECTION_DARK", "Conclusion", "Conclusion: the threshold mattered more than the model",
  "SPEAKER: Suvesha (0:45).\nThree takeaways. One: fixing the hidden missing values and tuning the threshold for recall cut missed patients from 14 to 5. Two: generative AI earned its place where it explains results, and we measured honestly where it did not help. Three: for Indian patients precision would drop to about 21% at the national prevalence of 11.4%, so the threshold must be re-tuned on an Indian cohort before any real use. Thank you - we are happy to take questions.");
s.addText("Generative AI earned its place where it explains - and we measured honestly where it did not help.", { placeholder: "body" });
s.addText("90.7% recall  ·  5 of 54 missed (was 14)  ·  CTGAN / TVAE benchmarked  ·  SHAP -> Gemini explanations", { x: MX, y: 5.0, w: 12.1, h: 0.45, fontSize: 16, color: "C5D2E3", margin: 0, isTextBox: true, objectName: "summary-line" });
s.addText("For India: re-tune the cut-off on an Indian cohort (precision falls to ~21% at 11.4% prevalence)", { x: MX, y: 5.55, w: 12.1, h: 0.45, fontSize: 16, color: "FFC9A8", margin: 0, isTextBox: true, objectName: "india-line" });
s.addText("Thank you - questions?", { x: MX, y: 6.15, w: 12.1, h: 0.5, fontSize: 20, bold: true, color: "FFFFFF", margin: 0, isTextBox: true, objectName: "thanks" });

(async () => {
  await pres.writeFile({ fileName: OUT });
  if (SKILL) {
    const { applyTheme } = require(path.join(SKILL, "scripts", "apply_theme.js"));
    await applyTheme(OUT, THEME);
  }
  console.log("wrote", OUT, "slides:", order);
})();
