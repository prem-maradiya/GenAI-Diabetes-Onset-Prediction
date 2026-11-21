/* ==========================================================================
   Minimal dependency-free SVG chart library.
   One visual system, shared with src/plots.py: fixed categorical slot order,
   hairline recessive chrome, thin marks, hover tooltips on every mark.
   ========================================================================== */
(function (global) {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";

  const T = {
    surface: "#ffffff",
    ink: "#0b0b0b",
    ink2: "#52514e",
    muted: "#898781",
    grid: "#e1e0d9",
    axis: "#c3c2b7",
    s1: "#2a78d6", s2: "#eb6834", s3: "#1baf7a", s4: "#eda100",
    s5: "#e87ba4", s6: "#008300", s7: "#4a3aa7", s8: "#e34948",
    critical: "#d03b3b", good: "#0ca30c", warning: "#fab219",
    track: "#ecebe6"
  };

  /* Pull the live design tokens so every chart follows the light/dark theme.
     Mutates T in place - app.js holds a reference to the same object. */
  function syncTheme() {
    const cs = getComputedStyle(document.documentElement);
    const v = name => cs.getPropertyValue(name).trim();
    const map = {
      surface: "--surface", ink: "--ink", ink2: "--ink-2", muted: "--ink-muted",
      grid: "--grid", axis: "--line-strong", track: "--gauge-track",
      s1: "--s1", s2: "--s2", s3: "--s3", s4: "--s4", s5: "--s5", s6: "--s6", s7: "--s7", s8: "--s8",
      critical: "--critical", good: "--good", warning: "--warning"
    };
    Object.keys(map).forEach(k => { const val = v(map[k]); if (val) T[k] = val; });
  }
  const FONT = "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";

  /* ------------------------------- helpers ------------------------------ */
  function el(tag, attrs, parent) {
    const node = document.createElementNS(NS, tag);
    for (const k in attrs) {
      if (attrs[k] === null || attrs[k] === undefined) continue;
      node.setAttribute(k, attrs[k]);
    }
    if (parent) parent.appendChild(node);
    return node;
  }

  function svgRoot(container, w, h) {
    container.innerHTML = "";
    const svg = el("svg", {
      viewBox: `0 0 ${w} ${h}`,
      width: "100%",
      preserveAspectRatio: "xMidYMid meet",
      role: "img"
    }, container);
    return svg;
  }

  function niceTicks(min, max, count) {
    if (min === max) { max = min + 1; }
    const span = max - min;
    const raw = span / Math.max(1, count);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm >= 7.5 ? 10 : norm >= 3.5 ? 5 : norm >= 1.5 ? 2 : 1) * mag;
    const start = Math.ceil(min / step) * step;
    const out = [];
    for (let v = start; v <= max + step * 1e-9; v += step) out.push(Math.round(v * 1e9) / 1e9);
    return out;
  }

  const fmt = (v, d) => (v === null || v === undefined || Number.isNaN(v))
    ? "—" : Number(v).toFixed(d === undefined ? 2 : d);

  /* ------------------------------- tooltip ------------------------------ */
  const tip = {
    node: null,
    ensure() {
      if (!this.node) this.node = document.getElementById("tooltip");
      return this.node;
    },
    show(evt, html) {
      const n = this.ensure(); if (!n) return;
      n.innerHTML = html;
      n.style.opacity = "1";
      this.move(evt);
    },
    move(evt) {
      const n = this.ensure(); if (!n) return;
      const r = n.getBoundingClientRect();
      let x = evt.clientX + 14, y = evt.clientY - r.height - 10;
      if (x + r.width > window.innerWidth - 10) x = evt.clientX - r.width - 14;
      if (y < 8) y = evt.clientY + 18;
      n.style.left = x + "px";
      n.style.top = y + "px";
    },
    hide() { const n = this.ensure(); if (n) n.style.opacity = "0"; }
  };

  function hoverable(node, html) {
    node.style.cursor = "default";
    node.addEventListener("mouseenter", e => tip.show(e, html));
    node.addEventListener("mousemove", e => tip.move(e));
    node.addEventListener("mouseleave", () => tip.hide());
  }

  function ttRow(label, value) {
    return `<div class="tt-row"><span>${label}</span><b>${value}</b></div>`;
  }

  /* ---------------------------- axis painting --------------------------- */
  function xAxis(svg, m, W, H, scale, ticks, label, fmtTick) {
    ticks.forEach(t => {
      const x = scale(t);
      el("line", { x1: x, x2: x, y1: m.t, y2: H - m.b, stroke: T.grid, "stroke-width": 1 }, svg);
      el("text", {
        x, y: H - m.b + 16, "text-anchor": "middle", fill: T.muted,
        "font-size": 11, "font-family": FONT
      }, svg).textContent = fmtTick ? fmtTick(t) : t;
    });
    el("line", { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, stroke: T.axis, "stroke-width": 1 }, svg);
    if (label) {
      el("text", {
        x: m.l + (W - m.l - m.r) / 2, y: H - 6, "text-anchor": "middle",
        fill: T.ink2, "font-size": 11.5, "font-family": FONT
      }, svg).textContent = label;
    }
  }

  function yAxis(svg, m, W, H, scale, ticks, label, fmtTick) {
    ticks.forEach(t => {
      const y = scale(t);
      el("line", { x1: m.l, x2: W - m.r, y1: y, y2: y, stroke: T.grid, "stroke-width": 1 }, svg);
      el("text", {
        x: m.l - 9, y: y + 4, "text-anchor": "end", fill: T.muted,
        "font-size": 11, "font-family": FONT
      }, svg).textContent = fmtTick ? fmtTick(t) : t;
    });
    el("line", { x1: m.l, x2: m.l, y1: m.t, y2: H - m.b, stroke: T.axis, "stroke-width": 1 }, svg);
    if (label) {
      const cy = m.t + (H - m.t - m.b) / 2;
      el("text", {
        x: 13, y: cy, "text-anchor": "middle", fill: T.ink2, "font-size": 11.5,
        "font-family": FONT, transform: `rotate(-90 13 ${cy})`
      }, svg).textContent = label;
    }
  }

  /* =========================== horizontal bars ========================== */
  /* rows: [{label, value, err?, tip?}]  - one series, one colour.          */
  function hbar(container, opts) {
    const rows = opts.rows || [];
    const color = opts.color || T.s1;
    const labelW = opts.labelWidth || 150;
    const rowH = opts.rowHeight || 30;
    // A narrower viewBox in a narrow card keeps label text near full size
    // instead of shrinking it with the SVG.
    const W = opts.width || 720;
    const m = { t: 10, r: 62, b: 42, l: labelW };
    const H = m.t + m.b + rows.length * rowH;
    const svg = svgRoot(container, W, H);

    const values = rows.map(r => r.value);
    const errs = rows.map(r => r.err || 0);
    let lo = Math.min(0, ...values.map((v, i) => v - errs[i]));
    let hi = Math.max(...values.map((v, i) => v + errs[i]), 0);
    if (hi === lo) hi = lo + 1;
    const pad = (hi - lo) * 0.04;
    lo -= pad; hi += pad;
    const sx = v => m.l + ((v - lo) / (hi - lo)) * (W - m.l - m.r);

    xAxis(svg, m, W, H, sx, niceTicks(lo, hi, 5), opts.xlabel, opts.fmtTick);
    if (lo < 0) el("line", { x1: sx(0), x2: sx(0), y1: m.t, y2: H - m.b, stroke: T.axis, "stroke-width": 1 }, svg);

    rows.forEach((r, i) => {
      const y = m.t + i * rowH + rowH / 2;
      const bh = Math.min(17, rowH - 11);
      const x0 = sx(Math.min(0, r.value));
      const x1 = sx(Math.max(0, r.value));

      el("text", {
        x: m.l - 11, y: y + 4, "text-anchor": "end", fill: T.ink2,
        "font-size": 12, "font-family": FONT
      }, svg).textContent = r.label;

      const bar = el("rect", {
        x: x0, y: y - bh / 2, width: Math.max(1.5, x1 - x0), height: bh,
        rx: 4, fill: color, opacity: r.dim ? 0.42 : 1
      }, svg);
      hoverable(bar, `<div class="tt-title">${r.label}</div>${r.tip ||
        ttRow(opts.valueName || "Value", fmt(r.value, opts.decimals))}`);

      if (r.err) {
        const a = sx(r.value - r.err), b = sx(r.value + r.err);
        el("line", { x1: a, x2: b, y1: y, y2: y, stroke: T.muted, "stroke-width": 1.2 }, svg);
        el("line", { x1: a, x2: a, y1: y - 4, y2: y + 4, stroke: T.muted, "stroke-width": 1.2 }, svg);
        el("line", { x1: b, x2: b, y1: y - 4, y2: y + 4, stroke: T.muted, "stroke-width": 1.2 }, svg);
      }

      const endX = Math.max(x1, r.err ? sx(r.value + r.err) : x1) + 7;
      el("text", {
        x: endX, y: y + 4, fill: T.ink2, "font-size": 11.5,
        "font-family": FONT, "font-variant-numeric": "tabular-nums"
      }, svg).textContent = r.display !== undefined ? r.display : fmt(r.value, opts.decimals);
    });
    return svg;
  }

  /* ======================= grouped horizontal bars ====================== */
  /* rows: [{label, values:[..], tips?:[..]}]  series: [{name, color}]      */
  function groupedBar(container, opts) {
    const rows = opts.rows || [];
    const series = opts.series || [];
    const labelW = opts.labelWidth || 165;
    const groupH = opts.groupHeight || (14 + series.length * 15);
    const W = opts.width || 720;
    const m = { t: 10, r: 56, b: 42, l: labelW };
    const H = m.t + m.b + rows.length * groupH;
    const svg = svgRoot(container, W, H);

    let hi = 0;
    rows.forEach(r => r.values.forEach(v => { if (v > hi) hi = v; }));
    hi = hi * 1.06 || 1;
    const sx = v => m.l + (v / hi) * (W - m.l - m.r);

    xAxis(svg, m, W, H, sx, niceTicks(0, hi, 5), opts.xlabel, opts.fmtTick);

    rows.forEach((r, i) => {
      const top = m.t + i * groupH;
      const bh = Math.min(13, (groupH - 12) / series.length - 2);
      const stackH = series.length * (bh + 2) - 2;
      const y0 = top + (groupH - stackH) / 2;

      el("text", {
        x: m.l - 11, y: top + groupH / 2 + 4, "text-anchor": "end",
        fill: r.highlight ? T.s1 : T.ink2, "font-size": 12,
        "font-weight": r.highlight ? 650 : 400, "font-family": FONT
      }, svg).textContent = r.label;

      series.forEach((s, k) => {
        const v = r.values[k];
        if (v === null || v === undefined) return;
        const y = y0 + k * (bh + 2);
        const bar = el("rect", {
          x: m.l, y, width: Math.max(1.5, sx(v) - m.l), height: bh, rx: 3, fill: s.color
        }, svg);
        hoverable(bar,
          `<div class="tt-title">${r.label}</div>` +
          series.map((ss, kk) => ttRow(ss.name, fmt(r.values[kk], opts.decimals))).join(""));
        el("text", {
          x: sx(v) + 6, y: y + bh - 1.5, fill: T.ink2, "font-size": 10.5,
          "font-family": FONT, "font-variant-numeric": "tabular-nums"
        }, svg).textContent = fmt(v, opts.decimals);
      });
    });
    return svg;
  }

  /* ============================== line chart ============================ */
  /* series: [{name, color, points:[{x,y}], dashed?}]                       */
  function lineChart(container, opts) {
    const series = opts.series || [];
    const W = opts.width || 720;
    const H = opts.height || 320;
    const m = Object.assign({ t: 14, r: 18, b: 46, l: 52 }, opts.margin);
    const svg = svgRoot(container, W, H);

    let xs = [], ys = [];
    series.forEach(s => s.points.forEach(p => { xs.push(p.x); ys.push(p.y); }));
    const xLo = opts.xDomain ? opts.xDomain[0] : Math.min(...xs);
    const xHi = opts.xDomain ? opts.xDomain[1] : Math.max(...xs);
    const yLo = opts.yDomain ? opts.yDomain[0] : Math.min(...ys);
    const yHi = opts.yDomain ? opts.yDomain[1] : Math.max(...ys);

    const sx = v => m.l + ((v - xLo) / (xHi - xLo || 1)) * (W - m.l - m.r);
    const sy = v => H - m.b - ((v - yLo) / (yHi - yLo || 1)) * (H - m.t - m.b);

    yAxis(svg, m, W, H, sy, niceTicks(yLo, yHi, 5), opts.ylabel, opts.fmtY);
    xAxis(svg, m, W, H, sx, niceTicks(xLo, xHi, 6), opts.xlabel, opts.fmtX);

    (opts.markers || []).forEach(mk => {
      const x = sx(mk.x);
      el("line", {
        x1: x, x2: x, y1: m.t, y2: H - m.b, stroke: mk.color || T.muted,
        "stroke-width": 1.4, "stroke-dasharray": "4 3"
      }, svg);
      if (mk.label) {
        el("text", {
          x: x + 5, y: m.t + 12, fill: mk.color || T.muted, "font-size": 11,
          "font-weight": 650, "font-family": FONT
        }, svg).textContent = mk.label;
      }
    });

    series.forEach(s => {
      if (!s.points.length) return;
      const d = s.points.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(2)},${sy(p.y).toFixed(2)}`).join(" ");
      el("path", {
        d, fill: "none", stroke: s.color, "stroke-width": s.width || 2,
        "stroke-linejoin": "round", "stroke-linecap": "round",
        "stroke-dasharray": s.dashed ? "5 4" : null, opacity: s.opacity || 1
      }, svg);
      if (s.dots) {
        s.points.forEach(p => {
          const c = el("circle", {
            cx: sx(p.x), cy: sy(p.y), r: 4.5, fill: s.color,
            stroke: T.surface, "stroke-width": 2
          }, svg);
          hoverable(c, `<div class="tt-title">${s.name}</div>` +
            ttRow(opts.xlabel || "x", fmt(p.x, 2)) + ttRow(opts.ylabel || "y", fmt(p.y, 3)));
        });
      }
    });

    /* crosshair readout across all series */
    if (opts.crosshair !== false && series.length) {
      const cross = el("line", {
        x1: 0, x2: 0, y1: m.t, y2: H - m.b, stroke: T.ink2,
        "stroke-width": 1, opacity: 0
      }, svg);
      const hit = el("rect", {
        x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b,
        fill: "transparent"
      }, svg);
      hit.style.cursor = "crosshair";
      hit.addEventListener("mousemove", evt => {
        const box = svg.getBoundingClientRect();
        const px = ((evt.clientX - box.left) / box.width) * W;
        const xv = xLo + ((px - m.l) / (W - m.l - m.r)) * (xHi - xLo);
        cross.setAttribute("x1", sx(xv)); cross.setAttribute("x2", sx(xv));
        cross.setAttribute("opacity", 0.35);
        let html = `<div class="tt-title">${opts.xlabel || "x"} = ${fmt(xv, 2)}</div>`;
        series.forEach(s => {
          let best = null, bd = Infinity;
          s.points.forEach(p => { const d = Math.abs(p.x - xv); if (d < bd) { bd = d; best = p; } });
          if (best) html += ttRow(s.name, fmt(best.y, 3));
        });
        tip.show(evt, html);
      });
      hit.addEventListener("mouseleave", () => { cross.setAttribute("opacity", 0); tip.hide(); });
    }
    return svg;
  }

  /* ============================== scatter =============================== */
  function scatter(container, opts) {
    const W = opts.width || 720, H = opts.height || 380;
    const m = { t: 14, r: 18, b: 46, l: 52 };
    const svg = svgRoot(container, W, H);
    const pts = opts.points || [];
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const xLo = Math.min(...xs), xHi = Math.max(...xs);
    const yLo = Math.min(...ys), yHi = Math.max(...ys);
    const px = (xHi - xLo) * 0.05, py = (yHi - yLo) * 0.05;
    const sx = v => m.l + ((v - xLo + px) / (xHi - xLo + 2 * px)) * (W - m.l - m.r);
    const sy = v => H - m.b - ((v - yLo + py) / (yHi - yLo + 2 * py)) * (H - m.t - m.b);

    yAxis(svg, m, W, H, sy, niceTicks(yLo, yHi, 5), opts.ylabel);
    xAxis(svg, m, W, H, sx, niceTicks(xLo, xHi, 6), opts.xlabel);

    pts.forEach(p => {
      const c = el("circle", {
        cx: sx(p.x), cy: sy(p.y), r: 3.6,
        fill: opts.colors[p.c], opacity: 0.72,
        stroke: T.surface, "stroke-width": 0.8
      }, svg);
      hoverable(c, `<div class="tt-title">${opts.names[p.c]}</div>` +
        ttRow("PC 1", fmt(p.x, 2)) + ttRow("PC 2", fmt(p.y, 2)));
    });
    return svg;
  }

  /* =============================== gauge ================================ */
  function gauge(container, opts) {
    const W = 230, H = 140, cx = W / 2, cy = 118, r = 92;
    const svg = svgRoot(container, W, H);
    const value = Math.max(0, Math.min(1, opts.value || 0));

    // `from` and `to` are 0-1 along a half turn, so the sweep can never exceed
    // 180 degrees and the SVG large-arc-flag is ALWAYS 0.  Setting it to 1 makes
    // the renderer take the complementary arc the long way round the circle.
    const arc = (from, to, radius) => {
      const a0 = Math.PI + Math.PI * from, a1 = Math.PI + Math.PI * to;
      const x0 = cx + radius * Math.cos(a0), y0 = cy + radius * Math.sin(a0);
      const x1 = cx + radius * Math.cos(a1), y1 = cy + radius * Math.sin(a1);
      return `M ${x0} ${y0} A ${radius} ${radius} 0 0 1 ${x1} ${y1}`;
    };

    el("path", {
      d: arc(0, 1, r), fill: "none", stroke: T.track,
      "stroke-width": 15, "stroke-linecap": "round"
    }, svg);

    if (value > 0.004) {
      el("path", {
        d: arc(0, value, r), fill: "none", stroke: opts.color || T.s1,
        "stroke-width": 15, "stroke-linecap": "round"
      }, svg);
    }

    if (opts.threshold !== undefined && opts.threshold !== null) {
      const a = Math.PI + Math.PI * opts.threshold;
      const inner = r - 12, outer = r + 12;
      el("line", {
        x1: cx + inner * Math.cos(a), y1: cy + inner * Math.sin(a),
        x2: cx + outer * Math.cos(a), y2: cy + outer * Math.sin(a),
        stroke: T.ink, "stroke-width": 2.4, "stroke-linecap": "round"
      }, svg);
      el("text", {
        x: cx + (outer + 9) * Math.cos(a), y: cy + (outer + 9) * Math.sin(a) + 4,
        "text-anchor": "middle", fill: T.ink2, "font-size": 10.5, "font-weight": 640,
        "font-family": FONT
      }, svg).textContent = "cut-off";
    }

    ["0%", "100%"].forEach((label, i) => {
      el("text", {
        x: i ? cx + r + 4 : cx - r - 4, y: cy + 16, "text-anchor": i ? "end" : "start",
        fill: T.muted, "font-size": 10.5, "font-family": FONT
      }, svg).textContent = label;
    });
    return svg;
  }

  /* ============================= beeswarm =============================== */
  /* rows: [{feature, points:[{shap, value}]}] ordered top to bottom.         */
  function beeswarm(container, opts) {
    const rows = opts.rows || [];
    const W = opts.width || 720, rowH = opts.rowHeight || 34;
    const m = { t: 10, r: 18, b: 44, l: opts.labelWidth || 170 };
    const H = m.t + m.b + rows.length * rowH;
    const svg = svgRoot(container, W, H);
    let lo = 0, hi = 0;
    rows.forEach(r => r.points.forEach(p => { lo = Math.min(lo, p.shap); hi = Math.max(hi, p.shap); }));
    const pad = (hi - lo) * 0.05; lo -= pad; hi += pad;
    const sx = v => m.l + ((v - lo) / (hi - lo || 1)) * (W - m.l - m.r);
    xAxis(svg, m, W, H, sx, niceTicks(lo, hi, 6), opts.xlabel, t => (t * 100).toFixed(0));
    el("line", { x1: sx(0), x2: sx(0), y1: m.t, y2: H - m.b, stroke: T.axis, "stroke-width": 1.2 }, svg);
    const lerp = (a, b, t) => a + (b - a) * t;
    const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const cLo = hex(T.s1.length === 7 ? T.s1 : "#2a78d6"), cHi = hex(T.s2.length === 7 ? T.s2 : "#eb6834");
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    rows.forEach((r, i) => {
      const y = m.t + i * rowH + rowH / 2;
      el("text", { x: m.l - 11, y: y + 4, "text-anchor": "end", fill: T.ink2, "font-size": 12, "font-family": FONT }, svg).textContent = r.feature;
      const vals = r.points.map(p => p.value);
      const vLo = Math.min(...vals), vHi = Math.max(...vals);
      r.points.forEach(p => {
        const t = (p.value - vLo) / ((vHi - vLo) || 1);
        const c = `rgb(${cLo.map((a, k) => Math.round(lerp(a, cHi[k], t))).join(",")})`;
        const dot = el("circle", { cx: sx(p.shap), cy: y + (rnd() - 0.5) * (rowH - 12), r: 3.1, fill: c, opacity: 0.85 }, svg);
        hoverable(dot, `<div class="tt-title">${r.feature} = ${p.value}</div>` + ttRow("SHAP", (p.shap * 100).toFixed(1) + " pts"));
      });
    });
    return svg;
  }

  syncTheme();
  global.Charts = { hbar, groupedBar, lineChart, scatter, gauge, beeswarm, syncTheme, T, tip, fmt };
})(window);
