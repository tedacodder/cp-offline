(async () => {
  const { $, esc, api, problemRows, tableHead } = CP; const root = $("#root");
  try {
    const d = await api("/api/bookmarks");
    root.innerHTML = d.items.length ? `<div class="pager"><span>${d.items.length} saved</span></div>` + tableHead + problemRows(d.items)
      : `<div class="empty">Nothing saved yet.<br>Open a problem and press <kbd>b</kbd> to bookmark it.<br><a class="btn" style="margin-top:14px" href="/problems.html">Browse problems</a></div>`;
  } catch (e) { root.innerHTML = `<div class="errbox">${esc(e.message)}</div>`; }
})();
