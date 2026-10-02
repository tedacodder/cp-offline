(async () => {
  const { $, esc, api, ago, platformBadge, levelBadge, toast, shortId } = CP; const root = $("#root");
  async function load() {
    try {
      const d = await api("/api/review");
      if (!d.items.length) { root.innerHTML = `<div class="empty">Nothing to review. Mark a problem as <b>Review</b> from its page and it will show up here.<br><a class="btn" style="margin-top:14px" href="/problems.html">Browse problems</a></div>`; return; }
      root.innerHTML = `<div class="pager"><span>${d.total} in queue</span></div>` + d.items.map((p) => `<div class="prow" style="grid-template-columns:90px minmax(0,1fr) 100px 90px 70px 90px 150px">
        <span class="pid">${esc(shortId(p.id))}</span>
        <a href="/problem.html?id=${encodeURIComponent(p.id)}" class="ptitle" style="color:var(--text)">${esc(p.title)}<span class="ptags">${esc(p.tags.slice(0, 5).join(" · "))}</span></a>
        <span>${platformBadge(p.platform)}</span><span>${levelBadge(p)}</span><span class="mono muted" title="Attempts">×${p.attempts}</span>
        <span class="faint" style="font-size:12px" title="Last attempted">${ago(p.last_attempted)}${p.was_solved ? "<br>solved before" : ""}</span>
        <span class="row" style="gap:6px"><a class="btn sm primary" href="/problem.html?id=${encodeURIComponent(p.id)}">Reopen</a><button class="btn sm good" data-solve="${esc(p.id)}">Solved</button></span></div>`).join("");
    } catch (e) { root.innerHTML = `<div class="errbox">${esc(e.message)}</div>`; }
  }
  root.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-solve]"); if (!b) return;
    try { await api("/api/progress", { problem_id: b.dataset.solve, status: "solved" }); toast("Marked solved", "ok"); load(); } catch (err) { toast(err.message, "err"); }
  });
  load();
})();
