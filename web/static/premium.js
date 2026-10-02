/* CP Offline - premium layer. Loaded after common.js. Purely additive: reads the DOM that the
   existing pages render and decorates it, so local edits to page scripts keep working. */
(() => {
  if (typeof CP === "undefined" || window.__cpPremium) return;
  window.__cpPremium = true;
  const { $, $$, esc, api, toast, debounce, overlay, platformBadge, levelBadge } = CP;
  const path = location.pathname;
  const onProblem = path.endsWith("/problem.html");
  const pid = new URLSearchParams(location.search).get("id");
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } } };

  const whenEl = (sel, cb, ms = 20000) => {
    const f = $(sel); if (f) return cb(f);
    const mo = new MutationObserver(() => { const e = $(sel); if (e) { mo.disconnect(); cb(e); } });
    mo.observe(document.body, { childList: true, subtree: true }); setTimeout(() => mo.disconnect(), ms);
  };
  const go = (u) => { location.href = u; };

  /* ---------- shared actions ---------- */
  async function randomGo(q) {
    try { const r = await api("/api/random" + (q ? "?" + q : "")); go("/problem.html?id=" + encodeURIComponent(r.id)); }
    catch (e) { toast(e.message, "err"); }
  }
  async function downloadBackup() {
    try {
      const d = await api("/api/export");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }));
      a.download = "cp-offline-backup-" + new Date().toISOString().slice(0, 10) + ".json";
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1500);
      toast("Backup downloaded", "ok");
    } catch (e) { toast(e.message, "err"); }
  }
  const toggleFocus = () => { const ide = $(".ide"); if (ide) ide.classList.toggle("focus"); };
  let bm = false;
  function paintStar() { const b = $("#pm-star"); if (b) { b.classList.toggle("on", bm); b.textContent = bm ? "★ Saved" : "☆ Save"; } }
  async function toggleBookmark() {
    if (!pid) return;
    try { const r = await api("/api/bookmarks", { problem_id: pid, on: !bm }); bm = r.on; paintStar(); toast(bm ? "Saved to bookmarks" : "Removed from bookmarks", "ok"); }
    catch (e) { toast(e.message, "err"); }
  }

  /* ---------- nav additions ---------- */
  whenEl(".nav-links", (nl) => {
    [["analytics", "/analytics.html", "Analytics"], ["saved", "/saved.html", "Saved"]].forEach(([k, h, t]) => {
      if ($(`.nav-links a[href="${h}"]`)) return;
      const a = document.createElement("a"); a.href = h; a.textContent = t;
      if (document.body.dataset.page === k) a.classList.add("active");
      nl.append(a);
    });
    const tb = $("#theme-btn");
    if (tb && !$(".kbtn")) {
      const b = document.createElement("button"); b.className = "kbtn"; b.setAttribute("aria-label", "Open command palette");
      b.innerHTML = `<span>Search or jump to…</span><kbd>Ctrl K</kbd>`; b.onclick = openPalette; tb.before(b);
    }
  });

  /* ---------- command palette ---------- */
  const PAGES = [["Dashboard", "/", "▦", "g d"], ["Problems", "/problems.html", "☰", "g p"], ["Topics", "/topics.html", "◈", "g t"], ["Practice", "/practice.html", "◎", "g r"],
    ["Contests", "/contests.html", "⏱", "g c"], ["Review queue", "/review.html", "⟳", "g v"], ["Analytics", "/analytics.html", "▲", "g a"], ["Saved problems", "/saved.html", "★", "g s"]];
  const ACTIONS = () => {
    const a = [
      { t: "Random unsolved problem", i: "⚄", run: () => randomGo("") },
      { t: "Random Codeforces problem (unsolved)", i: "⚄", run: () => randomGo("platform=codeforces") },
      { t: "Random LeetCode problem (unsolved)", i: "⚄", run: () => randomGo("platform=leetcode") },
      { t: "Random problem from review queue", i: "⚄", run: () => randomGo("status=review") },
      { t: "Toggle light / dark theme", i: "◐", run: () => $("#theme-btn") && $("#theme-btn").click() },
      { t: "Keyboard shortcuts", i: "?", hint: "?", run: () => CP.showHelp() },
      { t: "Download backup (JSON)", i: "⇩", run: downloadBackup },
    ];
    if (onProblem) a.unshift({ t: "Toggle focus mode (hide statement)", i: "⤢", hint: "f", run: toggleFocus }, { t: "Bookmark / unbookmark this problem", i: "★", hint: "b", run: toggleBookmark });
    return a;
  };
  let sel = 0, rows = [], remote = [], rseq = 0;
  function build(query) {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const hit = (t) => words.every((w) => t.toLowerCase().includes(w));
    const out = [];
    PAGES.filter(([t]) => hit(t)).forEach(([t, u, i, h]) => out.push({ g: "Go to", t, i, hint: h, run: () => go(u) }));
    ACTIONS().filter((a) => hit(a.t)).forEach((a) => out.push({ g: "Actions", ...a }));
    remote.forEach((p) => out.push({ g: "Problems", t: p.title, i: p.platform === "codeforces" ? "CF" : "LC", hint: CP.shortId(p.id) + " · " + (p.platform === "codeforces" ? (p.rating || "unrated") : p.tier), run: () => go("/problem.html?id=" + encodeURIComponent(p.id)) }));
    return out;
  }
  function paint() {
    const list = $("#cmdk-list"); if (!list) return;
    if (!rows.length) { list.innerHTML = `<div class="empty">No results</div>`; return; }
    let last = "", html = "";
    rows.forEach((r, n) => {
      if (r.g !== last) { html += `<div class="cmdk-group">${r.g}</div>`; last = r.g; }
      html += `<div class="cmdk-item ${n === sel ? "sel" : ""}" data-n="${n}"><span class="ico">${esc(r.i)}</span><span class="grow">${esc(r.t)}</span><span class="hint">${esc(r.hint || "")}</span></div>`;
    });
    list.innerHTML = html;
    const s = $(".cmdk-item.sel", list); if (s) s.scrollIntoView({ block: "nearest" });
  }
  const fetchRemote = debounce(async (query) => {
    const my = ++rseq;
    if (query.trim().length < 2) { remote = []; rows = build(query); return paint(); }
    try { const d = await api("/api/problems?limit=8&search=" + encodeURIComponent(query.trim())); if (my !== rseq) return; remote = d.items; }
    catch { remote = []; }
    const q = $("#cmdk-q"); rows = build(q ? q.value : ""); sel = Math.min(sel, Math.max(0, rows.length - 1)); paint();
  }, 160);
  function openPalette() {
    overlay("cmdk", `<div class="cmdk-in"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input id="cmdk-q" placeholder="Search problems, jump to a page, run a command…" autocomplete="off" spellcheck="false" aria-label="Command palette"><kbd>Esc</kbd></div>
      <div class="cmdk-list" id="cmdk-list" role="listbox"></div><div class="cmdk-foot"><span><kbd>↑</kbd> <kbd>↓</kbd> move</span><span><kbd>Enter</kbd> select</span><span><kbd>Esc</kbd> close</span></div>`, "cmdk");
    sel = 0; remote = []; rows = build(""); paint();
    const q = $("#cmdk-q"); q.focus();
    q.addEventListener("input", () => { sel = 0; rows = build(q.value); paint(); fetchRemote(q.value); });
    q.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); sel = (sel + 1) % Math.max(1, rows.length); paint(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); sel = (sel - 1 + rows.length) % Math.max(1, rows.length); paint(); }
      else if (e.key === "Enter") { e.preventDefault(); const r = rows[sel]; if (r) { CP.closeOverlays(); r.run(); } }
    });
    $("#cmdk-list").addEventListener("click", (e) => { const it = e.target.closest("[data-n]"); if (it) { const r = rows[+it.dataset.n]; CP.closeOverlays(); r.run(); } });
    $("#cmdk-list").addEventListener("mousemove", (e) => { const it = e.target.closest("[data-n]"); if (it && +it.dataset.n !== sel) { sel = +it.dataset.n; $$(".cmdk-item").forEach((x) => x.classList.toggle("sel", x === it)); } });
  }
  document.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); e.stopPropagation(); openPalette(); } }, true);

  /* ---------- g-prefixed navigation + problem hotkeys ---------- */
  let gAt = 0;
  const MAP = { d: "/", p: "/problems.html", t: "/topics.html", r: "/practice.html", c: "/contests.html", v: "/review.html", a: "/analytics.html", s: "/saved.html" };
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || $(".overlay.open")) return;
    const a = document.activeElement;
    if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return;
    const k = e.key.toLowerCase();
    if (gAt && Date.now() - gAt < 1200) { gAt = 0; if (MAP[k]) { e.preventDefault(); go(MAP[k]); } return; }
    if (k === "g") { gAt = Date.now(); return; }
    if (onProblem && k === "f") { e.preventDefault(); toggleFocus(); }
    if (onProblem && k === "b") { e.preventDefault(); toggleBookmark(); }
  });
  const EXTRA = [["Command palette", ["Ctrl", "K"]], ["Go to page", ["g", "then d p t r c v a s"]], ["Focus mode (problem page)", ["f"]], ["Bookmark problem", ["b"]]];
  new MutationObserver(() => {
    const m = $("#help-overlay.open .modal");
    if (m && !m.querySelector(".pm-extra")) {
      const d = document.createElement("div"); d.className = "pm-extra";
      d.innerHTML = EXTRA.map(([n, k]) => `<div class="sc-row"><span>${n}</span><span>${k.map((x) => `<kbd>${x}</kbd>`).join("")}</span></div>`).join("");
      const p = m.querySelector("p"); p ? p.before(d) : m.append(d);
    }
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });

  /* ---------- reusable chart helpers (also used by analytics.js) ---------- */
  function heatHtml(heat) {
    if (!heat || !heat.length) return "";
    const first = new Date(heat[0].day + "T00:00:00"), pad = (first.getDay() + 6) % 7;
    const lvl = (n) => (n === 0 ? "" : n === 1 ? "l1" : n <= 3 ? "l2" : n <= 6 ? "l3" : "l4");
    const cells = Array.from({ length: pad }, () => `<i class="pad"></i>`).join("") + heat.map((h, i) =>
      `<i class="${lvl(h.count)} ${i === heat.length - 1 ? "today" : ""}" title="${h.day}: ${h.count} ${h.count === 1 ? "activity" : "activities"}"></i>`).join("");
    return `<div class="heat-wrap"><div class="heat" aria-label="Activity heatmap, last 26 weeks">${cells}</div></div>
      <div class="legend mt">Less <i style="background:var(--raised)"></i><i style="background:color-mix(in srgb,var(--green) 28%,var(--raised))"></i><i style="background:color-mix(in srgb,var(--green) 52%,var(--raised))"></i><i style="background:color-mix(in srgb,var(--green) 78%,var(--raised))"></i><i style="background:var(--green)"></i> More
      <span class="grow"></span><span>submissions + solves per day</span></div>`;
  }
  CP.pm = { heatHtml, downloadBackup, randomGo };

  /* ---------- dashboard ---------- */
  if (path === "/" || path.endsWith("/index.html")) {
    whenEl("#root .g6", async (row) => {
      countUp();
      try {
        const [an, st] = await Promise.all([api("/api/analytics"), api("/api/stats")]);
        let goal = Math.min(20, Math.max(1, parseInt(ls.get("cp-offline-goal"), 10) || 3));
        const section = document.createElement("div"); section.className = "split mb";
        const active = an.heat.filter((h) => h.count).length;
        section.innerHTML = `<div class="card"><div class="card-head"><h2>Activity</h2><span class="sub">${active} active day${active === 1 ? "" : "s"} in 26 weeks · <a href="/analytics.html">Analytics →</a></span></div>${heatHtml(an.heat)}</div>
          <div class="card"><div class="card-head"><h2>Daily goal</h2><span class="sub">problems solved today</span></div>
          <div class="row" style="gap:20px"><div class="goal-ring" id="goal-ring"></div><div class="grow"><div id="goal-msg" class="muted" style="margin-bottom:10px"></div>
          <div class="seg"><button id="g-dec" aria-label="Decrease goal">−</button><button id="g-val" disabled style="min-width:70px;color:var(--text)"></button><button id="g-inc" aria-label="Increase goal">+</button></div></div></div></div>`;
        row.after(section);
        const paint = () => {
          const done = st.solved_today, ring = $("#goal-ring");
          ring.style.setProperty("--p", Math.min(100, 100 * done / goal)); ring.dataset.label = `${done}/${goal}`; ring.classList.toggle("done", done >= goal);
          $("#goal-msg").textContent = done >= goal ? "Goal reached for today. Anything more is a bonus." : `${goal - done} more to hit today's goal.`;
          $("#g-val").textContent = goal + " / day";
        };
        $("#g-dec").onclick = () => { goal = Math.max(1, goal - 1); ls.set("cp-offline-goal", goal); paint(); };
        $("#g-inc").onclick = () => { goal = Math.min(20, goal + 1); ls.set("cp-offline-goal", goal); paint(); };
        paint();
      } catch { /* dashboard still fully works without the extras */ }
    });
  }
  function countUp() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    $$(".stat b").forEach((b) => {
      if (b.dataset.cu) return; b.dataset.cu = "1";
      const txt = b.textContent.trim(); if (!/^[\d,]+$/.test(txt)) return;
      const n = parseInt(txt.replace(/,/g, ""), 10); if (n < 2) return;
      const t0 = performance.now();
      const step = (t) => { const p = Math.min(1, (t - t0) / 650); b.textContent = Math.round(n * (1 - Math.pow(1 - p, 3))).toLocaleString(); p < 1 ? requestAnimationFrame(step) : (b.textContent = txt); };
      requestAnimationFrame(step);
    });
  }

  /* ---------- problems browser: random from current filters ---------- */
  if (path.endsWith("/problems.html")) {
    whenEl("#reset", (btn) => {
      const b = document.createElement("button"); b.className = "btn"; b.textContent = "⚄ Random from filters";
      b.onclick = () => {
        const u = new URLSearchParams(location.search), q = new URLSearchParams();
        ["platform", "tier", "status", "tag", "min_rating", "max_rating"].forEach((k) => u.get(k) && q.set(k, u.get(k)));
        randomGo(q.toString());
      };
      btn.before(b);
    });
  }

  /* ---------- problem page extras ---------- */
  if (onProblem) {
    let fs = parseFloat(ls.get("cp-offline-fs")) || 13.5;
    const applyFs = () => { fs = Math.min(20, Math.max(11, fs)); document.documentElement.style.setProperty("--editor-fs", fs + "px"); ls.set("cp-offline-fs", fs); };
    applyFs();
    whenEl(".ide .toolbar", (toolbar) => {
      const bar = document.createElement("div"); bar.className = "toolbar"; bar.style.cssText = "padding:6px 12px;border-top:0";
      bar.innerHTML = `<button class="btn sm sw" id="pm-sw" title="Time on this problem this visit. Click to pause or resume.">⏱ 00:00</button>
        <span class="seg"><button id="fs-dec" title="Smaller font" aria-label="Smaller font">A−</button><button id="fs-inc" title="Larger font" aria-label="Larger font">A+</button></span>
        <button class="btn sm" id="pm-focus" title="Hide the statement (f)">⤢ Focus</button><span class="grow"></span><span class="faint mono" id="pm-pos" style="font-size:12px">Ln 1, Col 1</span>`;
      toolbar.after(bar);
      let run = true, acc = 0, t0 = Date.now();
      const sw = $("#pm-sw");
      const show = () => { const s = Math.floor((acc + (run ? Date.now() - t0 : 0)) / 1000); sw.textContent = `${run ? "⏱" : "⏸"} ${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
      sw.onclick = () => { if (run) { acc += Date.now() - t0; run = false; } else { t0 = Date.now(); run = true; } show(); };
      setInterval(show, 1000);
      $("#fs-dec").onclick = () => { fs -= 1; applyFs(); }; $("#fs-inc").onclick = () => { fs += 1; applyFs(); };
      $("#pm-focus").onclick = toggleFocus;
      whenEl("#code", (code) => {
        const pos = () => { const v = code.value.slice(0, code.selectionStart), lines = v.split("\n"); $("#pm-pos").textContent = `Ln ${lines.length}, Col ${lines[lines.length - 1].length + 1}`; };
        ["keyup", "click", "input", "focus"].forEach((ev) => code.addEventListener(ev, pos));
      });
    });
    whenEl("#progress-actions", (pa) => {
      const star = document.createElement("button"); star.className = "btn star"; star.id = "pm-star"; star.textContent = "☆ Save"; star.title = "Bookmark (b)"; star.onclick = toggleBookmark;
      pa.prepend(star);
      if (!new URLSearchParams(location.search).get("contest")) {
        const plat = $(".meta .b-leetcode") ? "leetcode" : "codeforces";
        const nx = document.createElement("button"); nx.className = "btn"; nx.textContent = "Next random ⟶"; nx.title = "Another unsolved " + plat + " problem"; nx.onclick = () => randomGo("platform=" + plat);
        pa.append(nx);
      }
      api("/api/bookmarks").then((r) => { bm = r.ids.includes(pid); paintStar(); }).catch(() => {});
    });
  }
})();
