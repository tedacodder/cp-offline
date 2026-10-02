(async () => {
  const { $, $$, esc, api, toast, debounce, clock, problemRows, tableHead } = CP; const root = $("#root");
  const SKEY = "cp-offline-practice"; const q = new URLSearchParams(location.search);
  const sget = () => { try { return JSON.parse(localStorage.getItem(SKEY) || "null"); } catch { return null; } };
  const sset = (v) => { try { v ? localStorage.setItem(SKEY, JSON.stringify(v)) : localStorage.removeItem(SKEY); } catch { /* ignore */ } };
  let topics = []; const picked = new Set(); let timerId = null;
  try { topics = (await api("/api/topics")).levels.flatMap((l) => l.topics); } catch { /* topics optional */ }

  function form() {
    root.innerHTML = `<div class="card"><div class="grid g3" style="gap:14px">
      <label class="f"><span>Platform</span><select id="platform"><option value="">All</option><option value="codeforces">Codeforces</option><option value="leetcode">LeetCode</option></select></label>
      <label class="f"><span>Difficulty</span><select id="tier"><option value="">Any</option><option>Easy</option><option>Medium</option><option>Hard</option></select></label>
      <label class="f"><span>Status</span><select id="status"><option value="unsolved">Unsolved</option><option value="review">Review</option><option value="any">Any</option></select></label>
      <label class="f"><span>Min rating</span><input id="min" type="number" step="100" min="0" max="4000" placeholder="800"></label>
      <label class="f"><span>Max rating</span><input id="max" type="number" step="100" min="0" max="4000" placeholder="3500"></label>
      <label class="f"><span>Number of problems</span><select id="n"><option>1</option><option selected>3</option><option>5</option><option>10</option></select></label>
      <label class="f"><span>Time limit (optional, minutes)</span><input id="minutes" type="number" min="0" max="600" placeholder="no limit"></label></div>
      <div class="mt"><span class="eyebrow">Topics (any of)</span><div class="chips" id="topics">${topics.map((t, i) => `<button class="tag" data-topic="${i}">${esc(t.name)}</button>`).join("") || '<span class="faint">No topics available.</span>'}</div></div>
      <p class="faint" style="font-size:12px;margin:14px 0 0">Difficulty on Codeforces is derived from rating. Rating limits apply to Codeforces only, so combine them with the Codeforces platform.</p>
      <div class="row mt"><button class="btn primary lg" id="start">START PRACTICE</button><span class="faint" id="match"></span></div></div>`;
    const set = (id, v) => { if (v) $("#" + id).value = v; };
    set("platform", q.get("platform")); set("tier", q.get("tier")); set("status", q.get("status")); set("min", q.get("min")); set("max", q.get("max")); set("n", q.get("n"));
    $("#topics").addEventListener("click", (e) => { const b = e.target.closest("[data-topic]"); if (!b) return; const i = b.dataset.topic; picked.has(i) ? picked.delete(i) : picked.add(i); b.classList.toggle("on"); preview(); });
    $$("select,input", root).forEach((el) => el.addEventListener("change", preview));
    $("#start").onclick = start; preview();
  }
  const body = () => ({ platform: $("#platform").value, tier: $("#tier").value, status: $("#status").value, min_rating: $("#min").value, max_rating: $("#max").value,
    tags: [...picked].flatMap((i) => topics[i].tags), count: Number($("#n").value), minutes: Number($("#minutes").value) || 0 });
  const preview = debounce(async () => { try { const r = await api("/api/practice", { ...body(), count: 1 }); $("#match").textContent = `${r.matching.toLocaleString()} matching problems`; } catch { /* ignore */ } }, 200);
  async function start() {
    const btn = $("#start"); btn.disabled = true;
    try {
      const r = await api("/api/practice", body());
      if (!r.items.length) { toast("No problems match these filters", "err"); return; }
      sset({ ids: r.items.map((p) => p.id), started: Date.now(), minutes: r.minutes }); session();
    } catch (e) { toast(e.message, "err"); } finally { btn.disabled = false; }
  }
  async function session() {
    const s = sget(); if (!s) return form();
    root.innerHTML = `<div class="card mb"><div class="row"><div class="grow"><h2>Practice session</h2><div class="faint" id="sum">Loading…</div></div>
      ${s.minutes ? `<div class="timer" id="t">--:--:--</div>` : ""}<button class="btn" id="new">New session</button></div></div><div class="card" style="padding:0;overflow:hidden" id="plist"><div class="loading">Loading…</div></div>`;
    $("#new").onclick = () => { clearInterval(timerId); sset(null); form(); };
    if (s.minutes) { const end = s.started + s.minutes * 60000; const tick = () => { const left = (end - Date.now()) / 1000; $("#t").textContent = left > 0 ? clock(left) : "TIME UP"; $("#t").classList.toggle("low", left < 300); }; tick(); timerId = setInterval(tick, 1000); }
    try {
      const items = (await Promise.all(s.ids.map((id) => api("/api/problems/" + encodeURIComponent(id)).catch(() => null)))).filter(Boolean);
      const done = items.filter((p) => p.status === "solved").length;
      $("#sum").textContent = `${done} of ${items.length} solved`;
      $("#plist").innerHTML = `<div class="ptable">${tableHead}${problemRows(items)}</div>`;
    } catch (e) { $("#plist").innerHTML = `<div class="errbox">${esc(e.message)}</div>`; }
  }
  sget() && !q.has("platform") && !q.has("status") ? session() : form();
})();
