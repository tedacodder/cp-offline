(async () => {
  const { $, esc, api, toast, clock, platformBadge, levelBadge, overlay } = CP; const root = $("#root");
  const id = new URLSearchParams(location.search).get("id"); let timer = null;
  async function load() {
    let c;
    try { c = await api("/api/contests/" + encodeURIComponent(id)); } catch (e) { root.innerHTML = `<div class="card errbox">${esc(e.message)}<div class="mt"><a class="btn" href="/contests.html">All contests</a></div></div>`; return; }
    clearInterval(timer); document.title = `${c.name} · CP Offline`;
    const running = c.status === "running", end = Date.now() + c.remaining_seconds * 1000;
    const rows = c.problems.map((p) => `<a class="cp ${p.solved ? "solved" : ""}" href="/problem.html?id=${encodeURIComponent(p.problem_id)}${running ? "&contest=" + c.id : ""}">
      <span class="lab">${p.label}</span><span class="grow"><div class="ttl">${esc(p.title)}</div><div class="row" style="gap:6px;margin-top:3px">${platformBadge(p.platform)}${levelBadge(p)}</div></span>
      <span class="mono" style="font-size:18px">${p.solved ? "✓" : "○"}</span>
      <span class="pts">${p.points} pts<br>${p.attempts} att${p.wrong_attempts ? ` · ${p.wrong_attempts} wrong` : ""}${p.solved ? `<br>${p.solve_minutes} min` : ""}</span></a>`).join("");
    root.innerHTML = `<div class="card mb"><div class="row" style="gap:24px"><div class="grow"><div class="eyebrow">${running ? "Offline contest · live" : "Offline contest · finished"}</div><h1 style="margin-top:6px">${esc(c.name)}</h1></div>
      ${running ? `<div class="timer" id="t">${clock(c.remaining_seconds)}</div>` : ""}
      <div style="text-align:right"><div class="eyebrow">Score</div><div class="timer" style="font-size:30px">${c.score}<span class="faint" style="font-size:16px"> / ${c.max_score}</span></div></div>
      ${running ? `<button class="btn danger" id="finish">Finish contest</button>` : `<a class="btn primary" href="/contests.html">New contest</a>`}</div></div>
      <div class="grid" style="gap:10px">${rows}</div>
      <p class="faint" style="font-size:12.5px;margin-top:14px">${c.solved_count} of ${c.problems.length} solved on sample tests (not an official judge). ${running ? "Open a problem and use <b>Submit / Test</b> to score." : "Select a problem to review it, including your submissions."}</p>`;
    if (running) {
      const tick = () => { const left = (end - Date.now()) / 1000; const t = $("#t"); if (!t) return; t.textContent = clock(left); t.classList.toggle("low", left < 600); if (left <= 0) { clearInterval(timer); toast("Time is up!"); load(); } };
      timer = setInterval(tick, 1000);
      $("#finish").onclick = () => {
        overlay("fin", `<div class="modal-head"><h2>Finish contest?</h2></div><p class="muted">You will no longer be able to submit for scoring. Your score is ${c.score}/${c.max_score}.</p><div class="row" style="justify-content:flex-end"><button class="btn" data-close>Keep going</button><button class="btn danger" id="yes">Finish</button></div>`);
        $("#yes").onclick = async () => { try { await api(`/api/contests/${c.id}/finish`, {}); CP.closeOverlays(); load(); } catch (e) { toast(e.message, "err"); } };
      };
    }
  }
  load();
})();
