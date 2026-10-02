(async () => {
  const { $, esc, api, nf, ago, clock, platformBadge, levelBadge, statusBadge, shortId } = CP;
  const root = $("#root");
  let s;
  try { s = await api("/api/stats"); } catch (e) { root.innerHTML = `<div class="card errbox">${esc(e.message)}</div>`; return; }

  if (s.active_contest) {
    $("#live").innerHTML = `<a class="contest-bar mb" href="/contest.html?id=${s.active_contest.id}" style="display:flex;text-decoration:none">
      <i class="dot"></i> Contest in progress: ${esc(s.active_contest.name)} · ${clock(s.active_contest.remaining_seconds)} left <span class="grow"></span>Open →</a>`;
  }
  const pct = s.percent_solved;
  const platCard = (p) => {
    const d = s.platforms[p], w = d.total ? (100 * d.solved / d.total) : 0;
    return `<div><div class="row" style="justify-content:space-between;margin-bottom:6px">${platformBadge(p)}<span class="mono muted">${nf(d.solved)} / ${nf(d.total)}</span></div>
      <div class="bar thin"><i style="width:${Math.max(w, d.solved ? 1 : 0)}%"></i></div></div>`;
  };
  const max = Math.max(1, ...s.daily.map((d) => d.submissions + d.solved));
  const spark = s.daily.map((d) => {
    const n = d.submissions + d.solved;
    return `<div class="${n ? "has" : ""}" style="height:${Math.max(4, 100 * n / max)}%" title="${d.day}: ${d.solved} solved, ${d.submissions} submissions"></div>`;
  }).join("");
  const labels = s.daily.map((d, i) => `<span>${i % 3 === 0 ? d.day.slice(8) : ""}</span>`).join("");
  const list = (items, empty) => items.length ? items.map((p) => `<a class="list-row" href="/problem.html?id=${encodeURIComponent(p.id)}">
      ${platformBadge(p.platform)}<span class="grow">${esc(p.title)}</span>${levelBadge(p)}<span class="faint" style="font-size:12px">${ago(p.last_attempted)}</span></a>`).join("")
    : `<div class="empty">${empty}</div>`;
  const subs = s.recent_submissions.length ? s.recent_submissions.map((x) => `<a class="list-row" href="/problem.html?id=${encodeURIComponent(x.problem_id)}">
      <span class="badge ${x.result === "PASS" ? "s-solved" : ""}">${esc(x.result)}</span><span class="grow">${esc(x.title)}</span>
      <span class="faint mono" style="font-size:11.5px">${esc(x.language)} · ${x.passed}/${x.total}</span><span class="faint" style="font-size:12px">${ago(x.created_at)}</span></a>`).join("")
    : `<div class="empty">No submissions yet. Open a problem and press Submit/Test.</div>`;
  const stat = (label, val, sub = "") => `<div class="card stat"><span class="eyebrow">${label}</span><b>${val}</b><small>${sub}</small></div>`;

  root.innerHTML = `
  <div class="split mb">
    <div class="card">
      <div class="card-head"><h2>Your progress</h2><span class="sub">${nf(s.solved)} of ${nf(s.total)} problems solved</span></div>
      <div class="row" style="gap:22px;align-items:center">
        <div class="ring" style="--p:${Math.min(100, pct)}" data-label="${pct < 10 ? pct.toFixed(2) : pct.toFixed(1)}%"></div>
        <div class="grow grid" style="gap:14px">${platCard("codeforces")}${platCard("leetcode")}</div>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><h2>Today</h2><span class="sub">${s.streak ? "🔥 " : ""}${s.streak}-day streak</span></div>
      <div class="grid g3" style="gap:10px">
        <div><b style="font-size:24px">${s.solved_today}</b><div class="faint" style="font-size:12px">solved</div></div>
        <div><b style="font-size:24px">${s.submissions_today}</b><div class="faint" style="font-size:12px">submissions</div></div>
        <div><b style="font-size:24px">${s.minutes_today}</b><div class="faint" style="font-size:12px">minutes on problems</div></div>
      </div>
      <div class="spark mt" aria-label="Last 14 days of activity">${spark}</div><div class="spark-labels">${labels}</div>
    </div>
  </div>
  <div class="grid g6 mb">
    ${stat("Total", nf(s.total))}${stat("Solved", nf(s.solved), `${s.solved_week} this week · ${s.solved_month} this month`)}
    ${stat("Attempted", nf(s.attempted), "problems with ≥1 attempt")}${stat("Attempts", nf(s.total_attempts), "all submissions + legacy")}
    ${stat("Review", nf(s.review))}${stat("Not started", nf(s.not_started))}
  </div>
  <div class="split mb">
    <div class="card"><div class="card-head"><h2>Continue learning</h2><a class="sub" href="/problems.html?status=attempted&sort=recent">All attempted →</a></div>
      ${list(s.continue, "Nothing in progress. Start with Practice.")}</div>
    <div class="card"><div class="card-head"><h2>Review queue</h2><a class="sub" href="/review.html">${nf(s.review_total)} queued →</a></div>
      ${list(s.review_queue, "Your review queue is empty. Mark problems for review from the problem page.")}</div>
  </div>
  <div class="split">
    <div class="card"><div class="card-head"><h2>Recent submissions</h2></div>${subs}</div>
    <div class="card"><div class="card-head"><h2>Quick practice</h2><span class="sub">Draws from your database</span></div>
      <div class="grid" style="gap:8px">
        <a class="btn" href="/practice.html?platform=codeforces&min=800&max=1000&status=unsolved&n=3">3 Codeforces warm-ups (800-1000)</a>
        <a class="btn" href="/practice.html?platform=leetcode&tier=Medium&status=unsolved&n=3">3 LeetCode mediums</a>
        <a class="btn" href="/practice.html?status=review&n=5">Revisit 5 review problems</a>
        <a class="btn" href="/topics.html">Study by topic →</a>
      </div></div>
  </div>`;
})();
