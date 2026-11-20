// Contract Drift viewer. Plain ES module; Cytoscape is loaded as a global from node_modules.
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const C = {
  paper: "#f6f3ec", card: "#fbf9f4", ink: "#1d1b17", ink2: "#4a463e", ink3: "#6f695e", rule: "#dcd5c6",
  verm: "#d2401f", amber: "#d9a441", slate: "#3e5a6e", slateWash: "#e1e8ec", green: "#3c6e47",
};
const VERDICT_COLOR = { MISMATCH: C.verm, REVIEW: C.amber, OK: C.green, TEST: C.slate };

const state = { reviews: [], review: null, driftId: null, data: null, active: -1, cy: null };

async function api(path, opts) {
  const res = await fetch(path, opts);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error || res.statusText), body);
  return body;
}

/* ---------- graph ---------- */
const graphStyle = [
  { selector: "node", style: {
    "font-family": "IBM Plex Mono, monospace", "font-size": 15, color: C.ink2, label: "data(label)",
    "text-wrap": "wrap", "text-max-width": 220, "text-valign": "bottom", "text-margin-y": 5,
    "transition-property": "opacity", "transition-duration": 150, "transition-timing-function": "ease-out",
  } },
  { selector: "node.drift", style: {
    shape: "round-rectangle", "background-color": C.verm, width: "label", height: "label", padding: 10,
    color: "#fff", "text-valign": "center", "text-margin-y": 0, "font-size": 16, "font-weight": 500,
  } },
  { selector: "node.fieldversion", style: {
    shape: "rectangle", "background-color": C.ink, width: "label", height: "label", padding: 8,
    color: C.paper, "text-valign": "center", "text-margin-y": 0,
  } },
  { selector: "node.fieldversion.before", style: { "background-color": C.card, color: C.ink3, "border-width": 1, "border-color": C.rule, "border-style": "dashed" } },
  { selector: "node.usage", style: { width: 26, height: 26, "background-color": (n) => VERDICT_COLOR[n.data("verdict")] || C.ink3 } },
  { selector: "node.param", style: { shape: "diamond", width: 24, height: 24, "background-color": C.card, "border-width": 1.5, "border-color": C.ink2 } },
  { selector: "node.function", style: { shape: "round-tag", width: 24, height: 24, "background-color": C.ink2 } },
  { selector: "node.file", style: { shape: "rectangle", width: 24, height: 24, "background-color": C.slateWash, "border-width": 1.5, "border-color": C.slate } },
  { selector: "node.file[?inDiff]", style: { "border-style": "dashed" } },
  { selector: "edge", style: {
    width: 1.2, "line-color": "#b9b1a1", "target-arrow-color": "#b9b1a1", "target-arrow-shape": "triangle",
    "arrow-scale": 0.7, "curve-style": "bezier", label: "data(label)", "font-size": 12,
    "font-family": "IBM Plex Mono, monospace", color: C.ink3, "text-rotation": "autorotate",
    "text-background-color": C.paper, "text-background-opacity": 1, "text-background-padding": 2,
    "transition-property": "opacity, line-color, width", "transition-duration": 150, "transition-timing-function": "ease-out",
  } },
  { selector: "edge.linked_to", style: { "line-style": "dashed", "line-dash-pattern": [6, 4], "line-color": C.verm, "target-arrow-color": C.verm, width: 1.8, color: C.verm } },
  { selector: "edge.test-edge", style: { "line-style": "dotted", "line-color": "#9fb1bd", "target-arrow-color": "#9fb1bd" } },
  { selector: "edge.before", style: { "line-style": "dashed" } },
  { selector: ".dim", style: { opacity: 0.25 } },
  { selector: "edge.hl", style: { width: 2.6, "line-color": C.ink, "target-arrow-color": C.ink, color: C.ink } },
  { selector: "edge.linked_to.hl", style: { "line-color": C.verm, "target-arrow-color": C.verm, color: C.verm } },
  { selector: "node.hl", style: { "font-weight": 600, color: C.ink } },
  { selector: "node.drift.hl, node.fieldversion.hl", style: { color: "#fff" } },
  { selector: "node.fieldversion.before.hl", style: { color: C.ink3 } },
];

function drawGraph(container, elements, rootSelector) {
  const cy = cytoscape({
    container, elements, style: graphStyle, wheelSensitivity: 0.2, minZoom: 0.3, maxZoom: 2.5,
    autoungrabify: false, boxSelectionEnabled: false,
  });
  const roots = rootSelector ? cy.nodes(rootSelector) : undefined;
  cy.layout({ name: "breadthfirst", directed: false, roots, spacingFactor: 0.9, padding: 24, animate: false }).run();
  return cy;
}

function highlight(ids) {
  const cy = state.cy;
  if (!cy) return;
  cy.batch(() => {
    cy.elements().removeClass("hl dim");
    if (!ids) return;
    const set = new Set(ids);
    cy.elements().forEach((el) => el.addClass(set.has(el.id()) ? "hl" : "dim"));
  });
}

/* ---------- review ---------- */
function renderRail() {
  $("#prs").innerHTML = state.reviews.map((r, i) => {
    const total = r.drifts.length;
    const cur = state.review === r;
    const title = r.head === r.base ? "Base against itself" : r.title;
    return `<li><button data-pr="${i}" aria-current="${cur}">
      <span class="pr-title">${esc(title)}</span>
      <span class="pr-meta"><span>${esc(r.base)} → ${esc(r.head)}</span>
      ${total ? `<span class="n">${r.counts.MISMATCH} mismatch</span>` : `<span class="zero">clean</span>`}</span>
    </button></li>`;
  }).join("");
  const drifts = state.review?.drifts ?? [];
  $("#drifts").innerHTML = drifts.length
    ? drifts.map((d) => `<li><button data-drift="${esc(d.id)}" aria-current="${d.id === state.driftId}">
        <span class="drift-key">${esc(d.key)}</span>
        <span class="change">@${esc(d.tag)} <span class="from">${esc(d.before)}</span> → <span class="to">${esc(d.after)}</span></span>
      </button></li>`).join("")
    : `<li class="empty-rail">No meaning changes.</li>`;
}

function markCode(code, key) {
  const field = key.split(".").pop();
  return esc(code).replace(new RegExp(`\\b${field}\\b`, "g"), `<mark>${field}</mark>`);
}

function renderShortlist() {
  const d = state.data;
  if (!d) {
    $("#entries").innerHTML = "";
    $("#tally").textContent = "";
    $("#not-affected").textContent = "";
    return;
  }
  const c = d.counts;
  $("#tally").textContent = `${c.MISMATCH} MISMATCH · ${c.REVIEW} REVIEW · ${c.TEST} tests${c.OK ? ` · ${c.OK} OK` : ""}`;
  $("#entries").innerHTML = d.drift.entries.map((e, i) => {
    const loc = e.line ? `${e.path}:${e.line}` : e.path;
    const badge = e.verdict === "TEST"
      ? (e.inDiff ? `<span class="badge in">in this PR</span>` : `<span class="badge">not in this PR</span>`)
      : (e.inDiff ? `<span class="badge in">in diff</span>` : "");
    return `<li class="entry ${e.verdict}${i === state.active ? " active" : ""}" data-i="${i}" tabindex="0"
        aria-label="${esc(`${e.rank}. ${e.verdict} ${loc}`)}">
      <div class="top"><span class="rank">${e.rank}</span><span class="chip ${e.verdict}">${e.verdict}</span>${badge}</div>
      <div class="loc">${esc(loc)}</div>
      ${e.code ? `<div class="code">${markCode(e.code, d.drift.key)}</div>` : ""}
      <div class="reason">${esc(e.reason)}</div>
      ${e.detail && e.verdict !== "TEST" ? `<div class="detail">${esc(e.detail)}</div>` : ""}
      <div class="detail">${esc(e.pathText)}</div>
    </li>`;
  }).join("");
  $("#not-affected").textContent = `Not affected: ${d.notAffected.usages} other usages of ${d.notAffected.fields} contract fields in ${d.head}.`;
}

function renderHead() {
  const d = state.data?.drift;
  if (!d) {
    $("#drift-head").innerHTML = "";
    return;
  }
  const prod = d.producers.map((p) => `<span>produced by <code>${esc(p.name)}</code> ${esc(p.path)}:${p.line}${p.inDiff ? " (in diff)" : ""}</span>`).join("");
  $("#drift-head").innerHTML = `
    <h1><code>${esc(d.key)}</code><span class="change">@${esc(d.tag)} <span class="from">${esc(d.before)}</span> → <span class="to">${esc(d.after)}</span></span></h1>
    <div class="meta"><span>declared <code>${esc(d.declared.path)}:${d.declared.line}</code></span>${prod}<span>${esc(state.data.base)} → ${esc(state.data.head)}</span></div>`;
}

async function showEvidence(e) {
  const box = $("#evidence");
  if (!e) {
    box.innerHTML = `<p class="placeholder">Hover or select a shortlist entry to see its evidence and light up its impact path.</p>`;
    return;
  }
  const line = e.line ?? 1;
  try {
    const s = await api(`/api/snippet?snapshot=${encodeURIComponent(state.data.head)}&path=${encodeURIComponent(e.path)}&line=${line}`);
    if (state.data.drift.entries[state.active] !== e) return;
    const body = s.lines.map((l, i) => {
      const n = s.from + i;
      const row = `<span class="ln">${n}</span>${esc(l) || " "}`;
      return e.line && n === e.line ? `<span class="hit">${row}</span>` : `${row}\n`;
    }).join("");
    box.innerHTML = `<div class="where"><span>${esc(e.path)}${e.line ? `:${e.line}` : ""} · ${esc(state.data.head)}</span><span>${esc(e.verdict)} · ${esc(e.reason)}</span></div><pre>${body}</pre>`;
  } catch (err) {
    box.innerHTML = `<p class="placeholder">${esc(err.message)}</p>`;
  }
}

function setActive(i, { scroll = false } = {}) {
  const entries = state.data?.drift.entries ?? [];
  if (!entries.length) return;
  state.active = Math.max(0, Math.min(entries.length - 1, i));
  document.querySelectorAll(".entry").forEach((el) => el.classList.toggle("active", Number(el.dataset.i) === state.active));
  const e = entries[state.active];
  highlight(state.data.highlight[e.targetId]);
  showEvidence(e);
  if (scroll) document.querySelector(`.entry[data-i="${state.active}"]`)?.scrollIntoView({ block: "nearest" });
}

async function selectDrift(id) {
  state.driftId = id;
  state.active = -1;
  renderRail();
  if (state.cy) {
    state.cy.destroy();
    state.cy = null;
  }
  if (!id) {
    state.data = null;
    renderHead();
    renderShortlist();
    const r = state.review;
    $("#graph").innerHTML = `<div class="empty-state"><div><h3>No meaning changes. Nothing to review.</h3>
      <p>No <code>@unit</code>, <code>@format</code> or <code>@tz</code> tag differs between ${esc(r.base)} and ${esc(r.head)}.</p></div></div>`;
    $("#evidence").innerHTML = "";
    return;
  }
  $("#graph").innerHTML = "";
  state.data = await api(`/api/drift/${encodeURIComponent(id)}`);
  renderHead();
  renderShortlist();
  const before = state.data.elements.find((el) => el.data.kind === "FieldVersion" && el.data.props?.snapshot === state.data.base);
  if (before) before.classes += " before";
  state.data.elements.forEach((el) => { if (el.data.type === "BEFORE") el.classes += " before"; });
  state.cy = drawGraph($("#graph"), state.data.elements, "node.drift");
  state.cy.on("tap", "node", (evt) => {
    const id = evt.target.id();
    const i = state.data.drift.entries.findIndex((e) => (state.data.highlight[e.targetId] || []).at(-1) === id || evt.target.data("props")?.id === e.targetId);
    if (i >= 0) setActive(i, { scroll: true });
  });
  setActive(0);
}

function selectReview(i) {
  state.review = state.reviews[i];
  const first = state.review.drifts[0]?.id ?? null;
  selectDrift(first);
}

/* ---------- cypher ---------- */
let presets = [];
async function initCypher() {
  presets = await api("/api/presets");
  $("#presets").innerHTML = presets.map((p, i) => `<button data-preset="${i}" aria-pressed="false">${esc(p.title)}</button>`).join("");
  $("#query").value = presets.find((p) => p.name === "tests-not-in-diff")?.cypher ?? "MATCH (n) RETURN labels(n)[0] AS label, count(*) AS n";
}

function renderCell(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && v.kind === "node") return `(:${v.labels.join(":")} ${v.properties.id ?? v.properties.key ?? ""})`;
  if (typeof v === "object" && v.kind === "relationship") return `[:${v.type}]`;
  if (Array.isArray(v)) return `[${v.map(renderCell).join(", ")}]`;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

let resultCy = null;
async function runQuery() {
  const query = $("#query").value;
  $("#cypher-status").textContent = "running…";
  $("#cypher-error").hidden = true;
  try {
    const r = await api("/api/cypher", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query }) });
    $("#cypher-status").textContent = `${r.total} row${r.total === 1 ? "" : "s"} · ${r.ms} ms${r.truncated ? " · first 500 shown" : ""}`;
    $("#cypher-table").innerHTML = `<table><thead><tr>${r.columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${
      r.rows.map((row) => `<tr>${r.columns.map((c) => `<td class="${typeof row[c] === "number" ? "num" : ""}">${esc(renderCell(row[c]))}</td>`).join("")}</tr>`).join("")
    }</tbody></table>`;
    const showGraph = $("#as-graph").checked && r.elements.length;
    $("#cypher-graph").hidden = !showGraph;
    if (resultCy) { resultCy.destroy(); resultCy = null; }
    if (showGraph) resultCy = drawGraph($("#cypher-graph"), r.elements);
    else if ($("#as-graph").checked) $("#cypher-status").textContent += " · no nodes to draw (return nodes or paths)";
  } catch (err) {
    $("#cypher-status").textContent = "";
    $("#cypher-error").hidden = false;
    $("#cypher-error").textContent = `${err.code ? `${err.code}\n` : ""}${err.message}`;
  }
}

/* ---------- store ---------- */
async function renderStore() {
  const s = await api("/api/store");
  const kb = (s.sizeBytes / 1024).toFixed(0);
  const rows = (list, k) => list.map((x) => `<tr><td>${esc(x[k])}</td><td class="num">${x.n}</td></tr>`).join("");
  $("#store-info").innerHTML = `
    <div><h1>Where the data lives</h1>
      <p class="lede">One Relate file, committed to the repo. The builder writes it and exits; the CLI and this viewer open it read-only, so a fresh clone can query it with no rebuild.</p></div>
    <div class="facts">
      <div class="fact"><span class="eyebrow">Path</span><span class="v">${esc(s.path)}</span></div>
      <div class="fact"><span class="eyebrow">Mode</span><span class="v">${esc(s.mode)}</span></div>
      <div class="fact"><span class="eyebrow">Size</span><span class="v">${kb} KB</span></div>
      <div class="fact"><span class="eyebrow">Opened</span><span class="v">${s.readOnly ? "read-only" : "writable"}</span></div>
      <div class="fact"><span class="eyebrow">Snapshots</span><span class="v">${esc((s.meta?.snapshots ?? []).join(", "))}</span></div>
      <div class="fact"><span class="eyebrow">Fingerprint</span><span class="v">${esc((s.meta?.fingerprint ?? "").slice(0, 12))}</span></div>
      <div class="fact"><span class="eyebrow">Built</span><span class="v">${esc((s.meta?.builtAt ?? "").replace("T", " ").slice(0, 16))} UTC</span></div>
      <div class="fact"><span class="eyebrow">Tool</span><span class="v">contract-drift ${esc(s.meta?.toolVersion ?? "")}</span></div>
    </div>
    <div class="counts">
      <div><h2 class="eyebrow">Node labels</h2><table><thead><tr><th>Label</th><th>Count</th></tr></thead><tbody>${rows(s.labels, "label")}</tbody></table></div>
      <div><h2 class="eyebrow">Relationship types</h2><table><thead><tr><th>Type</th><th>Count</th></tr></thead><tbody>${rows(s.relationships, "type")}</tbody></table></div>
    </div>
    <div class="cmd"><h2 class="eyebrow">Same store from the terminal</h2>
      <pre>npm run cypher -- --preset impact-paths</pre>
      <h2 class="eyebrow">Or with the optional Relate CLI</h2>
      <pre>${esc(s.relateCli)}</pre></div>`;
}

/* ---------- tabs and keys ---------- */
const loaded = { cypher: false, store: false };
async function showView(name) {
  document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.view === name)));
  document.querySelectorAll(".view").forEach((v) => (v.hidden = v.id !== `view-${name}`));
  if (name === "cypher" && !loaded.cypher) { loaded.cypher = true; await initCypher(); }
  if (name === "store" && !loaded.store) { loaded.store = true; await renderStore(); }
  if (name === "review" && state.cy) state.cy.resize();
  history.replaceState(null, "", name === "review" ? location.pathname : `#${name}`);
}

document.addEventListener("click", (e) => {
  const t = e.target.closest("button, .entry");
  if (!t) return;
  if (t.dataset.view) showView(t.dataset.view);
  else if (t.dataset.pr) selectReview(Number(t.dataset.pr));
  else if (t.dataset.drift) selectDrift(t.dataset.drift);
  else if (t.dataset.preset) {
    const p = presets[Number(t.dataset.preset)];
    document.querySelectorAll("#presets button").forEach((b) => b.setAttribute("aria-pressed", String(b === t)));
    $("#query").value = p.cypher;
    $("#as-graph").checked = p.name === "head-graph";
    runQuery();
  } else if (t.id === "run") runQuery();
  else if (t.classList.contains("entry")) setActive(Number(t.dataset.i));
});
$("#entries").addEventListener("mouseover", (e) => {
  const t = e.target.closest(".entry");
  if (t && Number(t.dataset.i) !== state.active) setActive(Number(t.dataset.i));
});
$("#entries").addEventListener("focusin", (e) => {
  const t = e.target.closest(".entry");
  if (t && Number(t.dataset.i) !== state.active) setActive(Number(t.dataset.i));
});
$("#as-graph").addEventListener("change", runQuery);
document.addEventListener("keydown", (e) => {
  const typing = e.target.matches("textarea, input");
  if (typing && e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); runQuery(); return; }
  if (typing) return;
  if (e.key === "j") setActive(state.active + 1, { scroll: true });
  else if (e.key === "k") setActive(state.active - 1, { scroll: true });
  else if (e.key === "/") { e.preventDefault(); showView("cypher").then(() => $("#query").focus()); }
});

async function main() {
  try {
    const { reviews } = await api("/api/reviews");
    state.reviews = reviews;
    selectReview(0);
  } catch (err) {
    const b = $("#banner");
    b.hidden = false;
    b.innerHTML = `The Relate store could not be opened: ${esc(err.message)}. ${esc(err.hint || "")} Run <code>npm run build:graph</code>, then <code>npm run viewer</code>.`;
  }
  const hash = location.hash.slice(1);
  if (hash === "cypher" || hash === "store") showView(hash);
}
main();
