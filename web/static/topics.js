(async () => {
  const { $, esc, api, nf } = CP; const root = $("#root");
  try {
    const d = await api("/api/topics");
    root.innerHTML = d.levels.map((l) => `<section class="mb"><div class="card-head"><h2>${esc(l.level)}</h2><span class="sub">${l.topics.length} topics</span></div>
      <div class="topic-grid">${l.topics.map((t) => `<a class="topic" href="/problems.html?tag=${encodeURIComponent(t.tags.join(","))}">
        <div class="t-top">${esc(t.name)}<span>${nf(t.solved)} / ${nf(t.count)}</span></div><div class="bar thin"><i style="width:${t.count ? Math.max(100 * t.solved / t.count, t.solved ? 1.5 : 0) : 0}%"></i></div></a>`).join("")}</div></section>`).join("") +
      `<p class="faint" style="font-size:12.5px">Not tagged in this dataset: ${d.untagged.map(esc).join(", ")}. Codeforces tags are lowercase, LeetCode tags use Title Case; a topic combines both.</p>`;
  } catch (e) { root.innerHTML = `<div class="card errbox">${esc(e.message)}</div>`; }
})();
