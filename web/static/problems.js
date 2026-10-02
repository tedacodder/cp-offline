(() => {
  const { $, esc, api, debounce, problemRows, tableHead } = CP;
  const PAGE = 50;
  const KEYS = ["search", "platform", "tier", "status", "sort", "min_rating", "max_rating"];
  let offset = 0, tags = [], seq = 0;

  function readUrl() {
    const q = new URLSearchParams(location.search);
    if (q.get("difficulty") && !q.get("tier")) q.set("tier", q.get("difficulty"));
    KEYS.forEach((k) => { if (q.has(k)) $("#" + k).value = q.get(k); });
    tags = (q.get("tag") || q.get("tags") || "").split(",").filter(Boolean);
    offset = Math.max(0, parseInt(q.get("offset") || "0", 10) || 0);
  }
  function params() {
    const p = new URLSearchParams();
    KEYS.forEach((k) => { const v = $("#" + k).value.trim(); if (v && !(k === "sort" && v === "id")) p.set(k, v); });
    if (tags.length) p.set("tag", tags.join(","));
    return p;
  }
  async function loadTags() {
    try {
      const list = await api("/api/tags?platform=" + encodeURIComponent($("#platform").value));
      const top = list.slice(0, 24);
      const shown = [...top, ...list.filter((t) => tags.includes(t.norm) && !top.includes(t))];
      $("#chips").innerHTML = `<span class="eyebrow" style="margin-right:4px">Tags</span>` + shown.map((t) =>
        `<button class="tag ${tags.includes(t.norm) ? "on" : ""}" data-tag="${esc(t.norm)}">${esc(t.tag)} <span class="faint">${t.count}</span></button>`).join("");
    } catch { $("#chips").innerHTML = ""; }
  }
  async function load() {
    const my = ++seq, p = params();
    history.replaceState(null, "", p.toString() ? "?" + p : location.pathname);
    const q = new URLSearchParams(p); q.set("limit", PAGE); q.set("offset", offset);
    $("#list").innerHTML = tableHead + Array.from({ length: 8 }, () => `<div class="prow"><span class="skeleton"></span><span class="skeleton"></span><span class="skeleton"></span><span class="skeleton"></span><span class="skeleton"></span></div>`).join("");
    try {
      const d = await api("/api/problems?" + q);
      if (my !== seq) return;
      $("#count").textContent = d.total ? `${d.total.toLocaleString()} problem${d.total === 1 ? "" : "s"}` : "No matches";
      $("#list").innerHTML = d.items.length ? tableHead + problemRows(d.items)
        : `<div class="empty">No problems match these filters.<br><button class="btn sm" style="margin-top:12px" id="reset2">Reset filters</button></div>`;
      const from = d.total ? offset + 1 : 0, to = offset + d.items.length;
      $("#page-info").textContent = d.total ? `${from.toLocaleString()}-${to.toLocaleString()} of ${d.total.toLocaleString()}` : "";
      $("#prev").disabled = offset === 0; $("#next").disabled = to >= d.total;
    } catch (e) { if (my === seq) $("#list").innerHTML = `<div class="errbox">${esc(e.message)}<br><button class="btn sm" style="margin-top:12px" id="retry">Retry</button></div>`; }
  }
  const reload = () => { offset = 0; load(); };
  const reloadSearch = debounce(reload, 250);

  $("#search").addEventListener("input", reloadSearch);
  ["tier", "status", "sort", "min_rating", "max_rating"].forEach((k) => $("#" + k).addEventListener("change", reload));
  $("#platform").addEventListener("change", () => { loadTags(); reload(); });
  $("#chips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tag]"); if (!b) return;
    const t = b.dataset.tag; tags = tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t];
    b.classList.toggle("on"); reload();
  });
  function reset() { KEYS.forEach((k) => { $("#" + k).value = k === "sort" ? "id" : ""; }); tags = []; loadTags(); reload(); }
  $("#reset").onclick = reset;
  document.addEventListener("click", (e) => { if (e.target.id === "reset2") reset(); if (e.target.id === "retry") load(); });
  $("#prev").onclick = () => { offset = Math.max(0, offset - PAGE); load(); window.scrollTo({ top: 0 }); };
  $("#next").onclick = () => { offset += PAGE; load(); window.scrollTo({ top: 0 }); };

  readUrl(); loadTags(); load();
})();
