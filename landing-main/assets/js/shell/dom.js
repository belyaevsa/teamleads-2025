/*!
 * DOM + formatting helpers for the shell. Every output line, link, and pager
 * goes through here. Factory closes over the mount's { d, w, out, body, reduced }
 * so each terminal instance prints into its own panel.
 */
export function makeDom(S) {
  var d = S.d, w = S.w, out = S.out, body = S.body;

  function el(t, c, x) { var n = d.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; }
  function print(text, cls) { var n = el('div', 'ln' + (cls ? ' ' + cls : ''), text == null ? '' : text); out.appendChild(n); body.scrollTop = body.scrollHeight; return n; }
  function printNode(node) { var n = el('div', 'ln'); n.appendChild(node); out.appendChild(n); body.scrollTop = body.scrollHeight; return n; }
  function link(href, text, ext) { var a = el('a', null, text); a.href = href; if (ext) { a.target = '_blank'; a.rel = 'noopener'; } return a; }
  function pad(s, n) { s = String(s); return s.length >= n ? s + ' ' : s + new Array(n - s.length + 1).join(' '); }
  // A link whose column padding sits OUTSIDE the anchor, so hover-underline covers only the name.
  function linkpad(href, name, width, ext) {
    var f = d.createDocumentFragment();
    f.appendChild(link(href, name, ext));
    var gap = width - String(name).length;
    f.appendChild(el('span', 'dim', gap > 0 ? new Array(gap + 1).join(' ') : ' '));
    return f;
  }
  // ── techinterview.space company reviews (data source attribution required) ──
  var TIAPI = 'https://api.techinterview.space/api';
  var TIWEB = 'https://techinterview.space';
  function linkTI(path, text) { return link(TIWEB + path, text, true); }
  var RU_MON = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  function fmtDate(iso) { if (!iso) return ''; var t = new Date(iso); if (isNaN(t.getTime())) return ''; return t.getDate() + ' ' + RU_MON[t.getMonth()] + ' ' + t.getFullYear(); }
  function rstar(n) { return '★ ' + ((n || n === 0) ? Number(n).toFixed(1) : '–'); }
  // Timestamp (ms) → dd.mm.yyyy hh:mm, for user-FS file metadata.
  function fmtTs(ms) {
    if (!ms) return '–';
    try { var t = new Date(ms), z = function (n) { return (n < 10 ? '0' : '') + n; };
      return z(t.getDate()) + '.' + z(t.getMonth() + 1) + '.' + t.getFullYear() + ' ' + z(t.getHours()) + ':' + z(t.getMinutes()); }
    catch (e) { return '–'; }
  }
  // Generic pager: returns the requested slice + page metadata.
  function paginate(items, page, per) {
    per = per || 8; var total = items.length;
    var pages = Math.max(1, Math.ceil(total / per));
    page = Math.min(Math.max(1, page || 1), pages);
    var from = (page - 1) * per;
    return { slice: items.slice(from, from + per), page: page, pages: pages, total: total, from: total ? from + 1 : 0, to: Math.min(from + per, total) };
  }
  // Footer line + next/prev hints for a paginated command (base = command without page arg).
  function pageNav(p, base) {
    if (p.pages <= 1) { if (p.total) print('всего: ' + p.total, 'dim'); return; }
    print('стр. ' + p.page + '/' + p.pages + '  ·  ' + p.from + '–' + p.to + ' из ' + p.total, 'dim');
    var nav = [];
    if (p.page < p.pages) nav.push(base + ' ' + (p.page + 1) + ' – дальше');
    if (p.page > 1) nav.push(base + ' ' + (p.page - 1) + ' – назад');
    if (nav.length) print(nav.join('  ·  '), 'hint');
  }
  // Navigate the browser, with a short transition line (respects reduced motion).
  function go(href) { print(''); print('переход → ' + href, 'ok'); setTimeout(function () { w.location.href = href; }, S.reduced ? 0 : 360); }

  return {
    el: el, print: print, printNode: printNode, link: link, pad: pad, linkpad: linkpad,
    linkTI: linkTI, fmtDate: fmtDate, rstar: rstar, fmtTs: fmtTs, paginate: paginate, pageNav: pageNav, go: go,
    TIAPI: TIAPI, TIWEB: TIWEB, RU_MON: RU_MON
  };
}
