/* Shared helpers for every page. Vanilla JS, no dependencies. */
const CP = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  async function api(path, body) {
    const opt = body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
    let res;
    try { res = await fetch(path, opt); } catch { throw new Error("Cannot reach the local server. Is server.py running?"); }
    let data = null;
    try { data = await res.json(); } catch { /* non-JSON */ }
    if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
    return data;
  }

  const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  function toast(msg, kind = "") {
    let host = $(".toast-host");
    if (!host) { host = document.createElement("div"); host.className = "toast-host"; document.body.append(host); }
    const el = document.createElement("div");
    el.className = "toast " + kind; el.textContent = msg; host.append(el);
    setTimeout(() => el.remove(), kind === "err" ? 5000 : 2200);
  }

  const STATUS_LABEL = { not_started: "Not started", attempted: "Attempted", review: "Review", solved: "Solved" };
  const platName = (p) => (p === "codeforces" ? "Codeforces" : p === "leetcode" ? "LeetCode" : p);
  const platformBadge = (p) => `<span class="badge b-${esc(p)}">${platName(p)}</span>`;
  const statusBadge = (s) => `<span class="badge s-${esc(s)}">${STATUS_LABEL[s] || esc(s)}</span>`;
  function levelBadge(p) {
    if (p.platform === "codeforces") return p.rating ? `<span class="badge b-${p.tier || ""}" title="Codeforces rating">${p.rating}</span>` : `<span class="badge">unrated</span>`;
    return p.tier ? `<span class="badge b-${p.tier}">${p.tier}</span>` : `<span class="badge">-</span>`;
  }
  const shortId = (id) => id.split(":")[1] || id;

  function ago(iso) {
    if (!iso) return "never";
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return "just now";
    if (s < 3600) return Math.floor(s / 60) + " min ago";
    if (s < 86400) return Math.floor(s / 3600) + " h ago";
    if (s < 86400 * 30) return Math.floor(s / 86400) + " d ago";
    return new Date(iso).toLocaleDateString();
  }
  const clock = (sec) => { sec = Math.max(0, Math.floor(sec)); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":"); };
  const nf = (n) => Number(n || 0).toLocaleString();

  /* Statement text -> safe HTML. Converts Codeforces $$$ math to inline code. */
  const TEX = [[/\\le(?:q)?\b/g, "≤"], [/\\ge(?:q)?\b/g, "≥"], [/\\ne(?:q)?\b/g, "≠"], [/\\cdot/g, "·"], [/\\times/g, "×"],
    [/\\ldots|\\dots|\\cdots/g, "…"], [/\\oplus/g, "⊕"], [/\\sum/g, "Σ"], [/\\rightarrow|\\to/g, "→"], [/\\max/g, "max"], [/\\min/g, "min"],
    [/\\gcd/g, "gcd"], [/\\lfloor/g, "⌊"], [/\\rfloor/g, "⌋"], [/\\lceil/g, "⌈"], [/\\rceil/g, "⌉"], [/\\bmod|\\mod/g, "mod"],
    [/\\text\{([^}]*)\}|\\mathrm\{([^}]*)\}/g, (_, a, b) => a || b], [/\\[{}]/g, (m) => m[1]], [/\\ /g, " "], [/\\(?=[a-z]+)/g, ""]];
  function tex(s) { for (const [re, rep] of TEX) s = s.replace(re, rep); return s.replace(/\{|\}/g, ""); }
  function fmtText(text) {
    if (!text) return "";
    const parts = String(text).split(/\$\$\$/);
    let out = "";
    parts.forEach((part, i) => { out += i % 2 ? `<code class="m">${esc(tex(part))}</code>` : esc(part); });
    return out;
  }

  /* ---------- overlays ---------- */
  function overlay(id, html, cls = "") {
    let el = document.getElementById(id);
    if (!el) { el = document.createElement("div"); el.id = id; el.className = "overlay"; document.body.append(el); el.addEventListener("mousedown", (e) => { if (e.target === el) closeOverlays(); }); }
    el.innerHTML = `<div class="modal ${cls}" role="dialog" aria-modal="true">${html}</div>`;
    el.classList.add("open"); return el;
  }
  function closeOverlays() { $$(".overlay.open").forEach((o) => o.classList.remove("open")); }

  const SHORTCUTS = [["Run examples", ["Ctrl", "Enter"]], ["Save code locally", ["Ctrl", "S"]], ["Focus search", ["/"]], ["Close dialog", ["Esc"]], ["Shortcut help", ["?"]]];
  function showHelp() {
    overlay("help-overlay", `<div class="modal-head"><h2>Keyboard shortcuts</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>` +
      SHORTCUTS.map(([n, k]) => `<div class="sc-row"><span>${n}</span><span>${k.map((x) => `<kbd>${x}</kbd>`).join("")}</span></div>`).join("") +
      `<p class="faint" style="margin:14px 0 0;font-size:12.5px">In the editor: <kbd>Tab</kbd> indents (also whole selections), <kbd>Shift</kbd>+<kbd>Tab</kbd> outdents, <kbd>Enter</kbd> keeps indentation.</p>`);
  }

  const handlers = {};
  const on = (name, fn) => { handlers[name] = fn; };
  const typing = () => { const a = document.activeElement; return a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || a.isContentEditable); };

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { if ($(".overlay.open")) { closeOverlays(); e.preventDefault(); } else if (handlers.escape) handlers.escape(e); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { if (handlers.run) { e.preventDefault(); handlers.run(); } return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); if (handlers.save) handlers.save(); return; }
    if (typing() || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "/") { const s = $("[data-search]"); if (s) { e.preventDefault(); s.focus(); s.select(); } }
    else if (e.key === "?") { e.preventDefault(); showHelp(); }
  });
  document.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeOverlays(); });

  /* ---------- nav ---------- */
  const LINKS = [["home", "/", "Dashboard"], ["problems", "/problems.html", "Problems"], ["topics", "/topics.html", "Topics"], ["practice", "/practice.html", "Practice"],
    ["contests", "/contests.html", "Contests"], ["review", "/review.html", "Review"]];
  function nav() {
    const host = document.getElementById("nav"); if (!host) return;
    const page = document.body.dataset.page;
    host.className = "nav";
    host.innerHTML = `<a class="brand" href="/"><span class="brand-mark">CP</span>CP Offline</a>
      <nav class="nav-links" aria-label="Main">${LINKS.map(([k, h, t]) => `<a href="${h}" class="${k === page ? "active" : ""}">${t}</a>`).join("")}</nav>
      <span class="nav-spacer"></span><a class="nav-live" id="nav-live" href="#"><i class="dot"></i><span>--:--:--</span></a>
      <button class="icon-btn" id="theme-btn" title="Toggle theme" aria-label="Toggle theme">◐</button>
      <button class="icon-btn" id="help-btn" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">?</button>`;
    $("#help-btn").onclick = showHelp;
    $("#theme-btn").onclick = () => {
      const cur = document.documentElement.dataset.theme === "light" ? "dark" : "light";
      document.documentElement.dataset.theme = cur; try { localStorage.setItem("cp-offline-theme", cur); } catch { /* ignore */ }
    };
    api("/api/contests/active").then(({ active }) => {
      if (!active) return;
      const el = $("#nav-live"); el.href = "/contest.html?id=" + active.id; el.classList.add("on");
      const end = Date.now() + active.remaining_seconds * 1000;
      const tick = () => { const left = (end - Date.now()) / 1000; if (left <= 0) { el.classList.remove("on"); return; } $("span", el).textContent = "LIVE " + clock(left); setTimeout(tick, 1000); };
      tick();
    }).catch(() => {});
  }
  document.addEventListener("DOMContentLoaded", nav);

  /* ---------- shared problem list ---------- */
  function problemRows(items) {
    return items.map((p) => `<a class="prow" href="/problem.html?id=${encodeURIComponent(p.id)}">
      <span class="pid">${esc(shortId(p.id))}</span>
      <span class="ptitle">${esc(p.title)}<span class="ptags">${esc(p.tags.slice(0, 5).join(" · "))}</span></span>
      <span>${platformBadge(p.platform)}</span><span>${levelBadge(p)}${p.attempts ? ` <span class="faint mono" title="Attempts" style="font-size:11.5px">×${p.attempts}</span>` : ""}</span>
      <span>${statusBadge(p.status)}</span></a>`).join("");
  }
  const tableHead = `<div class="prow head"><span>ID</span><span>Title</span><span>Platform</span><span>Level</span><span>Status</span></div>`;

  return { $, $$, esc, api, debounce, toast, platformBadge, statusBadge, levelBadge, shortId, ago, clock, nf, fmtText, overlay, closeOverlays, on, showHelp, problemRows, tableHead, STATUS_LABEL, platName };
})();
