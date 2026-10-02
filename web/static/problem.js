(async () => {
  const { $, $$, esc, api, toast, platformBadge, levelBadge, statusBadge, fmtText, overlay, ago, clock, on } = CP;
  const q = new URLSearchParams(location.search);
  const paras = (t) => String(t).split(/\n{2,}/).map((x) => `<p>${fmtText(x)}</p>`).join("");
  const id = q.get("id"), contestId = q.get("contest");
  const root = $("#root");
  const fail = (m) => { root.innerHTML = `<div class="card errbox">${esc(m)}<div class="mt"><a class="btn" href="/problems.html">Back to problems</a></div></div>`; };
  if (!id) return fail("No problem specified.");
  let p;
  try { p = await api("/api/problems/" + encodeURIComponent(id)); } catch (e) { return fail(e.message); }
  document.title = `${p.title} · CP Offline`;

  const isLC = p.platform === "leetcode";
  let lang = "python", busy = false, lastRun = null;
  try { lang = localStorage.getItem("cp-offline-lang") || p.language || "python"; } catch { lang = p.language || "python"; }
  if (!["python", "cpp"].includes(lang)) lang = "python";
  const key = (l) => `cp-offline-${p.id}:${l}`;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* quota/private mode */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  };

  /* ---------------- templates ---------------- */
  function lcArgNames() {
    const t = (p.examples[0] && p.examples[0].example_text) || "";
    const line = (t.split("Input:")[1] || "").split("Output:")[0];
    const names = []; const re = /(?:^|[\s,])([A-Za-z_]\w*)\s*=/g; let m;
    while ((m = re.exec(line))) if (!names.includes(m[1])) names.push(m[1]);
    return names;
  }
  function template(l) {
    if (isLC) {
      if (l === "python") return `from typing import List, Optional\n\n# ListNode and TreeNode are provided by the local runner.\n# Name the method as on LeetCode; the first public method of Solution is called.\nclass Solution:\n    def solve(self${lcArgNames().map((n) => ", " + n).join("")}):\n        pass\n`;
      return `// LeetCode-style problems have no stdin format, so examples cannot be auto-tested in C++.\n// You can still compile and run with Custom Input.\n#include <bits/stdc++.h>\nusing namespace std;\n\nclass Solution {\npublic:\n    // TODO\n};\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    return 0;\n}\n`;
    }
    if (l === "python") return `import sys\n\n\ndef main():\n    data = sys.stdin.read().split()\n    # TODO\n\n\nmain()\n`;
    return `#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    // TODO\n    return 0;\n}\n`;
  }

  /* ---------------- layout ---------------- */
  const levelTxt = p.platform === "codeforces" ? (p.rating ? `Rating ${p.rating}` : "Unrated") : p.tier;
  root.innerHTML = `
  <div class="row mb" style="align-items:flex-start;justify-content:space-between">
    <div class="grow" style="min-width:260px">
      <div class="meta">${platformBadge(p.platform)}<span class="badge mono">${esc(CP.shortId(p.id))}</span>${levelBadge(p)}<span id="status-badge">${statusBadge(p.status)}</span>
        <span class="faint" id="attempts-info"></span>
        ${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" class="badge">Source ↗</a>` : ""}</div>
      <h1 class="ptitle-h" style="margin:0">${esc(p.title)}</h1>
      ${p.tags.length ? `<div class="tags mt">${p.tags.map((t) => `<a class="tag" href="/problems.html?platform=${p.platform}&tag=${encodeURIComponent(t.toLowerCase())}">${esc(t)}</a>`).join("")}</div>` : ""}
    </div>
    <div class="row" id="progress-actions">
      <button class="btn good" data-status="solved">✓ Mark Solved</button>
      <button class="btn warn" data-status="review">⟳ Mark Review</button>
      <button class="btn" data-status="attempted">Mark Attempted</button>
    </div>
  </div>
  <div class="ide">
    <section class="pane">
      <div class="pane-tabs" role="tablist"><button class="on" data-tab="statement">Statement</button><button data-tab="notes">My Notes</button><button data-tab="history">Submissions <span class="faint" id="sub-count">${p.submission_count || ""}</span></button></div>
      <div class="pane-body scroll" id="tab-statement"></div>
      <div class="pane-body scroll hidden" id="tab-notes"></div>
      <div class="pane-body scroll hidden" id="tab-history"></div>
    </section>
    <section class="pane">
      <div class="toolbar">
        <select id="lang" aria-label="Language"><option value="python">Python 3</option><option value="cpp">C++17</option></select>
        <button class="btn primary" id="run" title="Ctrl+Enter">▶ Run Examples</button>
        <button class="btn" id="submit" title="Run examples and record the attempt in your history">Submit / Test</button>
        <button class="btn" id="custom-toggle">Custom Input</button>
        <span class="grow"></span>
        <button class="btn sm" id="save" title="Ctrl+S">Save</button>
        <button class="btn sm" id="clear">Clear</button>
        <button class="btn sm" id="reset-code">Reset Code</button>
      </div>
      <div class="editor"><div class="gutter" id="gutter">1</div><textarea id="code" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" aria-label="Code editor"></textarea></div>
      <div class="custom-in hidden" id="custom-wrap"><div class="eyebrow" style="padding:10px 0 6px">Custom input (stdin)</div><textarea id="stdin" placeholder="Type or paste input, then press Run on custom input"></textarea>
        <div class="row" style="margin-top:8px"><button class="btn sm primary" id="run-custom">Run with custom input</button></div></div>
      <div class="console"><div class="console-head"><span class="eyebrow">Console</span><span id="verdict"></span><span class="grow"></span><span class="faint" id="run-meta"></span></div>
        <div id="console"><pre class="out faint">Press Ctrl+Enter to run the examples.</pre></div></div>
    </section>
  </div>`;

  /* ---------------- statement ---------------- */
  function sampleBlock(n, input, output) {
    return `<div class="sample"><div class="sh"><span>Example ${n}</span><span><button class="copy" data-use="${n - 1}">use as custom input</button></span></div>
      <div class="sp"><div class="sh" style="background:none;padding-bottom:0">Input <button class="copy" data-copy="in-${n - 1}">copy</button></div><pre id="in-${n - 1}">${esc(input)}</pre></div>
      <div class="sp"><div class="sh" style="background:none;padding-bottom:0">Output <button class="copy" data-copy="out-${n - 1}">copy</button></div><pre id="out-${n - 1}">${esc(output)}</pre></div></div>`;
  }
  function renderStatement() {
    let html = "";
    if (isLC) {
      let text = p.statement || "";
      const ci = text.indexOf("Constraints:");
      const constraints = ci >= 0 ? text.slice(ci + 12).trim() : "";
      text = (ci >= 0 ? text.slice(0, ci) : text).replace(/^Example \d+:\s*$/gm, "").trim();
      html += text ? paras(text) : `<p class="faint">Statement text is not available offline.</p>`;
      if (p.examples.length) {
        html += `<h3>Examples</h3>` + p.examples.map((e, i) => {
          const t = String(e.example_text || "");
          const [inp, rest] = t.includes("Output:") ? [t.split("Output:")[0].replace(/^\s*Input:\s*/, ""), t.split("Output:").slice(1).join("Output:")] : [t, ""];
          const [out, expl] = rest.split(/\n\s*Explanation:?/);
          return `<div class="sample"><div class="sh"><span>Example ${i + 1}</span></div>
            <div class="sp"><div class="sh" style="background:none;padding-bottom:0">Input</div><pre>${esc(inp.trim())}</pre></div>
            ${rest ? `<div class="sp"><div class="sh" style="background:none;padding-bottom:0">Output</div><pre>${esc((out || "").trim())}</pre></div>` : ""}
            ${expl ? `<div class="sp"><div class="sh" style="background:none;padding-bottom:0">Explanation</div><pre>${esc(expl.trim())}</pre></div>` : ""}</div>`;
        }).join("");
      }
      html += `<h3>Constraints</h3>` + (constraints ? `<p>${fmtText(constraints)}</p>` : `<p class="faint">Constraints are not stored for this problem in the offline dataset${p.url ? " - see the source link" : ""}.</p>`);
    } else {
      if (!p.statement) {
        html += `<div class="empty" style="padding:24px 0;text-align:left"><b>Statement not available offline.</b><br>This problem's text was not imported into the database.${p.url ? ` <a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">Open on Codeforces ↗</a>` : ""}</div>`;
      } else html += paras(p.statement);
      if (p.input_format) html += `<h3>Input</h3>${paras(p.input_format)}`;
      if (p.output_format) html += `<h3>Output</h3>${paras(p.output_format)}`;
      html += `<h3>Examples</h3>` + (p.examples.length ? p.examples.map((e, i) => sampleBlock(i + 1, e.input ?? "", e.output ?? "")).join("") : `<p class="faint">No examples stored for this problem, so Run Examples is unavailable. Use Custom Input.</p>`);
    }
    $("#tab-statement").innerHTML = `<div class="stmt">${html}</div>`;
  }
  renderStatement();

  /* ---------------- progress ---------------- */
  function showProgress(s, attempts) {
    p.status = s; $("#status-badge").innerHTML = statusBadge(s);
    if (attempts !== undefined) p.attempts = attempts;
    $("#attempts-info").textContent = p.attempts ? `${p.attempts} attempt${p.attempts === 1 ? "" : "s"}` : "";
    $$("#progress-actions [data-status]").forEach((b) => b.classList.toggle("on", b.dataset.status === s));
  }
  showProgress(p.status);
  $("#progress-actions").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-status]"); if (!b) return;
    b.disabled = true;
    try { const r = await api("/api/progress", { problem_id: p.id, status: b.dataset.status }); showProgress(r.status, r.attempts); toast("Marked " + CP.STATUS_LABEL[r.status].toLowerCase(), "ok"); }
    catch (err) { toast(err.message, "err"); } finally { b.disabled = false; }
  });

  /* ---------------- editor ---------------- */
  const code = $("#code"), gutter = $("#gutter");
  const updateGutter = () => { const n = code.value.split("\n").length; gutter.textContent = Array.from({ length: n }, (_, i) => i + 1).join("\n"); gutter.scrollTop = code.scrollTop; };
  function loadCode() {
    const saved = store.get(key(lang)); code.value = saved !== null ? saved : template(lang); updateGutter();
  }
  const persist = () => store.set(key(lang), code.value);
  const autosave = CP.debounce(persist, 400);
  code.addEventListener("input", () => { updateGutter(); autosave(); });
  code.addEventListener("scroll", () => { gutter.scrollTop = code.scrollTop; });
  const insert = (text) => { if (!document.execCommand || !document.execCommand("insertText", false, text)) code.setRangeText(text, code.selectionStart, code.selectionEnd, "end"); };
  code.addEventListener("keydown", (e) => {
    const v = code.value, s = code.selectionStart, en = code.selectionEnd, UNIT = "    ";
    if (e.key === "Tab") {
      e.preventDefault();
      const multi = v.slice(s, en).includes("\n");
      if (!multi && !e.shiftKey) return insert(UNIT);
      const ls = v.lastIndexOf("\n", s - 1) + 1; let le = v.indexOf("\n", en); if (le < 0) le = v.length;
      const lines = v.slice(ls, le).split("\n");
      let firstDelta = 0, total = 0;
      const out = lines.map((l, i) => {
        const nl = e.shiftKey ? l.replace(/^( {1,4}|\t)/, "") : UNIT + l;
        const d = nl.length - l.length; if (i === 0) firstDelta = d; total += d; return nl;
      });
      code.setSelectionRange(ls, le); insert(out.join("\n"));
      const ns = Math.max(ls, s + firstDelta), ne = Math.max(ns, en + total);
      code.setSelectionRange(ns, ne); updateGutter();
    } else if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.shiftKey && s === en) {
      const ls = v.lastIndexOf("\n", s - 1) + 1, before = v.slice(ls, s);
      const indent = (before.match(/^[ \t]*/) || [""])[0];
      const extra = /[:{(\[]\s*$/.test(before) ? UNIT : "";
      e.preventDefault(); insert("\n" + indent + extra);
    } else if (e.key === "}" && s === en) {
      const ls = v.lastIndexOf("\n", s - 1) + 1;
      if (/^ +$/.test(v.slice(ls, s)) && v.slice(ls, s).length >= 4) { e.preventDefault(); code.setSelectionRange(s - 4, s); insert("}"); }
    }
  });
  $("#lang").value = lang;
  $("#lang").addEventListener("change", () => { persist(); lang = $("#lang").value; store.set("cp-offline-lang", lang); loadCode(); setConsole(""); });
  loadCode();
  const saveNow = () => { persist(); toast("Saved locally", "ok"); };
  $("#save").onclick = saveNow;
  $("#clear").onclick = () => { code.value = ""; updateGutter(); persist(); code.focus(); };
  $("#reset-code").onclick = () => {
    overlay("confirm", `<div class="modal-head"><h2>Reset code?</h2></div><p class="muted">This replaces your ${lang === "cpp" ? "C++17" : "Python"} code with the starter template. Your submission history is kept.</p>
      <div class="row" style="justify-content:flex-end"><button class="btn" data-close>Cancel</button><button class="btn danger" id="confirm-reset">Reset</button></div>`);
    $("#confirm-reset").onclick = () => { store.del(key(lang)); loadCode(); CP.closeOverlays(); toast("Code reset"); };
  };

  /* ---------------- running ---------------- */
  function setConsole(html) { $("#console").innerHTML = html; }
  const vcls = (v) => "v-" + String(v).replace(/\s+/g, "-");
  function testHtml(t) {
    const bad = t.verdict !== "PASS";
    const blocks = [["Input", t.input], ["Expected", t.expected], ["Your output", t.actual], ["Stderr", t.stderr], ["Printed", t.stdout]].filter(([, v]) => v);
    return `<details class="trow" ${bad ? "open" : ""}><summary><span class="verdict ${vcls(t.verdict)}">${esc(t.verdict)}</span>Example ${t.n}<span class="grow"></span><span class="faint mono" style="font-size:12px">${t.runtime_ms ?? 0} ms</span></summary>
      ${blocks.map(([l, v]) => `<div class="lab">${l}</div><pre>${esc(v)}</pre>`).join("")}${t.note ? `<div class="lab">Note</div><pre>${esc(t.note)}</pre>` : ""}</details>`;
  }
  function renderResult(r) {
    $("#verdict").innerHTML = r.verdict ? `<span class="verdict ${vcls(r.verdict)}">${esc(r.verdict)}</span>` : "";
    $("#run-meta").textContent = r.mode === "custom" ? `${r.runtime_ms ?? 0} ms` : (r.total ? `SAMPLE TEST · ${r.passed}/${r.total} passed · ${r.runtime_ms} ms` : "");
    if (r.mode === "custom") { setConsole(`<pre class="out">${esc(r.output)}</pre>`); return; }
    if (r.verdict === "COMPILE ERROR") { setConsole(`<pre class="out">${esc(r.compile_output || r.output)}</pre>`); return; }
    if (!r.tests || !r.tests.length) { setConsole(`<pre class="out">${esc(r.output || r.error || "")}</pre>`); return; }
    setConsole(`<div class="tests">${r.tests.map(testHtml).join("")}</div>${r.notice ? `<div class="notice">${esc(r.notice)}</div>` : ""}`);
  }
  async function execute(mode) {
    if (busy) return;
    if (!code.value.trim()) { toast("Write some code first", "err"); return; }
    busy = true; persist();
    const btns = $$("#run,#submit,#run-custom"); btns.forEach((b) => (b.disabled = true));
    setConsole(`<pre class="out faint">${mode === "custom" ? "Running…" : lang === "cpp" ? "Compiling and running examples…" : "Running examples…"}</pre>`);
    try {
      const body = { problem_id: p.id, language: lang, code: code.value, mode };
      if (mode === "custom") body.stdin = $("#stdin").value;
      if (mode === "submit" && contestId) body.contest_id = Number(contestId);
      const r = await api("/api/run", body); lastRun = r; renderResult(r);
      if (r.progress) { showProgress(r.progress.status, r.progress.attempts); $("#sub-count").textContent = (Number($("#sub-count").textContent) || 0) + 1; histLoaded = false; }
      if (contestId && mode === "submit") { refreshContest(); if (r.verdict === "PASS") toast("Contest problem solved on samples", "ok"); }
    } catch (e) { setConsole(`<pre class="out" style="color:var(--red)">${esc(e.message)}</pre>`); $("#verdict").innerHTML = ""; }
    finally { busy = false; btns.forEach((b) => (b.disabled = false)); }
  }
  $("#run").onclick = () => execute("examples");
  $("#submit").onclick = () => execute("submit");
  $("#run-custom").onclick = () => execute("custom");
  $("#custom-toggle").onclick = () => { $("#custom-wrap").classList.toggle("hidden"); if (!$("#custom-wrap").classList.contains("hidden")) $("#stdin").focus(); };
  on("run", () => execute("examples")); on("save", () => { saveNow(); if (!$("#tab-notes").classList.contains("hidden")) saveNotes(); });

  document.addEventListener("click", (e) => {
    const c = e.target.closest("[data-copy]");
    if (c) { navigator.clipboard && navigator.clipboard.writeText($("#" + c.dataset.copy).textContent).then(() => toast("Copied")); }
    const u = e.target.closest("[data-use]");
    if (u) { $("#stdin").value = p.examples[u.dataset.use].input ?? ""; $("#custom-wrap").classList.remove("hidden"); toast("Loaded into custom input"); }
  });

  /* ---------------- tabs, notes, history ---------------- */
  let histLoaded = false, notesLoaded = false;
  $$(".pane-tabs [data-tab]").forEach((b) => b.addEventListener("click", () => {
    $$(".pane-tabs button").forEach((x) => x.classList.toggle("on", x === b));
    ["statement", "notes", "history"].forEach((t) => $("#tab-" + t).classList.toggle("hidden", t !== b.dataset.tab));
    if (b.dataset.tab === "notes" && !notesLoaded) renderNotes();
    if (b.dataset.tab === "history" && !histLoaded) loadHistory();
  }));
  const NOTE_FIELDS = [["observation", "Observation"], ["mistake", "Mistake"], ["key_idea", "Key idea"], ["complexity", "Complexity"], ["need_review", "Need to review"]];
  function renderNotes() {
    notesLoaded = true; const n = p.notes || {};
    $("#tab-notes").innerHTML = `<div class="notes-grid">${NOTE_FIELDS.map(([k, l]) => `<label class="f"><span>${l}</span><textarea data-note="${k}" rows="3">${esc(n[k] || "")}</textarea></label>`).join("")}
      <div class="row"><button class="btn primary" id="save-notes">Save notes</button><span class="faint" id="notes-info">${n.updated_at ? "Saved " + ago(n.updated_at) : "Not saved yet"}</span></div></div>`;
    $("#save-notes").onclick = saveNotes;
  }
  async function saveNotes() {
    if (!notesLoaded) return;
    const body = {}; $$("[data-note]").forEach((t) => (body[t.dataset.note] = t.value));
    try { await api("/api/notes/" + encodeURIComponent(p.id), body); p.notes = { ...body, updated_at: new Date().toISOString() }; $("#notes-info").textContent = "Saved just now"; toast("Notes saved", "ok"); }
    catch (e) { toast(e.message, "err"); }
  }
  async function loadHistory() {
    const host = $("#tab-history"); host.innerHTML = `<div class="loading">Loading…</div>`;
    try {
      const { items } = await api("/api/submissions?problem_id=" + encodeURIComponent(p.id)); histLoaded = true;
      host.innerHTML = items.length ? items.map((s) => `<div class="hist-row" data-sub="${s.id}"><span class="verdict ${vcls(s.result)}">${esc(s.result)}</span>
        <span class="mono muted">${s.language === "cpp" ? "C++17" : "Python"}</span><span class="grow"></span><span class="faint mono" style="font-size:12px">${s.passed ?? 0}/${s.total ?? 0} · ${s.runtime_ms ?? 0} ms</span><span class="faint" style="font-size:12px">${ago(s.created_at)}</span></div>`).join("")
        : `<div class="empty">No submissions yet. Use <b>Submit / Test</b> to record an attempt.</div>`;
    } catch (e) { host.innerHTML = `<div class="errbox">${esc(e.message)}</div>`; }
  }
  $("#tab-history").addEventListener("click", async (e) => {
    const row = e.target.closest("[data-sub]"); if (!row) return;
    try {
      const s = await api("/api/submissions/" + row.dataset.sub);
      overlay("sub-overlay", `<div class="modal-head"><h2>Submission #${s.id}</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
        <div class="meta"><span class="verdict ${vcls(s.result)}">${esc(s.result)}</span><span class="badge">${s.language === "cpp" ? "C++17" : "Python"}</span><span class="badge">${s.passed ?? 0}/${s.total ?? 0} samples</span><span class="badge">${s.runtime_ms ?? 0} ms</span><span class="faint">${new Date(s.created_at).toLocaleString()}</span></div>
        <pre class="code-view">${esc(s.code)}</pre><div class="row mt" style="justify-content:flex-end"><button class="btn primary" id="load-sub">Load into editor</button></div>`, "big");
      $("#load-sub").onclick = () => { lang = s.language; $("#lang").value = lang; store.set("cp-offline-lang", lang); code.value = s.code; updateGutter(); persist(); CP.closeOverlays(); toast("Loaded into editor"); };
    } catch (err) { toast(err.message, "err"); }
  });

  /* ---------------- contest bar ---------------- */
  let cEnd = 0;
  async function refreshContest() {
    if (!contestId) return;
    try {
      const c = await api("/api/contests/" + encodeURIComponent(contestId));
      cEnd = Date.now() + c.remaining_seconds * 1000;
      $("#contest-bar").innerHTML = `<div class="contest-bar"><i class="dot"></i> ${esc(c.name)} · <span id="c-left" class="mono"></span><span class="grow"></span>
        ${c.problems.map((x) => `<a class="badge ${x.solved ? "s-solved" : ""}" href="/problem.html?id=${encodeURIComponent(x.problem_id)}&contest=${c.id}" style="${x.problem_id === p.id ? "outline:1.5px solid currentColor" : ""}">${x.label}${x.solved ? " ✓" : ""}</a>`).join(" ")}
        <a class="btn sm" href="/contest.html?id=${c.id}">Scoreboard</a></div>`;
    } catch { /* contest bar is optional */ }
  }
  if (contestId) { await refreshContest(); setInterval(() => { const el = $("#c-left"); if (el) el.textContent = cEnd > Date.now() ? clock((cEnd - Date.now()) / 1000) + " left" : "time is up"; }, 1000); }

  /* ---------------- time on problem (real data for "minutes today") ---------------- */
  setInterval(() => { if (document.visibilityState === "visible" && document.hasFocus()) api("/api/time", { problem_id: p.id, seconds: 30 }).catch(() => {}); }, 30000);
})();
