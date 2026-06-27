/*!
 * Markdown rendering for the shell's `cat`: a tiny GitHub-flavored subset
 * (headings, quotes, lists, bold, em, code, links, tables) into DOM nodes.
 * Pure: depends only on the injected DOM helpers { el, link, d } – no shell state.
 */
export function makeMarkdown(D) {
  var el = D.el, link = D.link, d = D.d;

  // Inline renderer: **bold** / *em* / `code` / _em_ / [text](href).
  function mdInline(node, s) {
    var re = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|_([^_]+)_/g;
    var last = 0, m;
    while ((m = re.exec(s))) {
      if (m.index > last) node.appendChild(d.createTextNode(s.slice(last, m.index)));
      if (m[2] != null) node.appendChild(link(m[2], m[1], /^https?:/i.test(m[2])));
      else if (m[3] != null) node.appendChild(el('span', 'md-strong', m[3]));
      else if (m[4] != null) node.appendChild(el('span', 'md-em', m[4]));
      else if (m[5] != null) node.appendChild(el('span', 'md-code', m[5]));
      else if (m[6] != null) node.appendChild(el('span', 'md-em', m[6]));
      last = re.lastIndex;
    }
    if (last < s.length) node.appendChild(d.createTextNode(s.slice(last)));
    return node;
  }
  function mdLine(line) {
    if (!line.trim()) return null;   // collapse blank lines – spacing is controlled by CSS margins
    var div = el('div', 'ln'), m;
    if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) { div.className = 'ln md-h md-h' + m[1].length; return mdInline(div, m[2]); }
    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) { div.className = 'ln md-hr'; div.textContent = '────────────────────────────'; return div; }
    if ((m = /^>\s?(.*)$/.exec(line))) { div.className = 'ln md-quote'; return mdInline(div, m[1]); }
    if ((m = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(line))) {
      div.className = 'ln md-li';
      div.appendChild(el('span', 'md-bullet', /\d/.test(m[2]) ? m[2] + ' ' : '• '));
      return mdInline(div, m[3]);
    }
    if (line.trim()) div.className = 'ln md-p';   // paragraph – gets extra spacing
    return mdInline(div, line);
  }
  // ── GitHub-style markdown tables ──────────────────────────────
  function mdRow(line) {
    return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (c) { return c.trim(); });
  }
  function mdIsSep(line) {
    if (!line || line.indexOf('|') === -1) return false;
    var cells = mdRow(line);
    return cells.length > 0 && cells.every(function (c) { return /^:?-{1,}:?$/.test(c); });
  }
  // If a table starts at lines[i] (header row + `|---|` separator), build it.
  // Returns { node, next } where next is the index after the table, else null.
  function mdTable(lines, i) {
    if (!lines[i] || lines[i].indexOf('|') === -1) return null;
    if (!mdIsSep(lines[i + 1] || '')) return null;
    var headers = mdRow(lines[i]);
    var table = el('table', 'term-table');
    var thead = d.createElement('thead'), htr = d.createElement('tr');
    headers.forEach(function (c) { var th = d.createElement('th'); mdInline(th, c); htr.appendChild(th); });
    thead.appendChild(htr); table.appendChild(thead);
    var tbody = d.createElement('tbody'), j = i + 2;
    for (; j < lines.length; j++) {
      if (!lines[j] || !lines[j].trim() || lines[j].indexOf('|') === -1) break;
      var cells = mdRow(lines[j]), tr = d.createElement('tr');
      for (var c = 0; c < headers.length; c++) { var td = d.createElement('td'); mdInline(td, cells[c] || ''); tr.appendChild(td); }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    return { node: table, next: j };
  }

  return { mdInline: mdInline, mdLine: mdLine, mdRow: mdRow, mdIsSep: mdIsSep, mdTable: mdTable };
}
