(async () => {
  const { $, esc, api, nf } = CP; const root = $("#root");
  $("#backup").onclick = () => CP.pm && CP.pm.downloadBackup();
  let a;
  try { a = await api("/api/analytics"); } catch (e) { root.innerHTML = `<div class="card errbox">${esc(e.message)}</div>`; return; }
  const s = a.summary, dash = (v, suf = "") => (v === null || v === undefined ? "-" : v + suf);
  const kpi = (l, v, sub = "") => `<div class="card stat"><span class="eyebrow">${l}</span><b>${v}</b><small>${sub}</small></div>`;
  const hbar = (lbl, solved, total) => `<div class="hbar"><span class="lbl">${esc(lbl)}</span><div class="track"><i style="width:${total ? Math.max(100 * solved / total, solved ? 2 : 0) : 0}%"></i></div><span class="num">${nf(solved)}/${nf(total)}</span></div>`;
  const COLORS = { PASS: "var(--green)", "WRONG ANSWER": "var(--red)", "COMPILE ERROR": "var(--amber)", "RUNTIME ERROR": "var(--purple)", "TIME LIMIT EXCEEDED": "var(--blue)" };
  const color = (v, i) => COLORS[v] || ["var(--faint)", "var(--muted)", "var(--border-2)"][i % 3];

  const vt = a.verdicts.reduce((n, v) => n + v.n, 0);
  let acc = 0;
  const stops = a.verdicts.map((v, i) => { const from = acc; acc += 100 * v.n / vt; return `${color(v.result, i)} ${from}% ${acc}%`; }).join(", ");
  const passRate = vt ? Math.round(100 * (a.verdicts.find((v) => v.result === "PASS") || { n: 0 }).n / vt) : 0;
  const verdictCard = vt ? `<div class="row" style="gap:22px;align-items:center"><div class="donut" style="--d:conic-gradient(${stops})" data-label="${passRate}%"></div>
      <div class="grow">${a.verdicts.map((v, i) => `<div class="leg-row"><i style="background:${color(v.result, i)}"></i><span>${esc(v.result)}</span><span>${v.n}</span></div>`).join("")}
      <div class="faint" style="font-size:12px;margin-top:8px">Center = share of submissions that passed all samples.</div></div></div>`
    : `<div class="empty">No submissions yet. Use <b>Submit / Test</b> on a problem.</div>`;
  const maxW = Math.max(1, ...a.weeks.map((w) => w.solved));
  const weeks = `<div class="cols">${a.weeks.map((w) => `<div title="Week of ${w.week}: ${w.solved} solved"><span>${w.solved || ""}</span><b style="height:${Math.max(3, 100 * w.solved / maxW * .78)}%"></b></div>`).join("")}</div>
    <div class="faint mono" style="display:flex;justify-content:space-between;font-size:10.5px;margin-top:6px"><span>${a.weeks[0].week.slice(5)}</span><span>this week</span></div>`;
  const tagRows = a.tags.length ? a.tags.map((t) => `<div class="hbar" style="grid-template-columns:130px 1fr 74px"><span class="lbl" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(t.tag)}">${esc(t.tag)}</span>
      <div class="track"><i style="width:${Math.max(100 * t.solved / t.attempted, t.solved ? 2 : 0)}%"></i></div><span class="num" title="solved / attempted problems">${t.solved}/${t.attempted}</span></div>`).join("")
    : `<div class="empty">Topic stats appear after your first attempts.</div>`;
  const langs = a.languages.length ? a.languages.map((l) => hbar(l.language === "cpp" ? "C++17" : "Python", l.n, vt)).join("") : `<div class="empty">No data yet.</div>`;

  root.innerHTML = `
  <div class="kpis mb">${kpi("Solved", nf(s.solved), `${s.active_days} active days (26 wk)`)}${kpi("Submissions", nf(s.submissions))}
    ${kpi("Longest streak", s.longest_streak + (s.longest_streak === 1 ? " day" : " days"))}${kpi("First-try rate", dash(s.first_try_rate, "%"), "solved with ≤1 attempt")}
    ${kpi("Avg attempts / solve", dash(s.avg_attempts))}${kpi("Time logged", s.hours + " h", "on problem pages")}${kpi("Contests", nf(s.contests), "finished")}${kpi("Pass rate", vt ? passRate + "%" : "-", "samples")}</div>
  <div class="card mb"><div class="card-head"><h2>Activity</h2><span class="sub">last 26 weeks</span></div>${CP.pm ? CP.pm.heatHtml(a.heat) : ""}</div>
  <div class="two mb"><div class="card"><div class="card-head"><h2>Solved per week</h2><span class="sub">last 12 weeks</span></div>${weeks}</div>
    <div class="card"><div class="card-head"><h2>Submission results</h2></div>${verdictCard}</div></div>
  <div class="two mb"><div class="card"><div class="card-head"><h2>Codeforces by rating</h2><span class="sub">solved / available</span></div>${a.rating.length ? a.rating.map((r) => hbar(`${r.from}-${r.to}`, r.solved, r.total)).join("") : `<div class="empty">No rated problems.</div>`}</div>
    <div><div class="card mb"><div class="card-head"><h2>LeetCode by difficulty</h2></div>${a.tiers.map((t) => hbar(t.tier, t.solved, t.total)).join("")}</div>
    <div class="card"><div class="card-head"><h2>Languages</h2><span class="sub">by submission</span></div>${langs}</div></div></div>
  <div class="card mb"><div class="card-head"><h2>Topics you practice most</h2><span class="sub">solved / attempted problems per tag</span></div>${tagRows}</div>
  <div class="card"><div class="card-head"><h2>Your data stays yours</h2></div><p class="muted" style="margin:0 0 12px">Download a JSON backup of your progress, notes, submissions (with code), contests and bookmarks. Keep a copy before updating the app.</p>
    <button class="btn primary" id="backup2">⇩ Download backup</button></div>`;
  $("#backup2").onclick = () => CP.pm && CP.pm.downloadBackup();
})();
