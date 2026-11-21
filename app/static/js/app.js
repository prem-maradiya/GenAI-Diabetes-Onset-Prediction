/* ==========================================================================
   Diabetes Risk Screener - dashboard controller (v2)
   Reads the artefacts written by src/pipeline.py and drives every view.
   Render functions are idempotent (they rewrite their containers), so a theme
   change simply re-runs them; event listeners are bound once.
   ========================================================================== */
(function () {
  "use strict";

  const C = window.Charts;
  const T = C.T;
  const $ = id => document.getElementById(id);
  const pct = (v, d) => (v * 100).toFixed(d === undefined ? 1 : d) + "%";
  const int = v => Math.round(v).toLocaleString();
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const state = {
    results: null, surrogate: null, online: true, llm: null,
    labThreshold: 0.28, patient: {}, features: [], meta: {}, ranges: {},
    lastResult: null, bound: false
  };

  /* ====================================================================== */
  /* Boot                                                                    */
  /* ====================================================================== */
  async function boot() {
    state.results = await loadJSON(["/api/results", "/static/data/results.json"]);
    if (!state.results) {
      document.querySelector(".wrap").insertAdjacentHTML("afterbegin",
        '<div class="callout critical" style="margin-top:24px"><div class="ct">No results found</div>' +
        'Run <code>python src/pipeline.py</code> first, then reload this page.</div>');
      return;
    }
    state.surrogate = await loadJSON(["/static/data/surrogate.json"]);
    state.meta = state.results.feature_meta;
    state.ranges = state.results.clinical_ranges || {};
    state.features = Object.keys(state.meta);
    state.labThreshold = state.results.step3_thresholds.recall_first;

    renderAll();
    setupNav();
    setupChrome();
    setupPredictor();
    state.bound = true;

    await probeApi();
    resetPatient();

    /* Demo links for the jury / report screenshots:
       ?demo=highrisk           loads the constructed high-risk profile
       ?demo=highrisk&explain=1 also runs the AI explanation */
    const q = new URLSearchParams(window.location.search);
    if (q.get("demo") === "highrisk") {
      $("btn-highrisk").click();
      if (q.get("explain") === "1") setTimeout(explainWithAI, 400);
    }
    if (q.get("theme") === "dark" || q.get("theme") === "light") {
      document.documentElement.dataset.theme = q.get("theme");
      renderAll();
    }
  }

  function renderAll() {
    C.syncTheme();
    renderMeta();
    renderOverview();
    renderStep1();
    renderStep2();
    renderStep3();
    renderLab();
    renderStep4();
    renderGenAI();
    renderImpact();
    renderGallery();
    if (state.lastResult) paintResult(state.lastResult);
  }

  async function loadJSON(urls) {
    for (const url of urls) {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (res.ok) return await res.json();
      } catch (e) { /* try the next source */ }
    }
    return null;
  }

  async function probeApi() {
    try {
      const res = await fetch("/health", { cache: "no-store" });
      state.online = res.ok;
    } catch (e) { state.online = false; }
    $("offline-note").classList.toggle("show", !state.online);
    try {
      const res = await fetch("/api/llm-status", { cache: "no-store" });
      state.llm = res.ok ? await res.json() : null;
    } catch (e) { state.llm = null; }
    const on = state.llm && state.llm.available;
    $("meta-llm").textContent = on ? "Gemini · on" : "Template";
    const badge = $("llm-status-badge");
    badge.textContent = on ? `LLM connected · ${state.llm.model}` : "No API key — template fallback active";
    badge.className = "badge " + (on ? "badge-good" : "badge-warning");
  }

  /* ====================================================================== */
  /* Chrome: navigation, theme, presentation mode, keyboard                  */
  /* ====================================================================== */
  const VIEWS = [
    ["overview", "Overview", "Catching diabetes before it catches the patient", "A recall-first screener with a generative explanation layer"],
    ["data", "Step 1-2", "Data & Cleaning", "What is in the file, and what had to be repaired"],
    ["performance", "Step 3", "Model & Evaluation", "Seven models, one selection rule, every number with its interval"],
    ["lab", "Step 3", "Threshold Lab", "The model is fixed - the trade-off is a choice"],
    ["importance", "Step 4", "Explainability", "SHAP and three more views of what drives risk"],
    ["genai", "Generative AI", "Synthetic Patients & LLM Explanations", "Two generative layers, measured rather than asserted"],
    ["predictor", "Live demo", "Live Predictor", "Score a patient, see why, and ask the LLM to explain it"],
    ["impact", "Step 5-6", "Impact, Ethics & India", "The trade in people, and where this model stops working"]
  ];
  const VIEW_IDS = VIEWS.map(v => v[0]);
  let current = "overview";

  function show(id, push) {
    if (VIEW_IDS.indexOf(id) < 0) id = "overview";
    current = id;
    const v = VIEWS[VIEW_IDS.indexOf(id)];
    document.querySelectorAll(".view").forEach(s => s.classList.toggle("active", s.id === id));
    document.querySelectorAll(".nav a").forEach(a => a.classList.toggle("active", a.getAttribute("href") === "#" + id));
    $("view-step").textContent = v[1];
    $("view-title").textContent = v[2];
    $("view-sub").textContent = v[3];
    $("pg-count").textContent = `${VIEW_IDS.indexOf(id) + 1} / ${VIEW_IDS.length}`;
    document.documentElement.dataset.nav = "closed";
    window.scrollTo({ top: 0, behavior: "auto" });
    if (push && window.location.hash !== "#" + id) history.replaceState(null, "", "#" + id);
  }
  function step(delta) {
    const i = VIEW_IDS.indexOf(current);
    show(VIEW_IDS[Math.max(0, Math.min(VIEW_IDS.length - 1, i + delta))], true);
  }

  function setupNav() {
    document.addEventListener("click", e => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute("href").slice(1);
      if (VIEW_IDS.indexOf(id) < 0) return;
      e.preventDefault();
      show(id, true);
    });
    window.addEventListener("hashchange", () => show(window.location.hash.slice(1), false));
    show(window.location.hash.slice(1) || "overview", false);
  }

  function setTheme(next) {
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("dr-theme", next); } catch (e) { /* storage blocked */ }
    renderAll();
  }
  function currentTheme() {
    const set = document.documentElement.dataset.theme;
    if (set) return set;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function togglePresent() {
    const on = document.documentElement.dataset.present !== "on";
    document.documentElement.dataset.present = on ? "on" : "off";
    $("btn-present").classList.toggle("on", on);
  }

  function setupChrome() {
    $("btn-theme").addEventListener("click", () => setTheme(currentTheme() === "dark" ? "light" : "dark"));
    $("btn-present").addEventListener("click", togglePresent);
    $("btn-menu").addEventListener("click", () => {
      const r = document.documentElement;
      r.dataset.nav = r.dataset.nav === "open" ? "closed" : "open";
    });
    $("pg-prev").addEventListener("click", () => step(-1));
    $("pg-next").addEventListener("click", () => step(1));
    $("pg-exit").addEventListener("click", togglePresent);
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (!document.documentElement.dataset.theme) renderAll();
    });
    document.addEventListener("keydown", e => {
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); step(1); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); step(-1); }
      else if (e.key === "p" || e.key === "P") togglePresent();
      else if (e.key === "t" || e.key === "T") setTheme(currentTheme() === "dark" ? "light" : "dark");
      else if (e.key === "Escape" && document.documentElement.dataset.present === "on") togglePresent();
    });
  }

  /* ====================================================================== */
  /* Overview                                                                */
  /* ====================================================================== */
  function renderMeta() {
    const r = state.results;
    $("meta-model").textContent = r.step3_selection.model;
    $("meta-threshold").textContent = r.step3_thresholds.recall_first.toFixed(2);
    $("meta-recall").textContent = pct(r.step3_test_tuned.recall);
    $("foot-date").textContent = "generated " + r.generated_at;
    document.querySelectorAll(".th-val").forEach(n => { n.textContent = r.step3_thresholds.recall_first.toFixed(2); });
  }

  const ciTxt = c => c ? `95% CI ${pct(c.lo, 1)} – ${pct(c.hi, 1)}` : "";

  function renderOverview() {
    const r = state.results;
    const d = r.step3_test_default, t = r.step3_test_tuned;
    const positives = t.tp + t.fn;
    const ci = r.step3_ci_tuned || {};

    $("ov-recall").textContent = pct(t.recall);
    $("ov-recall-ci").textContent = ci.recall ? ciTxt(ci.recall) : `of ${positives} diabetic test patients`;
    $("ov-missed").innerHTML = `${t.fn}<small>/ ${positives}</small>`;
    $("ov-missed-foot").textContent = `down from ${d.fn} at the default 0.50 cut-off`;
    $("ov-auc").textContent = t.roc_auc.toFixed(3);
    $("ov-auc-ci").textContent = ci.roc_auc ? `95% CI ${ci.roc_auc.lo.toFixed(3)} – ${ci.roc_auc.hi.toFixed(3)}` : "ranking quality";
    $("ov-threshold").innerHTML = `<strong>${r.step3_thresholds.recall_first.toFixed(2)}</strong>, tuned on out-of-fold probabilities — never on the test set`;
    const repaired = r.step2_missingness.reduce((a, m) => a + m.missing, 0);
    $("ov-repaired-fd").textContent = `${repaired} impossible zeros → missing`;

    $("ov-story").innerHTML =
      `In screening, a missed case and a false alarm are not the same mistake. Repairing ${repaired} corrupted values ` +
      `and tuning the cut-off for recall took the model from catching <strong>${d.tp} of ${positives}</strong> diabetic ` +
      `patients to <strong>${t.tp} of ${positives}</strong> on unseen data — <strong>${d.fn - t.fn} more people caught</strong> ` +
      `for ${t.fp - d.fp} extra confirmatory tests. A generative layer then explains each result in plain language.`;
  }

  /* ====================================================================== */
  /* Step 1-2                                                                */
  /* ====================================================================== */
  function renderStep1() {
    const o = state.results.step1_overview;
    $("s1-rows").textContent = o.n_rows;
    $("s1-features").textContent = o.n_features;
    $("s1-pos").textContent = pct(o.positive_rate, 1);
    $("s1-pos-foot").innerHTML = `${o.positives} positive · ${o.negatives} negative`;
    $("s1-nulls").textContent = o.declared_nulls;

    $("tbl-features").innerHTML = state.features.map(f => {
      const s = o.feature_stats[f], cm = o.class_means[f], r = o.correlation_with_target[f];
      const gap = cm.diabetic - cm.non_diabetic;
      return `<tr>
        <td class="name">${f}</td>
        <td class="num">${s.median}</td>
        <td class="num muted">${s.min} – ${s.max}</td>
        <td class="num">${cm.non_diabetic}</td>
        <td class="num">${cm.diabetic}</td>
        <td class="num" style="color:${gap > 0 ? "var(--serious-ink)" : "var(--ink-muted)"}">${gap > 0 ? "+" : ""}${gap.toFixed(2)}</td>
        <td class="num">${Math.abs(r) >= 0.28 ? `<span class="badge badge-blue">${r.toFixed(3)}</span>` : r.toFixed(3)}</td>
      </tr>`;
    }).join("");

    const ls = state.results.latent_space;
    C.scatter($("chart-latent"), {
      points: ls.points, colors: [T.s1, T.s2], names: ["No diabetes", "Diabetes"],
      xlabel: `PC 1  (${pct(ls.explained_variance[0], 0)} of variance)`,
      ylabel: `PC 2  (${pct(ls.explained_variance[1], 0)})`, height: 360
    });
  }

  function renderStep2() {
    const r = state.results;
    const miss = r.step2_missingness.filter(m => m.missing > 0);
    $("s2-total").textContent = miss.reduce((a, m) => a + m.missing, 0);

    C.hbar($("chart-missing"), {
      rows: miss.slice().sort((a, b) => a.missing - b.missing).map(m => ({
        label: m.feature, value: m.missing, display: `${m.missing} (${m.missing_pct}%)`,
        tip: `<div class="tt-row"><span>Impossible zeros</span><b>${m.missing}</b></div>`
      })),
      color: T.s1, xlabel: "Rows recorded as 0", labelWidth: 128, rowHeight: 32, decimals: 0, width: 520
    });

    const vt = {};
    r.step2_missing_vs_target.forEach(m => { vt[m.feature] = m; });
    $("tbl-missing").innerHTML = miss.map(m => {
      const v = vt[m.feature];
      return `<tr><td class="name">${m.feature}</td><td class="num">${m.missing}</td><td class="num">${m.missing_pct}%</td>
        <td class="num">${v ? pct(v.positive_rate_when_missing, 1) : "—"}</td>
        <td class="num">${v ? pct(v.positive_rate_when_present, 1) : "—"}</td>
        <td class="num muted">${v ? (v.gap > 0 ? "+" : "") + v.gap.toFixed(3) : "—"}</td></tr>`;
    }).join("");

    C.groupedBar($("chart-imputation"), {
      rows: r.step3_imputation_comparison.slice().reverse().map(row => ({
        label: row.imputation, values: [row.recall, row.f2], highlight: row.imputation === "median"
      })),
      series: [{ name: "Recall", color: T.s1 }, { name: "F2", color: T.s3 }],
      xlabel: "Out-of-fold score", labelWidth: 92, groupHeight: 46, decimals: 3, width: 520
    });
    $("fig-imputation").src = "/figures/04_imputation_effect.png";
  }

  /* ====================================================================== */
  /* Step 3 - model & evaluation                                             */
  /* ====================================================================== */
  function renderStep3() {
    const r = state.results;
    const table = r.step3_model_comparison;
    const winner = r.step3_selection.model;
    const t = r.step3_test_tuned, d = r.step3_test_default;
    const ci = r.step3_ci_tuned || {};

    $("op-recall").textContent = pct(t.recall);
    $("op-precision").textContent = pct(t.precision);
    $("op-f1").textContent = t.f1.toFixed(3);
    $("op-brier").textContent = t.brier.toFixed(3);
    $("op-recall-ci").textContent = ciTxt(ci.recall);
    $("op-precision-ci").textContent = ciTxt(ci.precision);
    $("op-f1-ci").textContent = ci.f1 ? `95% CI ${ci.f1.lo.toFixed(3)} – ${ci.f1.hi.toFixed(3)}` : "";
    $("op-brier-ci").textContent = ci.brier ? `95% CI ${ci.brier.lo.toFixed(3)} – ${ci.brier.hi.toFixed(3)} · lower is better` : "";

    $("cm-tn").textContent = t.tn; $("cm-fp").textContent = t.fp;
    $("cm-fn").textContent = t.fn; $("cm-tp").textContent = t.tp;
    $("cm-sub").textContent = `${t.n} held-out patients at threshold ${t.threshold.toFixed(2)} · specificity ${pct(t.specificity)}`;

    if (ci.recall) {
      $("ci-sub").textContent = `Percentile bootstrap, ${ci.n_boot.toLocaleString()} resamples of the ${t.n} test patients, threshold ${t.threshold.toFixed(2)}`;
      const keys = [["recall", "Recall"], ["precision", "Precision"], ["specificity", "Specificity"], ["f1", "F1"], ["f2", "F2"], ["accuracy", "Accuracy"], ["roc_auc", "ROC-AUC"]];
      const lo = 0.3, hi = 1.0, X = v => ((v - lo) / (hi - lo)) * 100;
      $("ci-rows").innerHTML = keys.map(([k, label]) => {
        const c = ci[k];
        return `<div class="ci-row"><span class="${k === "recall" ? "" : "muted"}" style="font-weight:640">${label}</span>
          <div class="ci-track"><div class="axis"></div>
            <div class="band" style="left:${X(c.lo)}%;width:${X(c.hi) - X(c.lo)}%"></div>
            <div class="pt" style="left:${X(c.point)}%"></div></div>
          <span class="ci-txt"><b>${c.point.toFixed(3)}</b>[${c.lo.toFixed(3)} – ${c.hi.toFixed(3)}]</span></div>`;
      }).join("") +
        `<div class="ci-row" style="padding-top:0"><span></span><div style="display:flex;justify-content:space-between;font-size:11px;color:var(--ink-muted)"><span>0.30</span><span>0.65</span><span>1.00</span></div><span></span></div>`;
    }

    C.groupedBar($("chart-models"), {
      rows: table.slice().sort((a, b) => a.recall - b.recall).map(m => ({
        label: m.model, values: [m.recall, m.precision], highlight: m.model === winner
      })),
      series: [{ name: "Recall", color: T.s1 }, { name: "Precision", color: T.s2 }],
      xlabel: "Out-of-fold score (5-fold CV, threshold 0.50)", labelWidth: 178, groupHeight: 46, decimals: 3
    });

    const familyBadge = f => f === "generative" ? "badge-violet" : f.indexOf("synthetic") >= 0 ? "badge-aqua" : "badge-muted";
    $("tbl-models").innerHTML = table.map(m => `
      <tr class="${m.model === winner ? "is-winner" : ""}">
        <td class="name">${m.model}${m.model === winner ? ' <span class="badge badge-blue">deployed</span>' : ""}</td>
        <td><span class="badge ${familyBadge(m.family)}">${m.family}</span></td>
        <td class="num"><strong>${m.recall.toFixed(3)}</strong></td><td class="num">${m.precision.toFixed(3)}</td>
        <td class="num">${m.f1.toFixed(3)}</td><td class="num"><strong>${m.f2.toFixed(3)}</strong></td>
        <td class="num">${m.roc_auc.toFixed(3)}</td><td class="num">${m.pr_auc.toFixed(3)}</td>
        <td class="num muted">${m.accuracy.toFixed(3)}</td>
        <td class="num" style="color:var(--critical-ink)">${m.missed_cases}</td></tr>`).join("");

    const sel = r.step3_selection;
    $("s3-selection").innerHTML = `<strong>${sel.model}</strong> was selected. ${sel.rule.charAt(0).toUpperCase() + sel.rule.slice(1)}. ` +
      (sel.tied_with.length ? `It was statistically tied with <strong>${sel.tied_with.join(", ")}</strong> and won on the priority list because it provides native feature importances and needs no synthetic data at training time.` : "");

    const rows = [
      ["Recall", d.recall, t.recall], ["Precision", d.precision, t.precision], ["F1 score", d.f1, t.f1],
      ["F2 score", d.f2, t.f2], ["Specificity", d.specificity, t.specificity], ["Accuracy", d.accuracy, t.accuracy],
      ["ROC-AUC", d.roc_auc, t.roc_auc], ["Missed cases (FN)", d.fn, t.fn, true], ["False alarms (FP)", d.fp, t.fp, true]
    ];
    $("tbl-test").innerHTML = rows.map(([name, a, b, isCount]) => {
      const delta = b - a;
      const key = name === "Recall" || name === "F2 score" || name.indexOf("Missed") === 0;
      const good = name.indexOf("Missed") === 0 ? delta < 0 : delta > 0;
      const colour = Math.abs(delta) < 1e-9 ? "var(--ink-muted)" : key ? (good ? "var(--good-ink)" : "var(--critical-ink)") : "var(--ink-muted)";
      const f = v => isCount ? v : v.toFixed(3);
      const dt = Math.abs(delta) < 1e-9 ? "—" : (delta > 0 ? "+" : "") + (isCount ? delta : delta.toFixed(3));
      return `<tr><td class="name">${name}</td><td class="num">${f(a)}</td><td class="num"><strong>${f(b)}</strong></td><td class="num" style="color:${colour};font-weight:650">${dt}</td></tr>`;
    }).join("");

    const cv = r.step3_curves;
    C.lineChart($("chart-roc"), {
      series: [{ name: "Model", color: T.s1, points: cv.roc }, { name: "Random", color: T.muted, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], dashed: true, width: 1.4 }],
      xlabel: "False positive rate", ylabel: "Recall", xDomain: [0, 1], yDomain: [0, 1], height: 280, width: 420
    });
    $("chart-roc").insertAdjacentHTML("beforeend", `<div class="legend"><span class="item"><span class="swatch line" style="background:var(--s1)"></span> ROC-AUC ${cv.roc_auc.toFixed(3)}</span></div>`);
    C.lineChart($("chart-pr"), {
      series: [{ name: "Model", color: T.s2, points: cv.pr }, { name: "Prevalence", color: T.muted, points: [{ x: 0, y: cv.baseline_precision }, { x: 1, y: cv.baseline_precision }], dashed: true, width: 1.4 }],
      xlabel: "Recall", ylabel: "Precision", xDomain: [0, 1], yDomain: [0, 1], height: 280, width: 420
    });
    $("chart-pr").insertAdjacentHTML("beforeend", `<div class="legend"><span class="item"><span class="swatch line" style="background:var(--s2)"></span> PR-AUC ${cv.pr_auc.toFixed(3)}</span></div>`);

    const cal = r.step3_calibration_comparison;
    const calSeries = [{ name: "Perfect", color: T.muted, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], dashed: true, width: 1.4 }];
    if (cal) {
      calSeries.push({ name: "Deployed forest", color: T.s1, dots: true, points: cal.raw.curve.map(b => ({ x: b.mean_predicted, y: b.observed_rate })) });
      calSeries.push({ name: "Isotonic", color: T.s2, dots: true, points: cal.isotonic.curve.map(b => ({ x: b.mean_predicted, y: b.observed_rate })) });
      $("tbl-calibration").innerHTML = [["Deployed forest", cal.raw], ["Isotonic-calibrated", cal.isotonic]].map(([n, s]) =>
        `<tr><td class="name">${n}</td><td class="num">${s.brier.toFixed(3)}</td><td class="num">${s.slope.toFixed(2)}</td><td class="num">${s.intercept.toFixed(2)}</td><td class="num">${s.roc_auc.toFixed(3)}</td></tr>`).join("");
      $("cal-note").textContent = `Slope 1 and intercept 0 are perfect calibration. ${cal.note}`;
    } else {
      calSeries.push({ name: "Model", color: T.s1, dots: true, points: r.step3_calibration.map(b => ({ x: b.mean_predicted, y: b.observed_rate })) });
    }
    C.lineChart($("chart-calibration"), {
      series: calSeries, xlabel: "Mean predicted probability", ylabel: "Observed diabetes rate",
      xDomain: [0, 1], yDomain: [0, 1], height: 300, crosshair: false
    });

    const dca = r.step3_decision_curve;
    if (dca) {
      const pt = r.config.cost_fp / (r.config.cost_fp + r.config.cost_fn);
      C.lineChart($("chart-dca"), {
        series: [
          { name: "Model", color: T.s1, points: dca.map(p => ({ x: p.threshold, y: p.model })), width: 2.4 },
          { name: "Test everyone", color: T.s2, points: dca.map(p => ({ x: p.threshold, y: p.test_all })) },
          { name: "Test no one", color: T.muted, points: dca.map(p => ({ x: p.threshold, y: p.test_none })) }
        ],
        xlabel: "Threshold probability (pt)", ylabel: "Net benefit", yDomain: [-0.05, 0.4], height: 300,
        markers: [{ x: pt, color: T.s3, label: "FN = 5×FP" }]
      });
      const at = dca.reduce((b, p) => Math.abs(p.threshold - pt) < Math.abs(b.threshold - pt) ? p : b, dca[0]);
      $("dca-note").innerHTML = `At the threshold implied by our cost model (pt ≈ ${pt.toFixed(2)}), screening with the model gives a net benefit of ` +
        `<strong>${at.model.toFixed(3)}</strong> versus <strong>${at.test_all.toFixed(3)}</strong> for testing everyone — ` +
        `the equivalent of finding <strong>${int((at.model - at.test_all) * 10000)} more true cases per 10,000</strong> without extra false alarms.`;
    }
  }

  /* ====================================================================== */
  /* Threshold lab                                                           */
  /* ====================================================================== */
  function sweepAt(threshold) {
    const sweep = state.results.step3_threshold_sweep;
    return sweep.reduce((b, s) => Math.abs(s.threshold - threshold) < Math.abs(b.threshold - threshold) ? s : b, sweep[0]);
  }

  function renderLab() {
    const r = state.results, th = r.step3_thresholds, sweep = r.step3_threshold_sweep;
    const presets = [
      { label: "Default 0.50", value: 0.5 },
      { label: `Recall-first ${th.recall_first.toFixed(2)}`, value: th.recall_first },
      { label: `Lowest cost ${th.cost_optimal.toFixed(2)}`, value: th.cost_optimal },
      { label: `Best F2 ${th.f2_optimal.toFixed(2)}`, value: th.f2_optimal }
    ];
    $("lab-presets").innerHTML = presets.map(p => `<button class="preset" data-v="${p.value}">${p.label}</button>`).join("");
    if (!state.bound) {
      $("lab-presets").addEventListener("click", e => { const b = e.target.closest(".preset"); if (b) setLab(parseFloat(b.dataset.v)); });
      $("lab-slider").addEventListener("input", () => setLab(parseFloat($("lab-slider").value)));
    }
    C.lineChart($("chart-cost"), {
      series: [{ name: "Weighted cost", color: T.s7, points: sweep.map(s => ({ x: s.threshold, y: s.cost })) }],
      xlabel: "Decision threshold", ylabel: "Cost (5×FN + 1×FP)", height: 240,
      markers: [{ x: th.cost_optimal, color: T.s7, label: `minimum ${th.cost_optimal.toFixed(2)}` }]
    });
    setLab(state.labThreshold);
  }

  function setLab(value) {
    value = Math.max(0.05, Math.min(0.95, value));
    state.labThreshold = value;
    $("lab-slider").value = value;
    $("lab-value").textContent = value.toFixed(2);
    Array.from($("lab-presets").children).forEach(b => b.classList.toggle("active", Math.abs(parseFloat(b.dataset.v) - value) < 0.005));
    const s = sweepAt(value);
    const stable = state.results.step3_threshold_sweep.filter(p => p.threshold <= 0.88);
    C.lineChart($("chart-threshold"), {
      series: [
        { name: "Recall", color: T.s1, points: stable.map(p => ({ x: p.threshold, y: p.recall })) },
        { name: "Precision", color: T.s2, points: stable.map(p => ({ x: p.threshold, y: p.precision })) },
        { name: "F2 score", color: T.s3, points: stable.map(p => ({ x: p.threshold, y: p.f2 })) }
      ],
      xlabel: "Decision threshold", ylabel: "Score", xDomain: [0.05, 0.88], yDomain: [0, 1], height: 380,
      markers: [{ x: Math.min(value, 0.88), color: T.ink2, label: value.toFixed(2) }]
    });
    $("lab-tn").textContent = s.tn; $("lab-fp").textContent = s.fp; $("lab-fn").textContent = s.fn; $("lab-tp").textContent = s.tp;
    $("lab-recall").textContent = pct(s.recall); $("lab-precision").textContent = pct(s.precision);
    $("lab-f2").textContent = s.f2.toFixed(3); $("lab-cost").textContent = int(s.cost);
    const total = s.tn + s.fp + s.fn + s.tp, k = 10000 / total;
    $("lab-k-tp").textContent = int(s.tp * k); $("lab-k-fn").textContent = int(s.fn * k);
    $("lab-k-fp").textContent = int(s.fp * k); $("lab-k-tests").textContent = int((s.tp + s.fp) * k);
    $("lab-caption").innerHTML = `Out-of-fold results on ${total} training patients · catching <strong>${s.tp} of ${s.tp + s.fn}</strong> real cases`;
  }

  /* ====================================================================== */
  /* Step 4 - explainability                                                 */
  /* ====================================================================== */
  function renderStep4() {
    const r = state.results;
    if (r.step4_shap_beeswarm && r.step4_shap_global) {
      const order = r.step4_shap_global.map(g => g.feature);
      const lookup = {};
      r.step4_shap_beeswarm.forEach(b => { lookup[b.feature] = b.points; });
      C.beeswarm($("chart-beeswarm"), {
        rows: order.map(f => ({ feature: f, points: lookup[f] })),
        xlabel: "SHAP value (percentage points of predicted risk)", labelWidth: 170
      });
    }

    C.hbar($("chart-importance"), {
      rows: r.step4_permutation.slice().sort((a, b) => a.importance - b.importance).map(p => ({
        label: p.feature, value: p.importance, err: p.std,
        display: (p.importance >= 0 ? "+" : "") + p.importance.toFixed(3),
        tip: `<div class="tt-row"><span>Recall drop</span><b>${p.importance.toFixed(4)}</b></div><div class="tt-row"><span>SD</span><b>±${p.std.toFixed(4)}</b></div>`
      })),
      color: T.s1, labelWidth: 168, rowHeight: 34, decimals: 3, xlabel: "Drop in recall when shuffled"
    });

    const shapNorm = {};
    if (r.step4_shap_global) {
      const vals = r.step4_shap_global.map(g => g.mean_abs_shap);
      const lo = Math.min(...vals), hi = Math.max(...vals);
      r.step4_shap_global.forEach(g => { shapNorm[g.feature] = (g.mean_abs_shap - lo) / ((hi - lo) || 1); });
    }
    const hasShap = Object.keys(shapNorm).length > 0;
    C.groupedBar($("chart-consensus"), {
      rows: r.step4_consensus.slice().reverse().map(c => ({
        label: c.feature,
        values: hasShap ? [c.permutation_norm, c.impurity_norm, c.abs_logit_coef_norm, shapNorm[c.feature]] : [c.permutation_norm, c.impurity_norm, c.abs_logit_coef_norm]
      })),
      series: [{ name: "Permutation", color: T.s1 }, { name: "Impurity", color: T.s2 }, { name: "|Logit coef|", color: T.s3 }]
        .concat(hasShap ? [{ name: "Mean |SHAP|", color: T.s7 }] : []),
      xlabel: "Normalised importance within each view", labelWidth: 168, groupHeight: 62, decimals: 2, width: 560
    });

    $("tbl-odds").innerHTML = r.step4_odds_ratio.map(o => `<tr><td class="name">${o.feature}</td>
      <td class="num">${o.coefficient.toFixed(3)}</td><td class="num"><strong>${o.odds_ratio_per_sd.toFixed(2)}×</strong></td>
      <td><span class="badge ${o.direction === "increases risk" ? "badge-critical" : "badge-good"}">${o.direction === "increases risk" ? "raises" : "lowers"}</span></td></tr>`).join("");
    const top = r.step4_odds_ratio[0];
    $("odds-note").innerHTML = `A one-SD increase in <strong>${top.feature}</strong> multiplies the odds of diabetes by <strong>${top.odds_ratio_per_sd.toFixed(2)}×</strong>, holding the others constant.`;

    const curves = r.step4_risk_curves;
    $("risk-curves").innerHTML = Object.keys(curves).map(f => `<div><div style="font-size:13px;font-weight:660;margin-bottom:6px">${f}</div><div class="chart" id="rc-${f}"></div></div>`).join("");
    Object.keys(curves).forEach(f => C.lineChart($("rc-" + f), {
      series: [{ name: "Predicted risk", color: T.s1, points: curves[f] }],
      xlabel: f, ylabel: "Risk", yDomain: [0, 1], height: 210, width: 340, margin: { t: 12, r: 14, b: 44, l: 44 }
    }));
  }

  /* ====================================================================== */
  /* Generative AI                                                           */
  /* ====================================================================== */
  const VARIANT_COLOR = () => ({
    "none (class weights)": T.s1, "none (unweighted)": T.muted, "SMOTE": T.s3,
    "Gaussian Copula": T.s4, "CTGAN": T.s2, "TVAE": T.s7
  });

  function renderGenAI() {
    const r = state.results;
    const syn = r.step3_synthetic;
    if (!syn) return;
    const sorted = syn.slice().sort((a, b) => a.recall_tuned - b.recall_tuned || a.pr_auc - b.pr_auc);
    C.groupedBar($("chart-synthetic"), {
      rows: sorted.map(v => ({ label: v.variant, values: [v.recall_tuned, v.pr_auc], highlight: v.variant === "none (class weights)" })),
      series: [{ name: "Recall (tuned)", color: T.s1 }, { name: "PR-AUC", color: T.s7 }],
      xlabel: "Out-of-fold score on real patients", labelWidth: 150, groupHeight: 44, decimals: 3, width: 540
    });

    $("tbl-synthetic").innerHTML = syn.map(v => {
      const gen = ["CTGAN", "TVAE", "Gaussian Copula"].indexOf(v.variant) >= 0;
      return `<tr class="${v.variant === "none (class weights)" ? "is-winner" : ""}">
        <td class="name">${v.variant}${gen ? ' <span class="badge badge-violet">generator</span>' : ""}${v.variant === "none (class weights)" ? ' <span class="badge badge-blue">deployed</span>' : ""}</td>
        <td class="num">${v.synthetic_rows_per_fold}</td><td class="num">${v.recall_at_050.toFixed(3)}</td><td class="num">${v.precision_at_050.toFixed(3)}</td>
        <td class="num">${v.tuned_threshold.toFixed(2)}</td><td class="num"><strong>${v.recall_tuned.toFixed(3)}</strong></td>
        <td class="num">${v.precision_tuned.toFixed(3)}</td><td class="num" style="color:var(--critical-ink)">${v.missed_tuned}</td>
        <td class="num">${v.pr_auc.toFixed(3)}</td><td class="small muted">${esc(v.note)}</td></tr>`;
    }).join("");

    const by = {}; syn.forEach(v => { by[v.variant] = v; });
    const base = by["none (class weights)"], ct = by["CTGAN"], tv = by["TVAE"], sm = by["SMOTE"];
    $("synthetic-finding").innerHTML = `
      <p><strong>No generator beat class weighting.</strong> The deployed model (re-weighting real patients) reaches
      recall <strong>${base.recall_tuned.toFixed(3)}</strong>; SMOTE ties it (${sm.recall_tuned.toFixed(3)}), TVAE reaches
      ${tv.recall_tuned.toFixed(3)} and CTGAN only <strong>${ct.recall_tuned.toFixed(3)}</strong> — ${ct.missed_tuned - base.missed_tuned} more missed patients.</p>
      <p style="margin-top:10px">Why: a GAN needs thousands of rows to learn a joint distribution; it saw about 170 diabetic patients per fold,
      and the audit below shows its samples are easy to tell from real ones.</p>
      <p style="margin-top:10px">TVAE <em>does</em> raise recall at the default 0.50 cut-off (${tv.recall_at_050.toFixed(3)} vs ${base.recall_at_050.toFixed(3)}) —
      but once every variant gets its own tuned threshold, that advantage disappears. <strong>The threshold was the real lever.</strong></p>`;

    const fid = r.step3_synthetic_fidelity;
    if (fid) {
      $("fid-nn").textContent = fid.summary[0].median_nn_real.toFixed(2);
      $("tbl-fidelity").innerHTML = fid.summary.map(s => {
        const ratio = s.median_dcr_synthetic / s.median_nn_real;
        return `<tr><td class="name">${s.generator}</td><td class="num">${s.mean_ks.toFixed(3)}</td>
          <td class="num">${s.discriminator_auc.toFixed(3)}</td>
          <td class="num">${s.median_dcr_synthetic.toFixed(2)} ${ratio < 0.6 ? ' <span class="badge badge-warning">near-copies</span>' : ""}</td>
          <td class="num">${s.exact_copies}</td></tr>`;
      }).join("");

      const dist = fid.distributions.Glucose;
      const all = dist.real;
      const lo = Math.min(...all), hi = Math.max(...all), bins = 18, w = (hi - lo) / bins;
      const dens = arr => {
        const h = new Array(bins).fill(0);
        arr.forEach(v => { const i = Math.min(bins - 1, Math.max(0, Math.floor((v - lo) / w))); h[i] += 1; });
        return h.map((c, i) => ({ x: lo + (i + 0.5) * w, y: c / (arr.length * w) }));
      };
      const vc = VARIANT_COLOR();
      const names = ["real", "SMOTE", "CTGAN", "TVAE"];
      C.lineChart($("chart-dist"), {
        series: names.map(n => ({ name: n === "real" ? "Real patients" : n, color: n === "real" ? T.ink2 : vc[n], points: dens(dist[n]), width: n === "real" ? 3 : 2, dashed: n === "real" })),
        xlabel: "Plasma glucose (mg/dL)", ylabel: "Density", height: 340, width: 520, fmtY: v => v.toFixed(3)
      });
      $("dist-legend").innerHTML = names.map(n => `<span class="item"><span class="swatch line" style="background:${n === "real" ? T.ink2 : vc[n]}"></span> ${n === "real" ? "Real diabetic patients" : n}</span>`).join("");
    }
  }

  /* ====================================================================== */
  /* Impact, ethics & India                                                  */
  /* ====================================================================== */
  function renderImpact() {
    const r = state.results;
    const a = r.step3_impact_default, b = r.step3_impact_tuned;
    const rows = [
      ["Cases caught", a.true_positives, b.true_positives, "Patients correctly flagged for a confirmatory test"],
      ["Cases MISSED", a.missed_cases, b.missed_cases, "Diabetic patients told they are fine — the irreversible error"],
      ["False alarms", a.false_alarms, b.false_alarms, "Healthy patients called back for one blood test"],
      ["Correctly cleared", a.correctly_cleared, b.correctly_cleared, "Healthy patients correctly not flagged"],
      ["Confirmatory tests", a.confirmatory_tests_needed, b.confirmatory_tests_needed, "Follow-up capacity the programme must fund"]
    ];
    $("tbl-impact").innerHTML = rows.map(([name, x, y, who]) => {
      const delta = y - x, isMissed = name.indexOf("MISSED") >= 0;
      const colour = isMissed ? (delta < 0 ? "var(--good-ink)" : "var(--critical-ink)") : "var(--ink-muted)";
      return `<tr><td class="name" ${isMissed ? 'style="color:var(--critical-ink)"' : ""}>${name}</td><td class="num">${int(x)}</td>
        <td class="num"><strong>${int(y)}</strong></td><td class="num" style="color:${colour};font-weight:650">${delta > 0 ? "+" : ""}${int(delta)}</td>
        <td class="small muted">${who}</td></tr>`;
    }).join("");
    $("ethics-sentence").innerHTML = `Per 10,000 patients screened, the recall-first threshold rescues <strong>${int(a.missed_cases - b.missed_cases)} people</strong> ` +
      `from being wrongly told they are healthy — at the cost of <strong>${int(b.false_alarms - a.false_alarms)} additional confirmatory blood tests</strong>. We state that trade rather than hide it inside an accuracy score.`;
    $("eth-testpos").textContent = r.split.test_positives;

    const tr = r.step5_transport;
    if (tr) {
      const colors = [T.ink2, T.s2, T.s4, T.s7];
      C.lineChart($("chart-transport"), {
        series: [
          { name: "Precision at the deployed cut-off", color: T.s1, points: r.step5_transport_curve.map(p => ({ x: p.prevalence, y: p.precision })), width: 2.4 },
          { name: "Precision guard", color: T.critical, points: [{ x: 0.02, y: r.config.min_precision }, { x: 0.6, y: r.config.min_precision }], dashed: true, width: 1.4 }
        ].concat(tr.map((s, i) => ({ name: s.name, color: colors[i], points: [{ x: s.prevalence, y: s.precision }], dots: true, width: 0 }))),
        xlabel: "Prevalence in the screened population", ylabel: "Precision", xDomain: [0, 0.6], yDomain: [0, 0.9], height: 300,
        fmtX: v => (v * 100).toFixed(0) + "%"
      });
      $("tbl-transport").innerHTML = tr.map((s, i) => `<tr><td class="name" style="white-space:nowrap"><span class="swatch" style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${colors[i]};margin-right:8px"></span>${s.name}</td>
        <td class="num">${pct(s.prevalence, 1)}</td>
        <td class="num"><span class="badge ${s.meets_precision_guard ? "badge-good" : "badge-critical"}">${pct(s.precision, 0)}</span></td>
        <td class="num">${int(s.per_10k_missed)}</td><td class="num">${int(s.per_10k_false_alarms)}</td><td class="num">${s.tests_per_case_found}</td></tr>`).join("");
      $("protocol").innerHTML = (r.step5_revalidation_protocol || []).map(p => `<li>${esc(p)}</li>`).join("");
    }
    const ext = r.step5_external_validation || [];
    if (ext.length) {
      $("external-card").style.display = "";
      $("external-out").innerHTML = ext.map(e => e.error ? `<div class="callout warning">${esc(e.dataset)}: ${esc(e.error)}</div>` :
        `<div class="kv"><div class="kv-row"><span class="k">${esc(e.dataset)}</span><span class="v">${e.rows} patients · prevalence ${pct(e.prevalence)}</span></div>
         <div class="kv-row"><span class="k">Recall</span><span class="v"><b>${pct(e.metrics.recall)}</b> (${ciTxt(e.ci.recall)})</span></div>
         <div class="kv-row"><span class="k">Precision</span><span class="v">${pct(e.metrics.precision)}</span></div>
         <div class="kv-row"><span class="k">ROC-AUC</span><span class="v">${e.metrics.roc_auc.toFixed(3)}</span></div></div>`).join("");
    }
  }

  /* ====================================================================== */
  /* Live predictor                                                          */
  /* ====================================================================== */
  function bandOf(feature, value) {
    const bands = state.ranges[feature];
    if (!bands) return null;
    for (const b of bands) if (value < b.upto) return b;
    return null;
  }

  function setupPredictor() {
    const meta = state.meta;
    $("pred-fields").innerHTML = state.features.map(f => {
      const m = meta[f];
      return `<div class="field">
        <div class="field-top"><label for="in-${f}">${m.label} <span class="unit">${m.unit}</span></label><span class="band-chip" id="chip-${f}"></span></div>
        <div class="field-row">
          <input type="range" id="rg-${f}" min="${m.min}" max="${m.max}" step="${m.step}" value="${m.default}" aria-label="${m.label}">
          <input type="number" id="in-${f}" min="${m.min}" max="${m.max}" step="${m.step}" value="${m.default}">
        </div></div>`;
    }).join("");

    state.features.forEach(f => {
      const rg = $("rg-" + f), nb = $("in-" + f);
      rg.addEventListener("input", () => { nb.value = rg.value; onPatientChange(); });
      nb.addEventListener("input", () => { rg.value = nb.value; onPatientChange(); });
      nb.addEventListener("change", () => {
        const m = state.meta[f];
        let v = parseFloat(nb.value);
        if (!isFinite(v)) v = m.default;
        v = Math.max(m.min, Math.min(m.max, v));
        nb.value = v; rg.value = v; onPatientChange();
      });
    });

    $("btn-reset").addEventListener("click", resetPatient);
    $("btn-highrisk").addEventListener("click", () => {
      setPatient({ Pregnancies: 8, Glucose: 183, BloodPressure: 84, SkinThickness: 38, Insulin: 240, BMI: 38.5, DiabetesPedigreeFunction: 0.90, Age: 52 });
      $("truth-note").innerHTML = `<div class="callout warning"><div class="ct">Constructed high-risk profile</div>High glucose, high BMI, older age — not a dataset patient.</div>`;
    });
    $("btn-random").addEventListener("click", loadRandomPatient);
    $("btn-explain").addEventListener("click", explainWithAI);
  }

  function resetPatient() {
    setPatient(state.results.step2_medians);
    $("truth-note").innerHTML = `<div class="callout"><div class="ct">Population median patient</div>Every value at its median after the impossible zeros were removed — what the imputer would substitute.</div>`;
  }

  function setPatient(values) {
    state.features.forEach(f => {
      const m = state.meta[f];
      let v = values[f];
      if (v === undefined || v === null || !isFinite(v)) v = m.default;
      v = Math.max(m.min, Math.min(m.max, v));
      $("rg-" + f).value = v;
      $("in-" + f).value = Math.round(v * 100) / 100;
    });
    onPatientChange();
  }

  function readPatient() {
    const p = {};
    state.features.forEach(f => {
      let v = parseFloat($("in-" + f).value);
      if (!isFinite(v)) v = state.meta[f].default;
      p[f] = v;
    });
    return p;
  }

  async function loadRandomPatient() {
    const btn = $("btn-random");
    btn.disabled = true; btn.querySelector(".btn-label").textContent = "Loading…";
    try {
      const res = await fetch("/api/patient/random", { cache: "no-store" });
      if (!res.ok) throw new Error("unavailable");
      const data = await res.json();
      setPatient(data.patient);
      const truth = data.true_outcome === 1;
      const missing = data.had_missing.length ? ` It had impossible zero(s) in ${data.had_missing.join(", ")}, shown as the imputed median.` : "";
      $("truth-note").innerHTML = `<div class="callout ${truth ? "critical" : "good"}"><div class="ct">Real held-out patient · ground truth: ${truth ? "DID develop diabetes" : "did NOT develop diabetes"}</div>
        From the 20% test split — never seen in training, model selection or threshold tuning.${missing}</div>`;
    } catch (e) {
      $("truth-note").innerHTML = `<div class="callout warning"><div class="ct">Server not reachable</div>Start it with <code>python app/app.py</code>.</div>`;
    } finally {
      btn.disabled = false; btn.querySelector(".btn-label").textContent = "Load a real held-out patient";
    }
  }

  let predictTimer = null;
  function onPatientChange() {
    state.patient = readPatient();
    state.features.forEach(f => {
      const chip = $("chip-" + f), b = bandOf(f, state.patient[f]);
      chip.className = "band-chip" + (b ? " " + b.tone : "");
      chip.textContent = b ? b.label : "";
    });
    $("ai-out").innerHTML = `<div class="ai-empty">Values changed — press <strong>Explain with AI</strong> for an updated summary.</div>`;
    $("ai-meta").innerHTML = `<span class="badge badge-violet">Generative layer</span>`;
    clearTimeout(predictTimer);
    predictTimer = setTimeout(predict, 90);
  }

  async function scorePatient(patient) {
    const threshold = state.results.step3_thresholds.recall_first;
    if (state.online) {
      try {
        const res = await fetch("/api/predict", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(Object.assign({}, patient, { threshold }))
        });
        if (res.ok) return await res.json();
      } catch (e) { state.online = false; $("offline-note").classList.add("show"); }
    }
    return surrogatePredict(patient, threshold);
  }

  async function predict() {
    const result = await scorePatient(state.patient);
    if (!result) return;
    state.lastResult = result;
    paintResult(result);
    renderWhatIf(state.patient, result.probability);
  }

  function surrogatePredict(patient, threshold) {
    const s = state.surrogate;
    if (!s) return null;
    let z = s.intercept;
    s.features.forEach((f, i) => { z += s.coef[i] * ((patient[f] - s.mean[i]) / s.scale[i]); });
    const p = 1 / (1 + Math.exp(-z));
    const contributions = s.features.map((f, i) => ({
      feature: f, label: state.meta[f].label, unit: state.meta[f].unit, value: patient[f],
      contribution: p - 1 / (1 + Math.exp(-(z - s.coef[i] * ((patient[f] - s.medians[f]) / s.scale[i]))))
    })).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
    return Object.assign({
      probability: p, percent: p * 100, threshold, flagged: p >= threshold,
      decision: p >= threshold ? "FLAG for confirmatory test" : "No flag",
      contributions, explainer: "Logistic surrogate occlusion (offline)", model: "Logistic surrogate (offline)"
    }, bandFor(p, threshold));
  }

  function bandFor(p, threshold) {
    if (p >= Math.min(0.65, threshold + 0.30)) return { band: "High risk", tone: "critical", action: "Refer for a confirmatory fasting glucose / HbA1c test now." };
    if (p >= threshold) return { band: "Elevated risk", tone: "warning", action: "Flag for a confirmatory test — this is the recall-first catch zone." };
    if (p >= threshold * 0.6) return { band: "Borderline", tone: "serious", action: "Below the cut-off, but close. Re-screen in 12 months." };
    return { band: "Low risk", tone: "good", action: "Routine screening interval. Not a clearance — the model can be wrong." };
  }

  function toneOf(name) {
    const m = { critical: ["critical", "--critical-ink", "--critical-soft"], warning: ["warning", "--warning-ink", "--warning-soft"],
      serious: ["serious", "--serious-ink", "--serious-soft"], good: ["good", "--good-ink", "--good-soft"] }[name] || ["good", "--good-ink", "--good-soft"];
    const cs = getComputedStyle(document.documentElement);
    return { c: cs.getPropertyValue("--" + m[0]).trim(), ink: `var(${m[1]})`, bg: `var(${m[2]})` };
  }

  function paintResult(res) {
    const tone = toneOf(res.tone);
    C.gauge($("gauge"), { value: res.probability, threshold: res.threshold, color: tone.c });
    $("pred-percent").textContent = res.percent.toFixed(1) + "%";
    $("pred-percent").style.color = tone.ink;
    const band = $("pred-band");
    band.textContent = res.band; band.style.background = tone.bg; band.style.color = tone.ink;
    $("pred-action").textContent = res.action;
    $("pred-threshold").textContent = res.threshold.toFixed(2);
    const dec = $("pred-decision");
    dec.textContent = res.decision;
    dec.style.color = res.flagged ? "var(--critical-ink)" : "var(--good-ink)";

    if (res.base_value !== undefined) {
      $("shap-sub").innerHTML = `Model baseline <strong>${pct(res.base_value, 0)}</strong> + contributions = <strong>${pct(res.probability)}</strong> · ${esc(res.explainer || "")}`;
    } else {
      $("shap-sub").textContent = res.explainer || "Per-feature contribution";
    }
    const max = Math.max(0.01, ...res.contributions.map(c => Math.abs(c.contribution)));
    $("pred-contrib").innerHTML = res.contributions.map(c => {
      const w = (Math.abs(c.contribution) / max) * 48, pos = c.contribution >= 0;
      const label = c.label || c.feature;
      return `<div class="wf-row" title="${esc(label)} = ${c.value}${c.band ? " (" + esc(c.band) + ")" : ""}">
        <span class="wf-name">${esc(label)} <small>${c.value}</small></span>
        <span class="wf-bar"><span class="mid"></span><span class="fill" style="left:${pos ? 50 : 50 - w}%;width:${w}%;background:${pos ? T.s2 : T.s1}"></span></span>
        <span class="wf-val" style="color:${pos ? "var(--serious-ink)" : "var(--s1-ink)"}">${pos ? "+" : ""}${(c.contribution * 100).toFixed(1)}</span></div>`;
    }).join("") + `<div class="wf-scale"><span>← lowers risk</span><span>percentage points</span><span>raises risk →</span></div>`;
  }

  /* What-if: one modifiable factor moved to a healthy value, re-scored by the real model. */
  let whatIfToken = 0;
  async function renderWhatIf(patient, baseP) {
    const token = ++whatIfToken;
    const scenarios = [];
    if (patient.BMI > 23) scenarios.push(["BMI to 23 (Asian-Indian healthy limit)", { BMI: 23 }]);
    if (patient.Glucose > 139) scenarios.push(["Glucose to 120 mg/dL (normal tolerance)", { Glucose: 120 }]);
    if (patient.BloodPressure > 80) scenarios.push(["Diastolic BP to 75 mm Hg", { BloodPressure: 75 }]);
    if (scenarios.length > 1) scenarios.push(["All of the above together", Object.assign({}, ...scenarios.map(s => s[1]))]);
    if (!scenarios.length) {
      $("whatif").innerHTML = `<div class="small muted">BMI, glucose and blood pressure are already in their healthy bands — the remaining risk comes from factors that cannot be changed (age, pregnancies, family history).</div>`;
      return;
    }
    const results = await Promise.all(scenarios.map(s => scorePatient(Object.assign({}, patient, s[1]))));
    if (token !== whatIfToken) return;
    $("whatif").innerHTML = scenarios.map((s, i) => {
      const p = results[i] ? results[i].probability : baseP, d = p - baseP;
      const crosses = baseP >= state.results.step3_thresholds.recall_first && p < state.results.step3_thresholds.recall_first;
      return `<div class="wi-row"><span>${s[0]}</span><span class="d" style="color:${d < 0 ? "var(--good-ink)" : "var(--ink-muted)"}">${d > 0 ? "+" : ""}${(d * 100).toFixed(1)} pts</span>
        <span class="badge ${crosses ? "badge-good" : "badge-muted"}">${pct(p, 0)}${crosses ? " · below cut-off" : ""}</span></div>`;
    }).join("") + `<div class="small muted" style="margin-top:4px">Associations, not causal effects — a conversation starter for the clinician, not a promise.</div>`;
  }

  function mdToHtml(text) {
    return esc(text).split(/\n{2,}/).map(block => {
      const m = block.match(/^\*\*(.+?)\*\*\s*\n?([\s\S]*)$/);
      if (m) return `<h5>${m[1]}</h5><p>${m[2].replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>")}</p>`;
      return `<p>${block.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>")}</p>`;
    }).join("");
  }

  async function explainWithAI() {
    const btn = $("btn-explain");
    if (!state.online) {
      $("ai-out").innerHTML = `<div class="callout warning"><div class="ct">Server needed</div>The AI explanation runs on the Flask server. Start it with <code>python app/app.py</code>.</div>`;
      return;
    }
    btn.disabled = true;
    $("ai-out").innerHTML = `<div class="ai-empty"><span class="typing"><i></i><i></i><i></i></span>&nbsp; ${state.llm && state.llm.available ? "Gemini is writing the explanation from the SHAP values…" : "Building the explanation…"}</div>`;
    try {
      const res = await fetch("/api/explain", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.assign({}, state.patient, { threshold: state.results.step3_thresholds.recall_first }))
      });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      const llm = data.writer === "llm";
      $("ai-meta").innerHTML = `<span class="badge ${llm ? "badge-violet" : "badge-warning"}">${llm ? "Written by " + esc(data.model) : "Deterministic template (LLM unavailable)"}</span>` +
        (data.fallback_reason ? `<span class="badge badge-muted">fallback: ${esc(data.fallback_reason)}</span>` : "");
      $("ai-out").innerHTML = `<div class="ai-body">${mdToHtml(data.summary)}</div>
        <div class="ai-disclaimer"><strong>Clinician review required.</strong> ${esc(data.disclaimer)}</div>
        <details class="prompt"><summary>Show the exact prompt the model received</summary><pre>${esc(data.prompt)}</pre></details>`;
    } catch (e) {
      $("ai-out").innerHTML = `<div class="callout warning"><div class="ct">Could not generate the explanation</div>Check the server log.</div>`;
    } finally {
      btn.disabled = false;
    }
  }

  /* ====================================================================== */
  /* Figure gallery                                                          */
  /* ====================================================================== */
  const CAPTIONS = {
    class_balance: "Step 1 — the minority class is the one we must not miss.",
    feature_distributions: "Step 1 — Glucose and BMI separate the outcomes most clearly.",
    missingness: "Step 2 — impossible zeros, per column.",
    imputation_effect: "Step 2 — the zero spike is removed without reshaping the distribution.",
    correlation: "Step 1 — correlation structure after imputation.",
    model_comparison: "Step 3 — seven models ranked by recall, not accuracy.",
    imputation_comparison: "Step 2 — recall by imputation strategy.",
    threshold_sweep: "Step 3 — the threshold is the recall dial.",
    cost_curve: "Step 5 — total weighted harm across cut-offs (FN = 5 × FP).",
    confusion_pair: "Step 3 — default vs recall-first threshold on the test set.",
    roc_pr: "Step 3 — ranking quality, independent of any threshold.",
    calibration: "Step 3 — are the predicted probabilities honest?",
    feature_importance: "Step 4 — the required feature-importance chart.",
    importance_consensus: "Step 4 — independent views agree on the top drivers.",
    risk_curves: "Step 4 — how risk moves with each leading feature.",
    latent_space: "Step 1 — a 2-D latent view; the classes overlap heavily.",
    screening_impact: "Step 5 — the trade-off in people per 10,000 screened.",
    synthetic_comparison: "GenAI — CTGAN / TVAE / Copula vs SMOTE vs class weights.",
    synthetic_fidelity: "GenAI — realism and privacy audit of the synthetic patients.",
    bootstrap_ci: "Step 3 — 95% bootstrap confidence intervals at the operating point.",
    calibration_comparison: "Step 3 — calibration curve, raw vs isotonic.",
    decision_curve: "Step 5 — decision-curve analysis: clinical net benefit.",
    shap_summary: "Step 4 — SHAP summary across held-out patients.",
    prevalence_transport: "Step 5 — transportability to Indian prevalence."
  };

  function renderGallery() {
    const figs = state.results.figures;
    $("figure-gallery").innerHTML = Object.keys(figs).map(key => {
      const file = figs[key].split("/").pop();
      return `<figure class="figure-card"><img src="/figures/${file}" alt="${esc(CAPTIONS[key] || key)}" loading="lazy">
        <figcaption><strong>${file}</strong><br>${CAPTIONS[key] || ""}</figcaption></figure>`;
    }).join("");
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
