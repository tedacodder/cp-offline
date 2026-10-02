(async () => {
  const { $, esc, api, toast, ago, clock } = CP; const root = $("#root");
  root.innerHTML = `<div class="split"><div class="card"><div class="card-head"><h2>Create contest</h2></div>
    <div class="grid g2" style="gap:12px">
      <label class="f" style="grid-column:span 2"><span>Name</span><input id="name" type="text" value="Offline Contest" maxlength="80"></label>
      <label class="f"><span>Platform</span><select id="platform"><option value="">All</option><option value="codeforces">Codeforces</option><option value="leetcode">LeetCode</option></select></label>
      <label class="f"><span>Problems</span><select id="count"><option>3</option><option selected>5</option><option>6</option><option>8</option></select></label>
      <label class="f"><span>Min rating</span><input id="min" type="number" step="100" placeholder="800"></label>
      <label class="f"><span>Max rating</span><input id="max" type="number" step="100" placeholder="2000"></label>
      <label class="f"><span>Duration (minutes)</span><input id="minutes" type="number" min="5" max="600" value="120"></label></div>
    <p class="faint" style="font-size:12.5px">Problems are random unsolved ones that have a statement and testable examples, ordered easy → hard (A = 100 pts … each next +100). A problem counts as solved when it passes <b>all sample tests</b> via Submit / Test. This is not an official judge.</p>
    <button class="btn primary lg" id="create">Start contest</button></div>
    <div class="card"><div class="card-head"><h2>History</h2></div><div id="hist"><div class="loading">Loading…</div></div></div></div>`;
  $("#create").onclick = async () => {
    const b = $("#create"); b.disabled = true;
    try {
      const r = await api("/api/contests", { name: $("#name").value, platform: $("#platform").value, count: Number($("#count").value), min_rating: $("#min").value, max_rating: $("#max").value, minutes: Number($("#minutes").value) });
      location.href = "/contest.html?id=" + r.id;
    } catch (e) { toast(e.message, "err"); b.disabled = false; }
  };
  try {
    const { items } = await api("/api/contests");
    $("#hist").innerHTML = items.length ? items.map((c) => `<a class="list-row" href="/contest.html?id=${c.id}"><span class="badge ${c.status === "running" ? "s-attempted" : ""}">${c.status === "running" ? "LIVE " + clock(c.remaining_seconds) : "Finished"}</span>
      <span class="grow">${esc(c.name)}</span><span class="mono muted">${c.score}/${c.max_score}</span><span class="faint" style="font-size:12px">${ago(c.created_at)}</span></a>`).join("")
      : `<div class="empty">No contests yet.</div>`;
  } catch (e) { $("#hist").innerHTML = `<div class="errbox">${esc(e.message)}</div>`; }
})();
