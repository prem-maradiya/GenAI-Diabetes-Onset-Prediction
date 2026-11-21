/* 10-page project report.  node build_report.js <project_root> <out.docx> */
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, ShadingType,
  AlignmentType, HeadingLevel, PageBreak, Header, Footer, PageNumber, LevelFormat, BorderStyle, TableLayoutType,
  VerticalAlign
} = require("docx");

const ROOT = process.argv[2];
const OUT = process.argv[3];
const M = JSON.parse(fs.readFileSync(path.join(ROOT, "reports", "metrics.json"), "utf8"));
const ASSETS = path.join(__dirname, "assets");
const FIG = f => path.join(ROOT, "reports", "figures", f);
const SHOT = f => path.join(ROOT, "reports", "screenshots", f);

const NAVY = "0F1B2D", BLUE = "2A78D6", VIOLET = "4A3AA7", MUTED = "6B7078", INK2 = "4A4D52", GREEN = "0B7A3B", RED = "B42B2B";
const FONT = "Calibri";
const CONTENT_W = 9746; // A4 11906 - 2 x 1080 margins (0.75")

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
function img(file, widthIn, maxHeightIn) {
  const { w, h } = pngSize(file);
  let wi = widthIn, hi = widthIn * h / w;
  if (maxHeightIn && hi > maxHeightIn) { hi = maxHeightIn; wi = hi * w / h; }
  return new ImageRun({ type: "png", data: fs.readFileSync(file), transformation: { width: Math.round(wi * 96), height: Math.round(hi * 96) },
    altText: { title: path.basename(file), description: path.basename(file), name: path.basename(file) } });
}
const P = (runs, opts = {}) => new Paragraph(Object.assign({ children: (Array.isArray(runs) ? runs : [runs]).map(r => typeof r === "string" ? new TextRun(r) : r), spacing: { after: 100 } }, opts));
const B = t => new TextRun({ text: t, bold: true });
const H1 = t => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)] });
const H2 = t => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
const bullet = (runs) => new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 60 }, children: (Array.isArray(runs) ? runs : [runs]).map(r => typeof r === "string" ? new TextRun(r) : r) });
const caption = t => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60, after: 160 }, children: [new TextRun({ text: t, italics: true, size: 18, color: MUTED })] });
const centered = run => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [run] });
const pageBreak = () => new Paragraph({ children: [new PageBreak()] });

const border = { style: BorderStyle.SINGLE, size: 4, color: "D9DAD4" };
function table(headers, rows, widths, opts = {}) {
  const total = widths.reduce((a, b) => a + b, 0);
  const cell = (text, i, isHead, rowIdx) => new TableCell({
    width: { size: widths[i], type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, color: "auto", fill: isHead ? NAVY : (rowIdx % 2 ? "FFFFFF" : "F4F5F2") },
    margins: { top: 50, bottom: 50, left: 100, right: 100 },
    verticalAlign: VerticalAlign.CENTER,
    borders: { top: border, bottom: border, left: border, right: border },
    children: [new Paragraph({ spacing: { after: 0 }, alignment: (!isHead && i > 0 && opts.numeric) ? AlignmentType.RIGHT : AlignmentType.LEFT,
      children: [new TextRun({ text: String(text), bold: isHead || (opts.boldFirst && i === 0) || (opts.boldRow && opts.boldRow(rowIdx)), color: isHead ? "FFFFFF" : (opts.color ? opts.color(rowIdx, i) : undefined), size: opts.size || 19 })] })]
  });
  return new Table({
    width: { size: total, type: WidthType.DXA }, columnWidths: widths, layout: TableLayoutType.FIXED,
    rows: [new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, i, true, 0)) })]
      .concat(rows.map((r, ri) => new TableRow({ children: r.map((c, i) => cell(c, i, false, ri)) })))
  });
}

const t = M.step3_test_tuned, d = M.step3_test_default, ci = M.step3_ci_tuned;
const f3 = v => v.toFixed(3), pct = (v, n = 1) => (v * 100).toFixed(n) + "%";

/* ================================================================ content */
const page1 = [
  new Paragraph({ spacing: { before: 600, after: 80 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "MIT ADT UNIVERSITY, PUNE", bold: true, size: 26, color: NAVY })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 700 }, children: [new TextRun({ text: "LY CORE-3  ·  Generative AI  ·  Model Making  ·  Final Jury Project Report", size: 22, color: MUTED })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 }, children: [new TextRun({ text: "Diabetes Onset Risk Screener", bold: true, size: 56, color: NAVY })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [new TextRun({ text: "A recall-first supervised learning model with a generative AI explanation layer", size: 28, color: INK2 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 140 }, children: [new TextRun({ text: "Submitted by", size: 22, color: MUTED })] }),
  table(["Team member", "Section owned in the presentation"], [
    ["Prem Rasik Maradiya", "Explainability, generative AI layers, live demo"],
    ["Saanvi Rajendra Dhote", "Data cleaning, system architecture, India validity, ethics"],
    ["Suvesha Anil Khan", "Problem framing, recall objective, conclusion"],
    ["Atharva Dhobale", "Model comparison, threshold, evaluation and calibration"]
  ], [3600, 6146], { boldFirst: true, size: 21 }),
  new Paragraph({ spacing: { before: 500, after: 140 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Key results on the held-out test set (154 patients)", bold: true, size: 22, color: NAVY })] }),
  table(["Recall (95% CI)", "Missed cases", "ROC-AUC", "Generative layers"], [
    [`${pct(t.recall)}  [${pct(ci.recall.lo)} - ${pct(ci.recall.hi)}]`, `${t.fn} of 54 (was ${d.fn})`, `${f3(t.roc_auc)}`, "CTGAN / TVAE  ·  LLM"]
  ], [2700, 2350, 1800, 2896], { size: 21, boldRow: () => true, color: (r, i) => i === 0 ? GREEN : i === 1 ? RED : NAVY }),
  new Paragraph({ spacing: { before: 700 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Dataset: Pima Indians Diabetes Database (UCI / NIDDK)  ·  Tools: Python, scikit-learn, SDV, SHAP, Gemini, Flask", size: 19, color: MUTED })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "November 2026", size: 19, color: MUTED })] }),
  pageBreak()
];

const page2 = [
  H1("1. Objective"),
  P("Type-2 diabetes develops silently: by the time symptoms force a diagnosis, damage to the eyes, kidneys and nerves can already be permanent. A screening model is therefore valuable only if it finds the person who does not yet know. The two possible errors are not equal - a missed case (false negative) sends a patient who will develop diabetes out of the screening funnel for years, while a false alarm (false positive) costs one confirmatory blood test."),
  P([B("Aim. "), "Build a screening model that predicts diabetes onset from eight routine clinical measurements, optimised to miss as few diabetic patients as possible, and explain every prediction in plain language with a generative AI layer."]),
  P([B("Specific objectives")], { spacing: { after: 60 } }),
  bullet("Detect and repair the corrupted measurements hidden in the dataset without leaking test information."),
  bullet("Compare seven classifiers fairly and select one with a written, reproducible rule."),
  bullet("Tune the decision threshold for maximum recall while keeping precision at or above 0.50."),
  bullet("Report every metric at the operating point with 95% confidence intervals, calibration and clinical utility."),
  bullet("Benchmark deep generative models (CTGAN, TVAE) for synthetic minority patients against SMOTE and no augmentation."),
  bullet("Turn exact SHAP explanations into a patient-friendly summary using an LLM, with a clinician-review disclaimer."),
  bullet("State honestly where the model stops working - including for Indian patients."),
  H1("2. Design Principles"),
  table(["Principle", "What it means in this project"], [
    ["Recall first", "Accuracy is misleading at 34.9% prevalence. Recall is the objective, precision >= 0.50 the guard, and a missed case is priced at five false alarms."],
    ["Leak-free by construction", "Everything that learns from data (the imputer, the model) lives in one scikit-learn Pipeline refitted inside each CV fold; the test set is scored once."],
    ["Decide on training data only", "Model choice and threshold are tuned on out-of-fold probabilities; the test set never influences a decision."],
    ["Honest uncertainty", "Every headline number carries a bootstrap 95% interval; negative results (CTGAN did not help) are reported, not hidden."],
    ["Explainable by default", "Every prediction comes with exact TreeSHAP contributions and clinical reference bands."],
    ["Grounded generative AI", "The LLM sees only computed numbers, cannot diagnose or prescribe, and its output always carries a server-added disclaimer."],
    ["Reproducible", "One command rebuilds the model, metrics and 24 figures; random_state = 42 everywhere; 13 automated tests."]
  ], [2500, 7246], { boldFirst: true, size: 19 }),
  pageBreak()
];

const mc = M.step3_model_comparison;
const page3 = [
  H1("3. Technical Model Detail"),
  H2("3.1 Dataset and preprocessing"),
  P("The Pima Indians Diabetes Database holds 768 women of Pima heritage aged 21+, eight numeric features and a binary outcome (268 diabetic, 34.9%). df.isnull() reports zero missing values, but 652 values are recorded as 0 in columns where zero is physiologically impossible. These are converted to NaN by a deterministic domain rule; Pregnancies is excluded because zero pregnancies is valid. A median imputer inside the pipeline fills them; mean, KNN and iterative imputers scored almost the same."),
  table(["Column", "Impossible zeros", "% of rows", "Why a zero is impossible"], [
    ["Insulin", "374", "48.7%", "Zero 2-hour serum insulin is not plausible"],
    ["SkinThickness", "227", "29.6%", "A triceps skin fold cannot be 0 mm"],
    ["BloodPressure", "35", "4.6%", "Zero diastolic pressure means no circulation"],
    ["BMI", "11", "1.4%", "Zero body-mass index implies zero mass"],
    ["Glucose", "5", "0.7%", "Zero plasma glucose is incompatible with life"]
  ], [1900, 1700, 1300, 4846], { boldFirst: true }),
  H2("3.2 Model selection"),
  P(`Seven candidates (logistic regression, Random Forest, gradient boosting, RBF SVM, k-NN, Gaussian Naive Bayes, LR + SMOTE) were cross-validated on identical stratified 5-fold splits and selected on F2, with models within 0.01 F2 treated as tied. Random Forest (500 trees, depth 6, balanced class weights) tied with LR + SMOTE at ${f3(mc[0].recall)} recall and was deployed for its native feature importances and no reliance on synthetic data.`),
  H2("3.3 Threshold tuning and evaluation"),
  P("The decision threshold was tuned on out-of-fold probabilities to maximise recall subject to precision >= 0.50, giving 0.28. The untouched test set (154 patients, 54 diabetic) was then scored once. Confidence intervals are percentile bootstrap, 2,000 resamples."),
  table(["Metric", "At default 0.50", "At tuned 0.28", "95% CI at 0.28"], [
    ["Recall", f3(d.recall), f3(t.recall), `${f3(ci.recall.lo)} - ${f3(ci.recall.hi)}`],
    ["Precision", f3(d.precision), f3(t.precision), `${f3(ci.precision.lo)} - ${f3(ci.precision.hi)}`],
    ["F1", f3(d.f1), f3(t.f1), `${f3(ci.f1.lo)} - ${f3(ci.f1.hi)}`],
    ["F2", f3(d.f2), f3(t.f2), `${f3(ci.f2.lo)} - ${f3(ci.f2.hi)}`],
    ["Specificity", f3(d.specificity), f3(t.specificity), `${f3(ci.specificity.lo)} - ${f3(ci.specificity.hi)}`],
    ["ROC-AUC", f3(d.roc_auc), f3(t.roc_auc), `${f3(ci.roc_auc.lo)} - ${f3(ci.roc_auc.hi)}`],
    ["Brier score", f3(d.brier), f3(t.brier), `${f3(ci.brier.lo)} - ${f3(ci.brier.hi)}`],
    ["Confusion (TN / FP / FN / TP)", `${d.tn} / ${d.fp} / ${d.fn} / ${d.tp}`, `${t.tn} / ${t.fp} / ${t.fn} / ${t.tp}`, "-"]
  ], [2900, 2100, 2100, 2646], { boldFirst: true, numeric: true }),
  P([B("Calibration and clinical utility. "), `The forest's calibration slope is ${M.step3_calibration_comparison.raw.slope.toFixed(2)} (1.0 is perfect); an isotonic-calibrated copy barely changes the Brier score, so the raw scores remain the decision variable. In decision-curve analysis at the threshold implied by the cost model (pt = 1/6), the model's net benefit is 0.259 versus 0.218 for testing everyone.`], { spacing: { before: 120, after: 0 } }),
  pageBreak()
];

const syn = M.step3_synthetic;
const fid = {}; M.step3_synthetic_fidelity.summary.forEach(s => { fid[s.generator] = s; });
const page4 = [
  H2("3.4 Generative layer 1 - synthetic minority patients"),
  P("CTGAN (a conditional GAN for tables), TVAE (a variational autoencoder) and a Gaussian Copula were trained on diabetic patients to generate new minority-class rows, and compared against SMOTE and no augmentation. Every generator is fitted inside each training fold only, every variant uses the same forest and folds, and each gets its own recall-first threshold."),
  table(["Variant", "Recall (tuned)", "Precision (tuned)", "Missed / 214", "PR-AUC", "Discriminator AUC"],
    syn.map(v => [v.variant, f3(v.recall_tuned), f3(v.precision_tuned), String(v.missed_tuned), f3(v.pr_auc), fid[v.variant] ? f3(fid[v.variant].discriminator_auc) : "-"]),
    [2700, 1400, 1550, 1300, 1196, 1600], { boldFirst: true, numeric: true }),
  P([B("Finding. "), "No generator beat class weighting (0.916 recall). CTGAN was worst (0.878, eight more missed): about 170 diabetic patients per fold is too few for a GAN, and its samples are easy to spot (discriminator AUC 0.93). The deployed model trains on real patients only."], { spacing: { before: 120 } }),
  H2("3.5 Generative layer 2 - LLM explanations from SHAP"),
  P("For each patient, exact TreeSHAP contributions are computed (model baseline + contributions = prediction). These values, together with WHO / ADA glucose and blood-pressure bands and Asian-Indian BMI cut-offs, form a structured prompt. Google Gemini (Flash model via the Gemini API) writes a four-part summary: what the screen found, what is driving it, what could help, and the next step."),
  bullet([B("Grounded: "), "the model receives only computed numbers and is instructed never to invent statistics."]),
  bullet([B("Bounded: "), "it may not diagnose, prescribe medication or blame non-modifiable factors."]),
  bullet([B("Safe and honest: "), "a clinician-review disclaimer is appended by the server to every response; without an API key or network, a deterministic template built from the same SHAP values is used and labelled as such."]),
  H2("3.6 External validity for Indian patients"),
  P(`Recall carries over under a prevalence shift; precision does not. At the ICMR-INDIAB prevalence of 11.4%, precision at the 0.28 threshold falls to ${pct(M.step5_transport[1].precision, 0)}, below the 0.50 guard. Before any Indian use the frozen pipeline must be scored on an Indian cohort with OGTT / HbA1c labels, feature shift checked (Indians develop diabetes at lower BMI) and the threshold re-tuned. Any same-schema CSV placed in data/external/ is scored automatically.`),
  H2("3.7 Conclusion"),
  P("Repairing hidden missing values and tuning the threshold for recall raised test recall from 74.1% to 90.7% and cut missed diabetic patients from 14 to 5 of 54, at the cost of 18 extra confirmatory tests. Generative AI earned its place where it explains each prediction, and was reported honestly where it did not help. The model is not clinically deployable, but the process transfers."),
  pageBreak()
];

const page5 = [
  H1("4. Block Diagram"),
  P("The system has two halves. The training pipeline (top) turns the raw dataset into a model bundle - fitted pipeline plus tuned threshold - and every metric and figure. The serving path (bottom) loads that bundle in a Flask API, scores the patient, computes SHAP contributions, and passes them through the generative explanation layer and its safety layer. The violet blocks are the two generative AI components."),
  centered(img(FIG("diagram_block.png"), 6.75)),
  caption("Figure 1. System block diagram - training pipeline and serving path with the two generative layers"),
  table(["Block", "Implementation"], [
    ["Domain rule + Pipeline", "src/preprocess.py, src/train.py - zeros to NaN; SimpleImputer(median) -> RandomForestClassifier"],
    ["Threshold + evaluation", "src/train.py, src/evaluate.py, src/rigour.py - out-of-fold tuning, bootstrap CIs, calibration, decision curve"],
    ["G1 synthetic patients", "src/synthetic.py - SDV CTGANSynthesizer, TVAESynthesizer, GaussianCopulaSynthesizer vs imblearn SMOTE"],
    ["TreeSHAP + G2 LLM", "src/genai_explain.py - shap.TreeExplainer, structured prompt, Google Gen AI SDK (Gemini API), disclaimer, template fallback"],
    ["Flask API + dashboard", "app/app.py, app/templates, app/static - /api/predict, /api/explain, eight-view dashboard"]
  ], [2700, 7046], { boldFirst: true }),
  pageBreak()
];

const page6 = [
  H1("5. Flowchart"),
  P("The flowchart traces one complete run: the training steps executed by python src/pipeline.py, the precision-guard decision inside threshold tuning, the G1 experiment branch, and the serving loop in which the LLM branch falls back to the template when no key or network is available."),
  centered(img(FIG("diagram_flowchart.png"), 5.6, 7.9)),
  caption("Figure 2. Process flowchart from data loading to the explained prediction"),
  pageBreak()
];

const shot = (title, desc, file, w, maxH, cap) => [
  new Paragraph({ spacing: { before: 60, after: 40 }, children: [new TextRun({ text: title, bold: true, size: 23, color: NAVY })] }),
  P(desc, { spacing: { after: 60 } }),
  centered(img(file, w, maxH)),
  caption(cap)
];

const page7 = [
  H1("6. Screenshots of the Working Model"),
  ...shot("Step 1 - Build everything with one command", "python src/pipeline.py runs all stages and writes the model, metrics and 24 figures; python -m pytest checks every claim (13 tests pass).", SHOT("00_pipeline_run.png"), 5.4, 3.2, "Screenshot 1. Pipeline console output and passing test suite"),
  ...shot("Step 2 - Open the dashboard (python app/app.py)", "The overview shows the headline result with confidence intervals and the end-to-end flow including both generative layers.", path.join(ASSETS, "rep_overview.png"), 5.8, 3.35, "Screenshot 2. Overview view"),
  pageBreak()
];
const page8 = [
  ...shot("Step 3 - Inspect data cleaning", "The 652 impossible zeros per column, missingness analysis, imputer comparison and the PCA latent view.", path.join(ASSETS, "rep_data.png"), 6.0, 3.46, "Screenshot 3. Data & Cleaning view"),
  ...shot("Step 4 - Review model evaluation", "Recall, precision, F1 and Brier at the 0.28 operating point with bootstrap intervals and the confusion matrix, followed by model comparison, calibration and decision curve.", path.join(ASSETS, "rep_eval.png"), 6.0, 3.46, "Screenshot 4. Model & Evaluation view"),
  pageBreak()
];
const page9 = [
  ...shot("Step 5 - Explore the threshold trade-off", "Dragging the cut-off updates recall, precision, the confusion matrix and the per-10,000 impact live.", path.join(ASSETS, "rep_lab.png"), 6.0, 3.46, "Screenshot 5. Threshold Lab"),
  ...shot("Step 6 - Generative AI results", "CTGAN / TVAE / Copula versus SMOTE and class weights, with the written finding and the realism and privacy audit.", path.join(ASSETS, "rep_genai.png"), 6.0, 3.46, "Screenshot 6. Generative AI view"),
  pageBreak()
];

const predRow = new Table({
  width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [4500, 5246], layout: TableLayoutType.FIXED,
  rows: [new TableRow({ children: [
    new TableCell({ width: { size: 4500, type: WidthType.DXA }, borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } }, children: [centered(img(path.join(ASSETS, "pred_left.png"), 2.7, 4.35))] }),
    new TableCell({ width: { size: 5246, type: WidthType.DXA }, borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } }, children: [centered(img(path.join(ASSETS, "pred_right.png"), 3.2, 4.35))] })
  ] })]
});
const page10 = [
  new Paragraph({ spacing: { before: 60, after: 40 }, children: [new TextRun({ text: "Step 7 - Score a patient and ask the AI to explain", bold: true, size: 23, color: NAVY })] }),
  P("Inputs show clinical reference bands. The high-risk example scores 92.6% and is flagged; the SHAP waterfall sums exactly from the 50% baseline; Explain with AI produces the four-part summary with the clinician-review disclaimer.", { spacing: { after: 60 } }),
  predRow,
  caption("Screenshot 7. Live Predictor - inputs (left), prediction, SHAP and AI explanation (right)"),
  ...shot("Step 8 - Check impact and validity for India", "The deployed operating point carried to Indian prevalences: precision falls below the 0.50 guard, so the threshold must be re-tuned.", path.join(ASSETS, "india.png"), 6.3, 2.0, "Screenshot 8. Impact, Ethics & India view")
];

const doc = new Document({
  creator: "Prem Maradiya, Saanvi Dhote, Suvesha Khan, Atharva Dhobale",
  title: "Diabetes Onset Risk Screener - Project Report",
  styles: {
    default: { document: { run: { font: FONT, size: 22 }, paragraph: { spacing: { line: 264 } } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, size: 32, bold: true, color: NAVY }, paragraph: { spacing: { before: 160, after: 120 }, keepNext: true, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, size: 25, bold: true, color: BLUE }, paragraph: { spacing: { before: 180, after: 80 }, keepNext: true, outlineLevel: 1 } }
    ]
  },
  numbering: { config: [{ reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 260 } } } }] }] },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1000, bottom: 1000, left: 1080, right: 1080, header: 500, footer: 500 } }, titlePage: true },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Diabetes Onset Risk Screener  ·  Project Report", size: 17, color: MUTED })] })] }) },
    footers: {
      default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES], size: 17, color: MUTED })] })] }),
      first: new Footer({ children: [new Paragraph({ children: [] })] })
    },
    children: [...page1, ...page2, ...page3, ...page4, ...page5, ...page6, ...page7, ...page8, ...page9, ...page10]
  }]
});

Packer.toBuffer(doc).then(buf => { fs.writeFileSync(OUT, buf); console.log("wrote", OUT); });
