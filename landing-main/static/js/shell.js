/*!
 * Teamleads Shell – a tiny, dependency-free terminal that turns the site into a
 * navigable filesystem. Config comes from data-* attributes on the mount node:
 *   data-mode  "full" | "404"
 *   data-tg    Telegram URL
 *   data-fs    JSON: { sections: {name: [{n,u,t,d,a,p}]}, links: {name:url} }
 *              (a = author, p = participant names – used by `git blame`/`shortlog`)
 * Auto-mounts every [data-term] on load. Also exposed as window.TeamleadsShell.
 */
(function (w, d) {
  'use strict';

  function mount(root) {
    if (!root || root.__shell) return;
    root.__shell = true;

    var out = root.querySelector('[data-term-out]');
    var body = root.querySelector('[data-term-body]');
    var line = root.querySelector('[data-term-prompt-line]');
    var input = root.querySelector('[data-term-input]');
    var promptEl = root.querySelector('[data-term-prompt]');
    var titleEl = root.querySelector('[data-term-title]');
    var simPanel = root.querySelector('[data-term-sim]');
    var edPanel = root.querySelector('[data-term-editor]');
    var edArea = root.querySelector('[data-term-editor-area]');
    var edName = root.querySelector('[data-term-editor-name]');
    var edMeta = root.querySelector('[data-term-editor-meta]');
    if (!out || !body || !input) return;

    var mode = root.getAttribute('data-mode') || 'full';
    // Only the dedicated /shell/ page rewrites the address bar as commands run (data-urlsync="1").
    // Embedded terminals (homepage, 404) must not touch the URL.
    var URLSYNC = root.getAttribute('data-urlsync') === '1';
    // Windows visitors get a PowerShell skin (blue theme + PS prompt + PS aliases);
    // everyone else keeps the bash-style shell. Detect via UA-CH, then platform/UA.
    var WIN = false;
    try {
      var uad = w.navigator && w.navigator.userAgentData;
      var plat = (uad && uad.platform) || (w.navigator && w.navigator.platform) || '';
      var ua = (w.navigator && w.navigator.userAgent) || '';
      WIN = /win/i.test(plat) || /Windows/i.test(ua);
    } catch (e) {}
    if (WIN) root.classList.add('term--ps');
    // A saved `theme` choice overrides the OS-based default.
    try {
      var savedTheme = w.localStorage && w.localStorage.getItem('tnk_shell_theme');
      if (savedTheme === 'powershell') root.classList.add('term--ps');
      else if (savedTheme === 'bash') root.classList.remove('term--ps');
    } catch (e) {}
    var TG = root.getAttribute('data-tg') || 'https://t.me/teamleads_kz';
    var FS = {};
    try { FS = JSON.parse(root.getAttribute('data-fs') || '{}') || {}; } catch (e) { FS = {}; }
    var SAL = {};
    try { SAL = JSON.parse(root.getAttribute('data-salary') || '{}') || {}; } catch (e) { SAL = {}; }
    var FRIENDS = [];
    try { FRIENDS = JSON.parse(root.getAttribute('data-friends') || '[]') || []; } catch (e) { FRIENDS = []; }
    var SCEN = {};
    try { SCEN = JSON.parse(root.getAttribute('data-scenarios') || '{}') || {}; } catch (e) { SCEN = {}; }
    var QUIZZES = {};
    try { QUIZZES = JSON.parse(root.getAttribute('data-quizzes') || '{}') || {}; } catch (e) { QUIZZES = {}; }
    var SHARE = {};  // verb → /s/<id>/ card id (from data/shell_commands.toml)
    try { SHARE = JSON.parse(root.getAttribute('data-share') || '{}') || {}; } catch (e) { SHARE = {}; }
    var QUESTIONS = [];  // open discussion backlog (events' nextQuestions) → `discuss`
    try { QUESTIONS = JSON.parse(root.getAttribute('data-questions') || '[]') || []; } catch (e) { QUESTIONS = []; }
    var VOICES = [];     // curated chat quotes (data/voices.yaml) → `voices`
    try { VOICES = JSON.parse(root.getAttribute('data-voices') || '[]') || []; } catch (e) { VOICES = []; }
    var COMPANIES = [];  // pre-fetched companies with reviews (data/companies.json) → `companies`
    try { COMPANIES = JSON.parse(root.getAttribute('data-companies') || '[]') || []; } catch (e) { COMPANIES = []; }
    var hintedShare = false;
    var sections = FS.sections || {};
    var links = FS.links || {};
    var sectionNames = Object.keys(sections);
    var linkNames = Object.keys(links);
    var pool = [];
    sectionNames.forEach(function (s) { (sections[s] || []).forEach(function (it) { pool.push(it); }); });

    var reduced = w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var cwd = '';            // '' = root; otherwise a path with no leading slash (events, projects/sub)
    var prevCwd = '';        // last directory, for `cd -`
    var vimMode = false;
    var hist = [], hpos = -1;
    var comp = { base: '', list: [], idx: 0, full: null };  // Tab-completion cycling state
    var HKEY = 'tnk_shell_history';
    try { var _hs = w.localStorage && w.localStorage.getItem(HKEY); if (_hs) { hist = JSON.parse(_hs) || []; hpos = hist.length; } } catch (e) {}
    function saveHist() { try { if (w.localStorage) w.localStorage.setItem(HKEY, JSON.stringify(hist.slice(-100))); } catch (e) {} }
    function histPrev() { if (hpos > 0) { hpos--; input.value = hist[hpos]; } }
    function histNext() { if (hpos < hist.length - 1) { hpos++; input.value = hist[hpos]; } else { hpos = hist.length; input.value = ''; } }

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
    // Split args into a trailing page number and the rest of the query.
    function pageArg(a) {
      var args = (a || []).slice(); var page = 1;
      if (args.length && /^\d+$/.test(args[args.length - 1])) page = parseInt(args.pop(), 10);
      return { q: args.join(' ').trim(), page: page };
    }
    // Resolve a free-text query to a baked company (exact slug, then name/slug contains).
    function resolveCompany(q) {
      q = (q || '').toLowerCase();
      for (var i = 0; i < COMPANIES.length; i++) { if (COMPANIES[i].slug === q) return COMPANIES[i]; }
      for (i = 0; i < COMPANIES.length; i++) { var c = COMPANIES[i]; if (c.name.toLowerCase().indexOf(q) !== -1 || c.slug.indexOf(q) !== -1) return c; }
      return null;
    }
    // Resolve a `section/name` (or bare name in cwd) to a baked page item – shared by cat/head/tail/wc/stat.
    function resolvePage(arg) {
      arg = (arg || '').replace(/^\/|\/$/g, '');
      if (!arg || links[arg]) return null;
      var sec = null, name = arg;
      if (arg.indexOf('/') !== -1) { var p = arg.split('/'); sec = p[0]; name = p[1]; }
      else if (cwd) sec = cwd;
      var hit = null;
      if (sec && sections[sec]) sections[sec].forEach(function (it) { if (it.n === name) hit = it; });
      if (!hit) pool.forEach(function (it) { if (it.n === name) hit = it; });
      return hit;
    }

    // ════════════════════════════════════════════════════════════════════════
    // User filesystem: a writable overlay in localStorage, unioned OVER the baked
    // read-only content. Full-overlay model: user nodes may be created at ANY path
    // (even inside /events), a user node SHADOWS the baked node at the same path,
    // and deleting a baked node records a tombstone (whiteout) that hides it.
    // Keyed by a normalized path string with NO leading slash – same encoding as
    // `cwd` ('' = root, 'projects', 'projects/sub/idea.md').
    // ════════════════════════════════════════════════════════════════════════
    var UFS_KEY = 'tnk_shell_fs';
    var ufs = { v: 1, nodes: {}, tombs: {} };  // nodes: path→{type,content,ctime,mtime,author}; tombs: path→1
    var ufsMem = false;                          // localStorage blocked → session-only, with a warning
    try {
      var _ufsRaw = w.localStorage && w.localStorage.getItem(UFS_KEY);
      if (_ufsRaw) { var _up = JSON.parse(_ufsRaw); if (_up && _up.nodes) ufs = { v: _up.v || 1, nodes: _up.nodes || {}, tombs: _up.tombs || {} }; }
    } catch (e) { ufsMem = true; }
    function ufsSave() {
      if (ufsMem) return true;
      try { w.localStorage.setItem(UFS_KEY, JSON.stringify(ufs)); return true; }
      catch (e) { ufsMem = true; print('диск недоступен или переполнен – правки сохранены только в этой вкладке', 'err'); return false; }
    }
    function ufsUser() { try { return (w.localStorage && w.localStorage.getItem('tnk_shell_user')) || 'guest'; } catch (e) { return 'guest'; } }
    function ufsNow() { try { return Date.now(); } catch (e) { return 0; } }
    function fmtTs(ms) {
      if (!ms) return '–';
      try { var t = new Date(ms), z = function (n) { return (n < 10 ? '0' : '') + n; };
        return z(t.getDate()) + '.' + z(t.getMonth() + 1) + '.' + t.getFullYear() + ' ' + z(t.getHours()) + ':' + z(t.getMinutes()); }
      catch (e) { return '–'; }
    }
    // Normalize an arg to a path with NO leading/trailing slash ('' = root). Leading
    // / or ~ → absolute; otherwise relative to cwd. Resolves '.' and '..'.
    function normPath(arg) {
      arg = String(arg == null ? '' : arg);
      var absolute = arg.charAt(0) === '/' || arg.charAt(0) === '~';
      if (arg.charAt(0) === '~') arg = arg.slice(1);
      var parts = absolute ? [] : (cwd ? cwd.split('/') : []);
      arg.split('/').forEach(function (seg) {
        if (seg === '' || seg === '.') return;
        if (seg === '..') { parts.pop(); return; }
        parts.push(seg);
      });
      return parts.join('/');
    }
    function parentOf(p) { var i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); }
    function baseName(p) { var i = p.lastIndexOf('/'); return i < 0 ? p : p.slice(i + 1); }
    // Baked lookup: is `path` baked content? → {type, item?, link?} or null.
    function bakedAt(path) {
      if (path === '') return { type: 'dir' };
      var segs = path.split('/');
      if (segs.length === 1) {
        if (sections[segs[0]]) return { type: 'dir' };
        if (links[segs[0]]) return { type: 'file', link: links[segs[0]] };
        return null;
      }
      if (segs.length === 2 && sections[segs[0]]) {
        var hit = null; (sections[segs[0]] || []).forEach(function (it) { if (it.n === segs[1]) hit = it; });
        if (hit) return { type: 'file', item: hit };
      }
      return null;
    }
    // Baked children of a dir path, or null if it isn't a baked dir.
    function bakedChildren(path) {
      if (path === '') {
        var r = [];
        sectionNames.forEach(function (s) { r.push({ name: s, type: 'dir', source: 'baked' }); });
        linkNames.forEach(function (k) { r.push({ name: k, type: 'file', source: 'baked', link: links[k] }); });
        return r;
      }
      if (sections[path]) return (sections[path] || []).map(function (it) { return { name: it.n, type: 'file', source: 'baked', item: it }; });
      return null;
    }
    // Union resolve: {type, source:'user'|'baked', node?|item?|link?} or null (missing/whiteout).
    function statPath(path) {
      var u = ufs.nodes[path];
      if (u) return { type: u.type, source: 'user', node: u };
      if (ufs.tombs[path]) return null;
      var b = bakedAt(path);
      if (b) return { type: b.type, source: 'baked', item: b.item, link: b.link };
      return null;
    }
    function isDir(path) { if (path === '') return true; var s = statPath(path); return !!(s && s.type === 'dir'); }
    function ufsChildrenCount(path) { var n = 0; Object.keys(ufs.nodes).forEach(function (p) { if (parentOf(p) === path) n++; }); return n; }
    // Union listing: baked children overlaid with user children, tombstones removed; dirs first.
    function listDir(path) {
      var byName = {};
      var bk = bakedChildren(path);
      if (bk) bk.forEach(function (e) { byName[e.name] = e; });
      Object.keys(ufs.nodes).forEach(function (p) {
        if (parentOf(p) === path) { var n = ufs.nodes[p]; byName[baseName(p)] = { name: baseName(p), type: n.type, source: 'user', node: n }; }
      });
      Object.keys(ufs.tombs).forEach(function (p) { if (parentOf(p) === path && !ufs.nodes[p]) delete byName[baseName(p)]; });
      return Object.keys(byName).sort(function (a, b) {
        var da = byName[a].type === 'dir', db = byName[b].type === 'dir';
        if (da !== db) return da ? -1 : 1;
        return a < b ? -1 : a > b ? 1 : 0;
      }).map(function (k) { return byName[k]; });
    }
    // Create a dir and any missing parents (mkdir -p). Returns an error string or null.
    function ensureDir(path, author, now) {
      if (path === '') return null;
      var segs = path.split('/'), cur = '';
      for (var i = 0; i < segs.length; i++) {
        cur = cur ? cur + '/' + segs[i] : segs[i];
        var s = statPath(cur);
        if (s) { if (s.type !== 'dir') return 'не каталог: /' + cur; continue; }
        ufs.nodes[cur] = { type: 'dir', ctime: now, mtime: now, author: author };
      }
      return null;
    }
    // Drop a user node and all its descendants.
    function ufsRemoveSubtree(path) {
      delete ufs.nodes[path];
      var pre = path + '/';
      Object.keys(ufs.nodes).forEach(function (p) { if (p.indexOf(pre) === 0) delete ufs.nodes[p]; });
    }
    // Render one ls entry (baked page/section/link or user file/dir) with metadata.
    function lsRenderEntry(e, full) {
      var n = el('span');
      if (e.type === 'dir') {
        n.appendChild(el('span', 'dim', 'd '));
        if (e.source === 'baked' && sections[full]) { n.appendChild(linkpad('/' + full + '/', e.name + '/', 18)); n.appendChild(el('span', 'dim', (sections[full] || []).length + ' материалов')); }
        else { n.appendChild(el('span', 'accent', pad(e.name + '/', 18))); n.appendChild(el('span', 'dim', fmtTs(e.node && e.node.mtime) + ' · ' + ((e.node && e.node.author) || ''))); }
      } else {
        n.appendChild(el('span', 'dim', '- '));
        if (e.source === 'baked' && e.item) { n.appendChild(linkpad(e.item.u, e.name, 18)); n.appendChild(el('span', 'dim', e.item.d || '')); }
        else if (e.source === 'baked' && e.link) { n.appendChild(linkpad(e.link, e.name, 18)); }
        else { n.appendChild(el('span', null, pad(e.name, 18))); var sz = ((e.node && e.node.content) || '').length; n.appendChild(el('span', 'dim', sz + ' Б · ' + fmtTs(e.node && e.node.mtime) + ' · ' + ((e.node && e.node.author) || ''))); }
      }
      printNode(n);
    }
    // Fetch a page's raw markdown with a transient "загрузка…" line. Centralizes the
    // loading/error dance repeated across cat/company/find/grep.
    function fetchPageText(hit, onText) {
      if (!w.fetch) { print('fetch недоступен в этом браузере – попробуйте open ' + hit.n, 'err'); return; }
      var loading = print('загрузка…', 'dim');
      w.fetch(hit.u + 'index.md').then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
        .then(function (txt) { if (loading && loading.parentNode) loading.parentNode.removeChild(loading); onText(txt); })
        .catch(function (e) { if (loading && loading.parentNode) loading.parentNode.removeChild(loading); print('не удалось загрузить – ' + e.message, 'err'); });
    }
    // Strip YAML front-matter + markdown noise → plain prose, for word counts / reading time.
    function plainText(md) {
      return md.replace(/^---[\s\S]*?\n---\n/, '').replace(/```[\s\S]*?```/g, ' ')
        .replace(/[#>*_`~\-|]/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
    }
    // head/tail: print the first/last N lines of a page's markdown. Accepts -n N or -N.
    function headTail(kind, a) {
      a = (a || []).slice(); var n = 10;
      for (var i = 0; i < a.length; i++) {
        if (a[i] === '-n' && /^\d+$/.test(a[i + 1] || '')) { n = parseInt(a[i + 1], 10); a.splice(i, 2); i--; }
        else if (/^-n?\d+$/.test(a[i])) { n = parseInt(a[i].replace(/^-n?/, ''), 10); a.splice(i, 1); i--; }
      }
      function show(txt, label) {
        var lines = txt.replace(/\s+$/, '').split('\n');
        var slice = kind === 'head' ? lines.slice(0, n) : lines.slice(Math.max(0, lines.length - n));
        slice.forEach(function (l) { print(l || ''); });
        print('– ' + kind + ' -n ' + n + ' · всего строк: ' + lines.length + ' · cat ' + label + ' – полностью', 'dim');
      }
      var un = ufs.nodes[normPath(a[0])];
      if (un) { if (un.type === 'dir') { print(kind + ': /' + normPath(a[0]) + ' – каталог', 'err'); return; } show(un.content || '', a[0]); return; }
      var hit = resolvePage(a[0]);
      if (!hit) { print(kind + ': не найдено: ' + (a[0] || '') + '. Список – ls.', 'err'); return; }
      fetchPageText(hit, function (txt) { show(txt, hit.n); });
    }
    // Short one-line gist of a man page (drops the "<name> –" prefix, first sentence).
    function manSummary(k) {
      var rest = (MANPAGES[k] || '').split(' – ').slice(1).join(' – ');
      return (rest.split(/[.·]/)[0] || rest).trim();
    }
    // Trigger a client-side file download of `text` named `name`.
    function downloadText(name, text) {
      try {
        var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        var url = (w.URL || w.webkitURL).createObjectURL(blob);
        var a = d.createElement('a'); a.href = url; a.download = name; a.style.display = 'none';
        d.body.appendChild(a); a.click();
        setTimeout(function () { d.body.removeChild(a); (w.URL || w.webkitURL).revokeObjectURL(url); }, 0);
        return true;
      } catch (e) { return false; }
    }
    // Markdown puzzle → readable plain text: drop front-matter & images, <br> → newline, strip tags.
    function cleanPuzzle(md) {
      return md.replace(/^---[\s\S]*?\n---\n/, '')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?[^>]+>/g, '')
        .replace(/\n{3,}/g, '\n\n').trim();
    }
    function pathStr() { return '/' + cwd; }
    // PowerShell maps the section to a Windows path: C:\Users\guest[\section].
    function winPath() { return 'C:\\Users\\guest' + (cwd ? '\\' + cwd.replace(/\//g, '\\') : ''); }
    function psActive() { return root.classList.contains('term--ps'); }   // PowerShell skin live state (toggled by `theme`)
    function promptMarkup() {
      return psActive() ? ('PS ' + winPath() + '>') : ('<b>guest@teamleads</b>:' + pathStr() + '$');
    }
    function setPrompt() {
      if (promptEl) promptEl.innerHTML = promptMarkup();
      if (titleEl) titleEl.textContent = psActive() ? ('Windows PowerShell – ' + winPath()) : ('guest@teamleads: ' + pathStr());
    }
    function go(href) { print(''); print('переход → ' + href, 'ok'); setTimeout(function () { w.location.href = href; }, reduced ? 0 : 360); }

    // Footer for `discuss`: a one-click deep-dive into the assistant + the live-meetup nudge.
    function discussFooter(item) {
      print('────────────────────────────', 'dim');
      var row = el('span'); row.appendChild(el('span', 'dim', 'Разобрать глубже: '));
      var qShort = item.q.length > 44 ? item.q.slice(0, 44) + '…' : item.q;
      var a = el('a', null, 'claude «' + qShort + '»'); a.href = 'javascript:void(0)';
      a.addEventListener('click', function (e) { e.preventDefault(); run('claude ' + item.q); });
      row.appendChild(a); printNode(row);
      print('Обсудить вживую: join – среда 17:00 (Астана) · ещё тема – discuss', 'hint');
    }

    // Markdown line renderer for `cat`: colorizes headings, quotes, lists, links,
    // and inline **bold** / *em* / `code` so long pages read like a document, not a wall.
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

    // ── Тимлид-симулятор: an interactive panel mode. Instead of streaming
    //    append-only lines, it takes over the terminal body with a card that
    //    re-renders in place on each step. Scenarios come from data-scenarios.
    var simSt = null;   // { list, idx, score, phase: 'choice'|'outcome'|'done', chosen }
    var SIM = null;     // active dataset (SCEN for sim, a quiz for `quiz`); set in simStart
    var simToastT = null;

    // ── nano: a modal editor for the user FS. Like sim, it OWNS the keyboard while
    //    open (editorSt gates the prompt). ^O writes back to localStorage, ^X exits.
    var editorSt = null;   // { path, dirty }
    function nanoStart(path) {
      if (!edPanel || !edArea) { print('nano: редактор недоступен на этой странице. Откройте /shell/.', 'err'); return; }
      var existing = ufs.nodes[path];
      if (existing && existing.type === 'dir') { print('nano: /' + path + ' – это каталог', 'err'); return; }
      var content = existing ? (existing.content || '') : '';
      // seed from a baked page? no – nano edits the user FS only; baked stays read-only.
      editorSt = { path: path, dirty: false };
      edName.textContent = '  GNU nano · /' + path + (existing ? '' : '  (новый)');
      edArea.value = content;
      edPanel.hidden = false;
      nanoMeta();
      try { edArea.focus({ preventScroll: true }); } catch (e) { edArea.focus(); }
      edArea.setSelectionRange(content.length, content.length);
    }
    function nanoMeta() {
      if (!editorSt || !edMeta) return;
      var v = edArea.value;
      edMeta.textContent = (editorSt.dirty ? '● ' : '') + v.length + ' Б · ' + (v ? v.split('\n').length : 0) + ' строк  ^O Сохранить · ^X Выход';
    }
    function nanoSave() {
      if (!editorSt) return;
      var now = ufsNow(), node = ufs.nodes[editorSt.path];
      if (node && node.type === 'file') { node.content = edArea.value; node.mtime = now; }
      else {
        var parent = parentOf(editorSt.path);
        if (parent !== '' && !isDir(parent)) { /* create missing parents so save never fails */ ensureDir(parent, ufsUser(), now); }
        ufs.nodes[editorSt.path] = { type: 'file', content: edArea.value, ctime: now, mtime: now, author: ufsUser() };
        delete ufs.tombs[editorSt.path];
      }
      ufsSave();
      editorSt.dirty = false; nanoMeta();
    }
    function nanoExit() {
      var path = editorSt && editorSt.path, wasDirty = editorSt && editorSt.dirty;
      editorSt = null;
      if (edPanel) { edPanel.hidden = true; }
      if (edArea) edArea.value = '';
      input.focus();
      print('nano: ' + (wasDirty ? 'выход без сохранения · ' : '') + '/' + path + ' закрыт. cat ' + (path || '') + ' – посмотреть.', 'dim');
    }
    function copyText(t) {
      if (w.navigator && w.navigator.clipboard && w.navigator.clipboard.writeText) return w.navigator.clipboard.writeText(t);
      return new Promise(function (res, rej) {
        try { var ta = d.createElement('textarea'); ta.value = t; ta.style.position = 'absolute'; ta.style.left = '-9999px'; d.body.appendChild(ta); ta.select(); var ok = d.execCommand('copy'); d.body.removeChild(ta); ok ? res() : rej(new Error('copy')); } catch (e) { rej(e); }
      });
    }
    function simLink(ref) {
      if (!ref) return null;
      var p = ref.split('/'), sec = p[0], name = p[1], hit = null;
      if (sec && sections[sec]) sections[sec].forEach(function (it) { if (it.n === name) hit = it; });
      if (!hit) pool.forEach(function (it) { if (it.n === name) hit = it; });
      return hit;
    }
    function simBtn(label, cls, onclick) { var b = el('button', 'sim-btn' + (cls ? ' ' + cls : ''), label); b.type = 'button'; b.onclick = onclick; return b; }
    function simToast(msg) {
      var t = simPanel && simPanel.querySelector('.sim-toast'); if (!t) return;
      t.textContent = msg; t.classList.add('show');
      clearTimeout(simToastT); simToastT = setTimeout(function () { t.classList.remove('show'); }, 2000);
    }
    function simFocus() { if (!simPanel) return; try { simPanel.focus({ preventScroll: true }); } catch (e) { simPanel.focus(); } }
    function simStart(set) {
      if (!simPanel) { print('sim: панель недоступна на этой странице.', 'err'); return; }
      SIM = set || SCEN;
      var list = (SIM.scenarios || []).slice();
      if (!list.length) { print((SIM.slug || 'sim') + ': вопросы не загружены', 'err'); return; }
      if (SIM.shuffle !== false) { for (var i = list.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = list[i]; list[i] = list[j]; list[j] = t; } }
      list = list.slice(0, SIM.limit || 6);
      simSt = { list: list, idx: 0, score: 0, phase: 'choice', chosen: null };
      body.style.display = 'none';
      if (keysBar) keysBar.style.display = 'none';
      simPanel.hidden = false;
      if (titleEl) titleEl.textContent = 'guest@teamleads: ~/' + (SIM.slug || 'sim');
      simRender();
      simPanel.focus();
    }
    function simExit() {
      simSt = null;
      if (simPanel) { simPanel.hidden = true; simPanel.innerHTML = ''; }
      body.style.display = '';
      if (keysBar) keysBar.style.display = '';
      setPrompt();
      input.focus();
    }
    function simPick(i) {
      if (!simSt || simSt.phase !== 'choice') return;
      var o = simSt.list[simSt.idx].options[i]; if (!o) return;
      simSt.chosen = i; if (o.good) simSt.score++;
      simSt.phase = 'outcome'; simRender();
    }
    function simAdvance() {
      if (!simSt) return;
      if (simSt.phase === 'outcome') {
        simSt.idx++;
        if (simSt.idx >= simSt.list.length) simSt.phase = 'done';
        else { simSt.phase = 'choice'; simSt.chosen = null; }
        simRender();
      } else if (simSt.phase === 'done') simStart(SIM);
    }
    function simShareUI() {
      var slug = SIM.slug || 'sim';
      var url = SIM.shareUrl || (w.location.origin + '/shell/#' + slug);
      var label = SIM.shareLabel || 'Тимлид-симулятор';
      var played = simSt.phase === 'done' || simSt.idx > 0 || simSt.phase === 'outcome';
      var txt = played ? (label + ': ' + simSt.score + '/' + simSt.list.length + '. Пройди и ты: ' + url)
        : (label + ': ' + url);
      copyText(txt).then(function () { simToast('Ссылка скопирована'); }, function () { simToast('Не удалось скопировать'); });
    }
    function simHead() {
      var head = el('div', 'sim-head');
      head.appendChild(el('span', 'sim-kicker', SIM.title || 'Тимлид-симулятор'));
      head.appendChild(el('span', 'sim-progress', simSt.phase === 'done' ? 'итог' : (simSt.idx + 1) + ' / ' + simSt.list.length));
      head.appendChild(simBtn('✕', 'sim-x', simExit));
      simPanel.appendChild(head);
      var bar = el('div', 'sim-bar'), fill = el('span');
      var done = simSt.idx + (simSt.phase === 'outcome' || simSt.phase === 'done' ? 1 : 0);
      fill.style.width = Math.round(done / simSt.list.length * 100) + '%';
      bar.appendChild(fill); simPanel.appendChild(bar);
    }
    function simRender() {
      if (!simPanel) return;
      simPanel.innerHTML = '';
      simHead();
      if (simSt.phase === 'done') { simRenderDone(); simPanel.appendChild(el('div', 'sim-toast')); simFocus(); return; }
      var s = simSt.list[simSt.idx];
      var pr = el('div', 'sim-prompt');
      String(s.prompt || '').split('\n').forEach(function (l) { if (l.trim()) pr.appendChild(el('p', null, l.trim())); });
      simPanel.appendChild(pr);
      var opts = el('div', 'sim-opts');
      s.options.forEach(function (o, i) {
        var b = el('button', 'sim-opt'); b.type = 'button';
        b.appendChild(el('span', 'sim-opt-key', String.fromCharCode(97 + i)));
        b.appendChild(el('span', 'sim-opt-label', o.label));
        if (simSt.phase === 'outcome') {
          b.disabled = true;
          if (i === simSt.chosen) b.className += o.good ? ' is-good' : ' is-bad';
          else if (o.good) b.className += ' is-answer';
        } else {
          b.onclick = (function (idx) { return function () { simPick(idx); }; })(i);
        }
        opts.appendChild(b);
      });
      simPanel.appendChild(opts);
      if (simSt.phase === 'choice') {
        simPanel.appendChild(el('p', 'sim-hint', 'Выберите вариант – клик или клавиша a / b / c'));
        simFocus(); return;
      }
      var o = s.options[simSt.chosen];
      var res = el('div', 'sim-result');
      var verdict = el('p', 'sim-outcome ' + (o.good ? 'is-good' : 'is-bad'));
      verdict.appendChild(el('span', 'sim-mark', o.good ? '✓' : '✗'));
      verdict.appendChild(d.createTextNode(' ' + o.outcome));
      res.appendChild(verdict);
      if (s.lesson) { var ls = el('p', 'sim-lesson'); ls.appendChild(d.createTextNode('💡 ' + s.lesson)); res.appendChild(ls); }
      if (o.votes != null) {
        var vr = el('div', 'sim-votes');
        var vbar = el('span', 'sim-votebar'), vf = el('span'); vf.style.width = o.votes + '%'; vbar.appendChild(vf);
        vr.appendChild(vbar); vr.appendChild(el('span', 'sim-votenum', 'так выбрали ' + o.votes + '%'));
        res.appendChild(vr);
      }
      var hit = simLink(s.link);
      if (hit) { var rm = el('div', 'sim-readmore'); rm.appendChild(el('span', 'dim', 'разбор → ')); rm.appendChild(link(hit.u, hit.t)); res.appendChild(rm); }
      simPanel.appendChild(res);
      var last = simSt.idx >= simSt.list.length - 1;
      var acts = el('div', 'sim-actions');
      acts.appendChild(simBtn(last ? 'Итог →' : 'Дальше →', 'primary', simAdvance));
      acts.appendChild(simBtn('Поделиться', '', simShareUI));
      acts.appendChild(simBtn('Выйти', 'ghost', simExit));
      simPanel.appendChild(acts);
      simPanel.appendChild(el('div', 'sim-toast'));
      simFocus();
    }
    function simRenderDone() {
      var n = simSt.list.length, sc = simSt.score;
      var card = el('div', 'sim-done');
      card.appendChild(el('p', 'sim-score', 'ИТОГ: ' + sc + ' / ' + n + ' ' + (SIM.scoreLabel || 'разумных решений')));
      var v = SIM.verdicts || ['Чистый прогон. Тимлид не кодит – тимлид анблокает.', 'Крепко. Но часть развилок стоит обсудить вживую.', 'Есть над чем подумать – как раз тема для встречи.'];
      var vi = sc === n ? 0 : (sc >= Math.ceil(n / 2) ? 1 : 2);
      card.appendChild(el('p', 'sim-verdict', v[vi]));
      var funnel = el('div', 'sim-funnel');
      funnel.appendChild(d.createTextNode('Продолжить вживую: '));
      var j = el('a', null, 'join'); j.href = '/join/'; funnel.appendChild(j);
      funnel.appendChild(d.createTextNode(' · ')); funnel.appendChild(link(TG, 'telegram', true));
      card.appendChild(funnel);
      var acts = el('div', 'sim-actions');
      acts.appendChild(simBtn('Ещё раз', 'primary', simStart));
      acts.appendChild(simBtn('Поделиться', '', simShareUI));
      acts.appendChild(simBtn('Выйти', 'ghost', simExit));
      card.appendChild(acts);
      simPanel.appendChild(card);
    }

    // ── salary: live market data from techinterview.space via the shared
    //    TeamleadsSalary module, with the static community model as an offline
    //    fallback. salaryLive renders charts/analytics; salaryNudge always asks
    //    the visitor to contribute their own salary so the sample improves.
    function salFmt(v, cur) { return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ' + (cur || '₸'); }
    function salMoney(v) {
      v = Number(v);
      if (v >= 1e6) { var m = v / 1e6; return (m % 1 ? m.toFixed(2).replace(/0+$/, '').replace(/\.$/, '') : m.toFixed(0)) + 'M'; }
      return Math.round(v / 1e3) + 'k';
    }
    function salBar(ch, count, max, width) { var n = max ? Math.max(count > 0 ? 1 : 0, Math.round(count / max * width)) : 0; return new Array(n + 1).join(ch); }
    function salaryNudge() {
      var url = (w.TeamleadsSalary && w.TeamleadsSalary.CONTRIBUTE_URL) || 'https://techinterview.space/salaries';
      var n = el('span'); n.appendChild(el('span', 'accent', '📊 '));
      n.appendChild(d.createTextNode('В выборке нет твоей вилки? Добавь анонимно за пару минут → '));
      n.appendChild(link(url, 'techinterview.space/salaries', true));
      printNode(n);
      print('Чем больше анкет – тем точнее цифры для всего сообщества. Прямо здесь: submit salary', 'dim');
    }
    function salaryLive(grade, role, cities, skills) {
      var S = w.TeamleadsSalary, titles = SAL.roleTitles || {};
      var loading = print('запрашиваю свежие данные с techinterview.space…', 'dim');
      S.chart({ grade: grade, profession: role, cities: cities, skills: skills }).then(function (res) {
        if (loading && loading.parentNode) loading.parentNode.removeChild(loading);
        if (!res || !res.count) { print('salary: по такому фильтру данных нет – показываю оценку сообщества.', 'dim'); salaryOffline(grade, role); return; }
        var rate = res.usdRate, q = res.query || {};
        function usd(v) { return rate ? ' (~$' + String(S.toUSD(v, rate)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ')' : ''; }
        var roleLabel = role ? (titles[role] || S.PROF_LABEL[S.resolveProfession(role)] || role) : '';
        var gradeLabel = grade ? (q.gradeLabel || grade) : '';
        var head = [roleLabel, gradeLabel].concat(q.cityLabels || [], q.skillLabels || []).filter(Boolean).join(' · ') || 'Весь рынок IT · РК';
        print('💰 ' + head + ' · нетто/мес', 'accent');
        print('живые данные · ' + res.count + ' зарплат · обновлено ' + res.updated + (res._cached ? ' · из кеша' : ''), 'dim');
        print('────────────────────────────────────────', 'dim');
        print('  медиана  ' + salFmt(res.median) + usd(res.median));
        print('  среднее  ' + salFmt(res.average) + usd(res.average), 'dim');
        if (res.remoteMedian) {
          var prem = res.median ? Math.round((res.remoteMedian / res.median - 1) * 100) : 0;
          print('  ремоут   ' + salFmt(res.remoteMedian) + (prem > 0 ? '  +' + prem + '% к локальному рынку' : ''), 'cy');
        }
        if (!grade && res.byGrade && res.byGrade.length) {
          print('────────────────────────────────────────', 'dim');
          print('Грейд-лестница (медиана):', 'accent');
          var topG = Math.max.apply(null, res.byGrade.map(function (g) { return g.median; })) || 1;
          res.byGrade.forEach(function (g) {
            print('  ' + pad(g.label, 8) + salBar('█', g.median, topG, 16) + '  ' + salFmt(g.median) + '  · ' + g.count);
          });
        }
        if (res.histogram && res.histogram.items && res.histogram.items.length) {
          print('────────────────────────────────────────', 'dim');
          print('Распределение (локальный рынок · нетто/мес):', 'accent');
          var h = res.histogram, mx = Math.max.apply(null, h.items) || 1;
          h.labels.forEach(function (lab, i) {
            var c = h.items[i] || 0;
            var rng = i === 0 ? 'до ' + salMoney(lab) : salMoney(h.labels[i - 1]) + '–' + salMoney(lab);
            print('  ' + pad(rng, 12) + salBar('▓', c, mx, 16) + ' ' + c + ' чел.', c ? null : 'dim');
          });
          print('  столбик = число анкет в диапазоне; самые высокие (>' + salMoney(h.labels[h.labels.length - 1]) + ') в график не попали', 'dim');
        }
        print('────────────────────────────────────────', 'dim');
        salaryNudge();
        print('Уточнить: salary <грейд> <роль> <город> <скилл> · Tab – подсказки. Напр.: salary senior backend almaty', 'hint');
        print('Полная страница с графиками: open salary', 'dim');
      }).catch(function (e) {
        if (loading && loading.parentNode) loading.parentNode.removeChild(loading);
        print('salary: сервис недоступен (' + e.message + ') – показываю оценку сообщества.', 'dim');
        salaryOffline(grade, role);
      });
    }
    function salaryOffline(grade, role) {
      var grades = SAL.grades || {}, roles = SAL.roles || {}, titles = SAL.roleTitles || {};
      if (!Object.keys(grades).length || !Object.keys(roles).length) { print('salary: данные о зарплатах не загружены', 'err'); return; }
      if (!grade) { grade = 'senior'; print('грейд не указан – беру senior', 'dim'); }
      if (!role) { role = 'backend'; print('роль не указана – беру backend', 'dim'); }
      var base = grades[grade], k = roles[role];
      if (!base || k == null) { print('salary: нет данных для этой пары', 'err'); return; }
      var vals = base.map(function (v) { return Math.round(v * k / 10000) * 10000; });
      var cur = SAL.currency || '₸', top = vals[2] || 1;
      function bar(v) { var ww = Math.max(1, Math.round(v / top * 14)); return new Array(ww + 1).join('▓') + new Array(14 - ww + 1).join('░'); }
      print((titles[role] || role) + ' · ' + grade + ' · ' + (SAL.unit || '') + ' (оценка сообщества)', 'accent');
      print('────────────────────────────────────────', 'dim');
      [['p25', vals[0]], ['med', vals[1]], ['p75', vals[2]]].forEach(function (r) {
        print('  ' + pad(r[0], 5) + bar(r[1]) + '   ' + salFmt(r[1], cur));
      });
      print('────────────────────────────────────────', 'dim');
      if (SAL.disclaimer) print(SAL.disclaimer, 'dim');
      salaryNudge();
    }
    function submitSalary() {
      var url = 'https://techinterview.space/salaries/add-new';
      try { if (w.ym) w.ym(106055675, 'reachGoal', 'salary_submit', { source: 'shell' }); } catch (e) {}
      print('Поделиться своей зарплатой – анонимно, пара минут.', 'accent');
      print('Откроется форма techinterview.space. Нужна авторизация (вход через GitHub/Google).', 'dim');
      printNode(link(url, url, true));
      print('Чем больше анкет – тем точнее цифры в salary для всего сообщества.', 'dim');
      w.open(url, '_blank', 'noopener');
    }

    // ── man pages: single source for `man`, `whatis`, `apropos`. Each value is a
    //    one-paragraph "<name> – описание." Hoisted so the meta-commands can search it.
    var MANPAGES = {
      ls: 'ls [путь] – содержимое каталога: материалы сайта и ваши файлы вместе (union). Каталоги, затем файлы. ls <раздел> [N] – с пагинацией.',
      cd: 'cd <путь> – перейти в каталог. Поддерживает вложенные пути (cd projects/sub), .. наверх, / и ~ в корень, cd - – предыдущий каталог.',
      open: 'open <страница> – открыть страницу сайта в браузере.',
      cat: 'cat <файл> – показать markdown-версию страницы сайта с подсветкой ИЛИ содержимое вашего файла. cat <файл> --raw – без подсветки.',
      mkdir: 'mkdir [-p] <каталог>… – создать каталог в вашей файловой системе (localStorage). -p создаёт промежуточные каталоги. Можно и внутри разделов сайта.',
      touch: 'touch <файл>… – создать пустой файл или обновить время изменения. Файлы хранятся в браузере (localStorage) с автором и датой.',
      rm: 'rm [-r] <путь>… – удалить ваш файл или каталог (-r рекурсивно). Материал сайта rm только скрывает в вашем виде (whiteout), исходник цел. rm -rf / по-прежнему пасхалка.',
      rmdir: 'rmdir <каталог>… – удалить пустой каталог.',
      mv: 'mv <откуда> <куда> – переместить/переименовать ваш файл или каталог. Если <куда> – существующий каталог, перемещает внутрь.',
      cp: 'cp [-r] <откуда> <куда> – скопировать ваш файл/каталог (-r рекурсивно). cp <материал сайта> <имя> делает редактируемую копию страницы в вашей ФС.',
      nano: 'nano <файл> – создать или редактировать файл в браузере. ^O сохранить, ^X сохранить и выйти, Esc выйти без сохранения. Хранится в localStorage с автором и датой.',
      head: 'head [-n N] <страница> – первые N строк markdown-страницы (по умолчанию 10).',
      tail: 'tail [-n N] <страница> – последние N строк markdown-страницы (по умолчанию 10).',
      wc: 'wc <страница> – подсчёт строк, слов и символов страницы + оценка времени чтения.',
      stat: 'stat <страница> – метаданные страницы: раздел, дата, ссылка, объём, время чтения.',
      pwd: 'pwd – текущий путь.',
      tree: 'tree – всё дерево сайта со счётчиками.',
      find: 'find <запрос> – ранжированный поиск по всем материалам (по релевантности).',
      grep: 'grep <запрос> – полнотекстовый ранжированный поиск по всем страницам. grep --exact <строка> (или -e) – буквальная подстрока.',
      latest: 'latest – открыть последнюю встречу.',
      random: 'random – открыть случайный материал.',
      discuss: 'discuss – случайная тема для обсуждения из бэклога /questions/ + что есть по ней в архиве. Синонимы: topic, тема, обсудить.',
      tools: 'tools – топ инструментов сообщества.',
      toolkit: 'toolkit – рабочие шаблоны (1-on-1, ретро, постмортем, найм, ADR). cat toolkit/<имя> – открыть шаблон здесь.',
      voices: 'voices – реальные реплики участников из чата сообщества.',
      companies: 'companies [поиск] – рейтинг компаний РК по отзывам (techinterview.space).',
      company: 'company <имя> – отзывы о компании в терминале + ссылка на источник.',
      addreview: 'addreview <имя> – открыть форму отзыва о компании на techinterview.space.',
      salary: 'salary [грейд] [роль] – зарплаты рынка РК: живые данные techinterview.space (медиана, среднее, ремоут-премия, грейд-лестница, распределение). Без аргументов – обзор всего рынка. Напр.: salary senior backend. При офлайне – оценка сообщества. salary submit – добавить свою вилку.',
      submit: 'submit <salary|review|project> – отправить данные сообществу: свою зарплату (salary), отзыв о компании (review <имя>) или проект в витрину (project).',
      showcase: 'showcase – витрина проектов участников. showcase submit – открыть инструкцию SHOWCASE.md (форк → шаблон → Pull Request).',
      sim: 'sim – тимлид-симулятор: развилки из реальных споров сообщества. Выбор a/b/c, [s] поделиться, [q] выйти. Синоним: simulator.',
      games: 'games – список игр сообщества. games <имя> – запустить. sim – в терминале, sudoku – в отдельном окне. Синонимы: game, play, arcade.',
      sudoku: 'sudoku – классическое судоку 9×9 в отдельном окне: грейды сложности, подсказки, проверка, таймер. То же, что games sudoku.',
      fun: 'fun [имя] [codex] – инженерные задачки сообщества. Без имени – список. fun <имя> открывает условие в ассистенте Claude (или Codex) и скачивает файл задачки. Синонимы: puzzles, задачки.',
      principles: 'principles – доктрина сообщества: принципы управления, выжатые из реальных кейсов и статей. Синонимы: doctrine, manifesto.',
      friends: 'friends – дружественные сообщества и сервисы (Claude Community KZ, techinterview.space).',
      claude: 'claude <вопрос> – Claude-окно: офлайн-ответ по материалам сообщества. Ищет по полному тексту (как grep), показывает сниппеты и ссылки.',
      codex: 'codex <вопрос> – Codex-окно: офлайн-ответ по материалам сообщества. Ищет по полному тексту (как grep), показывает сниппеты и ссылки.',
      join: 'join – ссылка на еженедельную встречу.',
      telegram: 'telegram – открыть Telegram сообщества.',
      contribute: 'contribute – открыть репозиторий сайта на GitHub (правки, PR). Синонимы: github, gh, pr.',
      feedback: 'feedback [текст] – открыть форму нового issue на GitHub с предзаполненным текстом. Синоним: bug.',
      theme: 'theme [ps|bash] – переключить оформление терминала (PowerShell/стандартное). Выбор сохраняется в браузере.',
      git: 'git <команда> – сайт как git-репозиторий сообщества: log (лента материалов как коммиты), show, diff (что нового с прошлой встречи), blame <стр> и shortlog (авторство), branch и checkout (разделы как ветки), status, remote, pull, grep, clone. git help – полный список. Плюс пасхалки: commit, reset, stash, rebase, merge, config.',
      share: 'share – скопировать ссылку на последнюю команду (страница /s/<id>/ с OG-карточкой).',
      whoami: 'whoami – кто такие «Тимлид не кодит». Синоним: about.',
      apropos: 'apropos <слово> – найти команды по описанию. Напр.: apropos зарплат. Синоним: справка.',
      whatis: 'whatis <команда> – короткое описание команды одной строкой.',
      which: 'which <имя> – к какой команде сводится имя (и алиас ли это).',
      alias: 'alias [имя] – список псевдонимов команд или цель конкретного алиаса.',
      man: 'man <команда> – подробная справка по команде. Синонимы тоже понимает.',
      neofetch: 'neofetch – сводка о «системе» сообщества.',
      date: 'date – текущие дата и время.',
      echo: 'echo <текст> – вывести текст.',
      history: 'history – список введённых команд.',
      clear: 'clear – очистить экран (Ctrl+L). Синоним: cls.',
      fortune: 'fortune – случайная мудрость тимлида.',
      vim: 'vim – открыть редактор. Выход: :q (если повезёт).',
      sudo: 'sudo – для guest недоступно.',
      help: 'help – список всех команд.'
    };

    // ── alias table: registering through alias() keeps a name→target map (for `which`
    //    and `alias`) and refuses to clobber an existing command – the guard that would
    //    have caught the historical `submit`→`addreview` collision.
    var ALIASES = {};
    function alias(name, target) {
      if (Object.prototype.hasOwnProperty.call(commands, name) && !ALIASES[name]) {
        try { if (w.console) w.console.warn('shell: alias "' + name + '" перекрывает команду'); } catch (e) {}
        return;
      }
      commands[name] = commands[target]; ALIASES[name] = target;
    }
    function canonName(name) { var seen = {}; while (ALIASES[name] && !seen[name]) { seen[name] = 1; name = ALIASES[name]; } return name; }

    // ── git: the site modeled as a content repository. The top-level `git` command is a
    //    multiplexer that dispatches into GIT. Real subcommands (log, show, diff, blame,
    //    shortlog, branch, checkout, status, remote, pull, grep, clone) reuse the same
    //    $fs/sections the filesystem commands walk; the rest keep the shell's voice.
    var GH = 'https://github.com/belyaevsa/teamleads-2025';
    // Deterministic 7-char hex "commit hash" from a page url (djb2). Cosmetic, stable per page.
    function gitHash(s) {
      var h = 5381; s = String(s || '');
      for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
      var hex = (h >>> 0).toString(16); while (hex.length < 7) hex = '0' + hex;
      return hex.slice(0, 7);
    }
    // dd.mm.yyyy → sortable yyyymmdd integer (0 when unparseable).
    function gitDateKey(d) { var m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(d || ''); return m ? +(m[3] + m[2] + m[1]) : 0; }
    // Every page as a commit row {it, sec}, newest first; optionally filtered to one section.
    function gitCommits(section) {
      var rows = [];
      sectionNames.forEach(function (s) {
        if (section && s !== section) return;
        (sections[s] || []).forEach(function (it) { rows.push({ it: it, sec: s }); });
      });
      rows.sort(function (a, b) { return gitDateKey(b.it.d) - gitDateKey(a.it.d); });
      return rows;
    }
    function gitAuthor(it) { return it.a || 'Сообщество «Тимлид не кодит»'; }
    function gitPeople(it) { return (it.p && it.p.length) ? it.p : [gitAuthor(it)]; }
    function gitHelp() {
      print('git <команда> – сайт как git-репозиторий сообщества.', 'accent');
      print('');
      print('ИСТОРИЯ', 'accent');
      [['log [раздел]', 'лента материалов как коммиты (--oneline)'],
       ['show <стр>', 'материал как коммит: автор, дата, текст'],
       ['diff', 'что нового с прошлой встречи'],
       ['blame <стр>', 'кто за материалом (участники / автор)'],
       ['shortlog', 'вклад участников по числу материалов']
      ].forEach(function (r) { print('  ' + pad(r[0], 18) + r[1]); });
      print(''); print('ВЕТКИ И РЕМОУТ', 'accent');
      [['branch', 'разделы сайта как ветки'],
       ['checkout <раздел>', 'перейти в раздел (= cd)'],
       ['status', 'где вы и что в бэклоге обсуждений'],
       ['remote -v', 'GitHub, Telegram, друзья'],
       ['pull', 'последняя встреча'],
       ['grep <запрос>', 'поиск по материалам'],
       ['clone', 'открыть репозиторий на GitHub']
      ].forEach(function (r) { print('  ' + pad(r[0], 18) + r[1]); });
      print('');
      print('Пасхалки: git commit · reset --hard · stash · rebase · merge · config · init · tag', 'dim');
    }
    var GIT = {
      log: function (rest) {
        rest = (rest || []).slice();
        var pg = 1;
        for (var i = rest.length - 1; i >= 0; i--) { if (/^\d+$/.test(rest[i])) { pg = parseInt(rest[i], 10); rest.splice(i, 1); break; } }
        var oneline = rest.indexOf('--oneline') !== -1;
        rest = rest.filter(function (x) { return x && x.charAt(0) !== '-'; });
        var sec = rest[0];
        if (sec && !sections[sec]) { print("git log: нет такой ветки: " + sec + ". git branch – список.", 'err'); return; }
        var rows = gitCommits(sec);
        if (!rows.length) { print('git log: пока пусто', 'dim'); return; }
        var p = paginate(rows, pg, oneline ? 16 : 8);
        p.slice.forEach(function (r) {
          var hash = gitHash(r.it.u);
          if (oneline) {
            var n = el('span'); n.appendChild(el('span', 'accent', hash + ' '));
            n.appendChild(link(r.it.u, r.it.t)); n.appendChild(el('span', 'dim', '  (' + r.sec + ' · ' + r.it.d + ')')); printNode(n);
          } else {
            print('commit ' + hash + '  (' + r.sec + ')', 'accent');
            print('Author: ' + gitAuthor(r.it), 'dim');
            print('Date:   ' + r.it.d, 'dim');
            var n2 = el('span'); n2.appendChild(el('span', 'dim', '    ')); n2.appendChild(link(r.it.u, r.it.t)); printNode(n2);
            print('');
          }
        });
        pageNav(p, 'git log' + (sec ? ' ' + sec : '') + (oneline ? ' --oneline' : ''));
      },
      show: function (rest) {
        var arg = (rest || [])[0];
        var hit = resolvePage(arg);
        if (!hit) { print('git show: не найдено: ' + (arg || '') + '. git log – список коммитов.', 'err'); return; }
        print('commit ' + gitHash(hit.u), 'accent');
        print('Author: ' + gitAuthor(hit), 'dim');
        print('Date:   ' + hit.d, 'dim');
        print('');
        commands.cat([arg]);
      },
      diff: function () {
        var evs = gitCommits('events');
        if (evs.length < 2) { print('git diff: недостаточно встреч для сравнения', 'dim'); return; }
        var cur = evs[0].it, prev = evs[1].it;
        print('diff ' + gitHash(prev.u) + '..' + gitHash(cur.u) + '  (с прошлой встречи ' + prev.d + ')', 'accent');
        var lo = gitDateKey(prev.d), hi = gitDateKey(cur.d);
        var added = gitCommits().filter(function (r) { var k = gitDateKey(r.it.d); return k > lo && k <= hi; });
        if (!added.length) { print('нет новых материалов с ' + prev.d, 'dim'); return; }
        added.forEach(function (r) {
          var n = el('span'); n.appendChild(el('span', 'ok', '+ ')); n.appendChild(link(r.it.u, r.it.t));
          n.appendChild(el('span', 'dim', '  (' + r.sec + ' · ' + r.it.d + ')')); printNode(n);
        });
        print('');
        print(added.length + ' добавлено · git log – вся история', 'dim');
      },
      status: function () {
        var branch = cwd || 'master';
        print('On branch ' + branch, 'accent');
        print("Your branch is up to date with 'origin/" + branch + "'.", 'dim');
        print('');
        print('Рабочая директория: ' + (cwd ? '/' + cwd : '/ (корень)'));
        if (cwd && sections[cwd]) print('  отслеживается материалов: ' + (sections[cwd] || []).length, 'dim');
        print('');
        if (QUESTIONS && QUESTIONS.length) {
          print('Untracked questions (открытый бэклог обсуждений):');
          print('  ' + QUESTIONS.length + ' тем ждут разбора  →  discuss', 'hint');
        } else {
          print('nothing to commit, working tree clean', 'ok');
        }
        print('');
        print('история: git log · ветки: git branch · что нового: git diff', 'dim');
      },
      branch: function () {
        print('Ветки (разделы) сайта:', 'dim');
        if (!cwd) {
          var n0 = el('span'); n0.appendChild(el('span', 'ok', '* master'));
          n0.appendChild(el('span', 'dim', '   – корень сайта')); printNode(n0);
        }
        sectionNames.forEach(function (s) {
          var on = (s === cwd), n = el('span');
          n.appendChild(el('span', on ? 'ok' : 'dim', on ? '* ' : '  '));
          n.appendChild(link('/' + s + '/', s));
          n.appendChild(el('span', 'dim', '  ' + (sections[s] || []).length + ' коммитов'));
          printNode(n);
        });
        print('git checkout <ветка> – перейти в раздел', 'hint');
      },
      checkout: function (rest) {
        var t = (rest || [])[0];
        if (!t) { print('git checkout <ветка>. git branch – список веток.', 'dim'); return; }
        if (t === '-b') { print('git checkout -b: новые ветки заводим через Pull Request → contribute', 'dim'); return; }
        t = t.replace(/^\/|\/$/g, '');
        if (t === 'master' || t === 'main') { commands.cd([]); print("Switched to branch '" + t + "'", 'ok'); return; }
        if (!sections[t]) { print("error: pathspec '" + t + "' did not match. git branch – список веток.", 'err'); return; }
        commands.cd([t]); print("Switched to branch '" + t + "'", 'ok');
      },
      remote: function (rest) {
        var v = !!(rest && (rest[0] === '-v' || rest[0] === '--verbose'));
        function row(name, url, tag) {
          var n = el('span'); n.appendChild(el('span', 'accent', pad(name, 11)));
          n.appendChild(link(url, url, true));
          if (v && tag) n.appendChild(el('span', 'dim', ' (' + tag + ')'));
          printNode(n);
        }
        row('origin', GH, 'fetch');
        if (v) row('origin', GH, 'push');
        row('telegram', TG, 'community');
        (FRIENDS || []).forEach(function (f) { row(f.n, f.u, 'friend'); });
        if (!v) print('git remote -v – с метками fetch/push', 'dim');
      },
      pull: function () {
        var evs = gitCommits('events');
        if (evs.length) { print('From ' + GH, 'dim'); print('Fast-forward → ' + evs[0].it.d, 'ok'); }
        commands.latest([]);
      },
      grep: function (rest) { commands.grep(rest || []); },
      clone: function () { print("Cloning into 'teamleads-2025'…", 'dim'); commands.contribute([]); },
      blame: function (rest) {
        var arg = (rest || [])[0];
        if (!arg) { print('fatal: винить некого – 404 это не баг, а фича вашего URL.', 'dim'); print('git blame <страница> – кто за материалом. git log – список.', 'hint'); return; }
        var hit = resolvePage(arg);
        if (!hit) { print('git blame: не найдено: ' + arg + '. git log – список.', 'err'); return; }
        var hash = gitHash(hit.u);
        gitPeople(hit).forEach(function (name) { print(hash + ' (' + pad(name, 18) + hit.d + ')  ' + hit.t); });
        print('git show ' + hit.n + ' – открыть коммит', 'dim');
      },
      shortlog: function () {
        var tally = {};
        gitCommits().forEach(function (r) { gitPeople(r.it).forEach(function (name) { tally[name] = (tally[name] || 0) + 1; }); });
        var rows = Object.keys(tally).map(function (k) { return { name: k, n: tally[k] }; });
        rows.sort(function (a, b) { return b.n - a.n || a.name.localeCompare(b.name); });
        print('Вклад участников (git shortlog -sn):', 'dim');
        rows.slice(0, 20).forEach(function (r) { print('  ' + pad(String(r.n), 5) + r.name); });
        print('');
        print('всего участий: ' + rows.reduce(function (s, r) { return s + r.n; }, 0) + ' · git blame <стр> – по материалу', 'dim');
      },
      // ── voice-keeping easter eggs ──
      commit: function () { print('nothing to commit, working tree clean.', 'dim'); print('Тимлид не коммитит. Тимлид ревьюит и анблокает.', 'accent'); },
      push: function () { print('Everything up-to-date. А страница всё равно не та.', 'dim'); },
      reset: function (rest) {
        if (/--hard/.test(' ' + (rest || []).join(' '))) { print('git reset --hard: историю не перепишешь – факапы остаются в постмортемах.', 'dim'); return; }
        print('git reset: тимлид ничего не сбрасывает. Только спринты.', 'dim');
      },
      stash: function (rest) {
        if ((rest || [])[0] === 'pop') { print('git stash pop: техдолг вернулся в самый неподходящий момент.', 'dim'); return; }
        print('git stash: припрятал техдолг. Вернётся сам – обычно перед релизом.', 'dim');
      },
      rebase: function () { print('git rebase: переписываю историю… CONFLICT (meetup): обе ветки правы.', 'err'); print('Разрулим на ретро. git merge – без переписывания.', 'dim'); },
      merge: function () { print('Already up to date.', 'dim'); print('Конфликтов нет – значит, никто не работал в одной ветке.', 'dim'); },
      config: function () {
        print('user.name=guest', 'dim'); print('user.email=guest@teamleads.kz', 'dim');
        print('core.editor=vim   # удачи с выходом', 'dim'); print('community.motto=тимлид не кодит', 'accent');
      },
      init: function () { print('Reinitialized existing Git repository.', 'dim'); print('Сообщество уже инициализировано в 2025. contribute – присоединиться.', 'hint'); },
      tag: function () { print('Теги-вехи:', 'dim'); print('  v1.0    принципы сообщества  →  principles'); print('  weekly  встречи по средам    →  join'); },
      version: function () { print('git version 2.42.0 (teamleads build) · тимлид не кодит', 'dim'); },
      help: function () { gitHelp(); }
    };
    var GIT_ALIASES = { co: 'checkout', st: 'status', ci: 'commit', br: 'branch', lg: 'log' };

    var commands = {
      help: function () {
        function rows(list) { list.forEach(function (r) { print('  ' + pad(r[0], 18) + r[1]); }); }
        print('НАВИГАЦИЯ', 'accent');
        rows([
          ['ls [раздел]', 'что вокруг / содержимое раздела'],
          ['cd <раздел>', 'войти в раздел (cd .. – наверх, cd - – назад)'],
          ['open <стр>', 'открыть страницу в браузере'],
          ['tree', 'всё дерево сайта'],
          ['find <запрос>', 'поиск по материалам (ранжированный)'],
          ['grep <запрос>', 'полнотекстовый поиск; --exact – подстрока'],
          ['latest / random', 'последняя встреча / случайный материал'],
          ['git <команда>', 'сайт как git-репозиторий: log, status, diff, blame…']
        ]);
        print(''); print('ЧТЕНИЕ СТРАНИЦ', 'accent');
        rows([
          ['cat <стр>', 'markdown страницы здесь (--raw – без подсветки)'],
          ['head/tail <стр>', 'первые / последние N строк (-n N)'],
          ['wc <стр>', 'строки, слова, символы + время чтения'],
          ['stat <стр>', 'метаданные: раздел, дата, объём, ссылка']
        ]);
        print(''); print('ФАЙЛЫ (ваши, в браузере)', 'accent');
        rows([
          ['nano <файл>', 'создать / редактировать файл (^O сохр · ^X выход)'],
          ['mkdir / touch', 'создать каталог (-p) / пустой файл'],
          ['mv / cp [-r]', 'переместить / скопировать (cp материала – копия)'],
          ['rm [-r] / rmdir', 'удалить файл/каталог · cd, ls, cat работают и с ними']
        ]);
        print(''); print('УТИЛИТЫ', 'accent');
        rows([
          ['claude/codex <q>', 'офлайн-ассистенты по материалам сообщества'],
          ['salary', 'зарплаты рынка (живые данные): salary senior backend'],
          ['submit <что>', 'отправить: salary · review <фирма> · project'],
          ['sim / games', 'тимлид-симулятор · игры (sim, sudoku)'],
          ['fun [имя]', 'инженерные задачки – открыть с Claude/Codex'],
          ['discuss', 'случайная тема из бэклога + разбор по ней'],
          ['principles', 'доктрина сообщества из реальных кейсов'],
          ['tools / toolkit', 'инструменты · рабочие шаблоны операционки'],
          ['voices', 'реальные реплики участников из чата'],
          ['companies', 'отзывы о компаниях (company <имя>, addreview)'],
          ['showcase', 'витрина проектов (showcase submit – добавить)'],
          ['friends / join', 'дружественные сервисы · ссылка на встречу'],
          ['telegram / contribute', 'Telegram · код сайта на GitHub']
        ]);
        print(''); print('СПРАВКА И НАСТРОЙКИ', 'accent');
        rows([
          ['man <cmd>', 'подробная справка по команде'],
          ['apropos <слово>', 'найти команды по описанию'],
          ['whatis / which', 'что делает команда / куда сводится имя'],
          ['alias', 'список псевдонимов команд'],
          ['theme [ps|bash]', 'оформление терминала (сохраняется)'],
          ['share', 'скопировать ссылку на последнюю команду'],
          ['feedback [текст]', 'оставить обратную связь (GitHub issue)'],
          ['neofetch / date', 'инфо / время · clear (Ctrl+L) · home']
        ]);
        print(''); print('Пасхалки: fortune, vim, top, sudo, git blame, coffee, 42, rm -rf /.', 'dim');
      },
      ls: function (a) {
        // accept and ignore flags (-l, -a, -la …); first non-flag arg is the path,
        // a trailing number is the page (ls articles 2). Union view: baked + user FS.
        var args = (a || []).filter(function (x) { return x && x.charAt(0) !== '-'; });
        var lsPage = 1;
        for (var ai = args.length - 1; ai >= 0; ai--) { if (/^\d+$/.test(args[ai])) { lsPage = parseInt(args[ai], 10); args.splice(ai, 1); break; } }
        var path = normPath(args[0] || '');
        var st = path === '' ? { type: 'dir' } : statPath(path);
        if (!st) { print('ls: нет такого файла или каталога: /' + path, 'err'); return; }
        if (st.type === 'file') { lsRenderEntry({ name: baseName(path), type: 'file', source: st.source, node: st.node, item: st.item, link: st.link }, path); return; }
        var entries = listDir(path);
        if (!entries.length) { print('пусто. mkdir/touch/nano – создать.', 'dim'); return; }
        var lp = paginate(entries, lsPage, 12);
        lp.slice.forEach(function (e) { lsRenderEntry(e, path === '' ? e.name : path + '/' + e.name); });
        pageNav(lp, 'ls' + (args[0] ? ' ' + args[0] : ''));
        print('cd <кат> · cat <файл> · mkdir/touch/nano – создать', 'dim');
      },
      cd: function (a) {
        var arg = (a[0] || '');
        if (arg === '-') { var d0 = prevCwd; prevCwd = cwd; cwd = d0; setPrompt(); print(pathStr(), 'dim'); return; }
        // a bare link name navigates to the real page (join, salary, …), from anywhere
        if (arg && arg.indexOf('/') === -1 && links[arg] && !ufs.nodes[normPath(arg)] && !sections[arg]) { go(links[arg]); return; }
        var target = normPath(arg === '' ? '~' : arg);
        if (target !== '' && !isDir(target)) {
          var s = statPath(target);
          print(s && s.type === 'file' ? ('cd: не каталог: /' + target) : ('cd: нет такого каталога: /' + target), 'err');
          return;
        }
        prevCwd = cwd; cwd = target; setPrompt();
      },
      open: function (a) {
        var arg = (a[0] || '').replace(/^\/|\/$/g, '');
        if (!arg) { print('open: укажите страницу. Список – ls.', 'err'); return; }
        if (links[arg]) { go(links[arg]); return; }
        var sec = null, name = arg;
        if (arg.indexOf('/') !== -1) { var p = arg.split('/'); sec = p[0]; name = p[1]; }
        else if (cwd) { sec = cwd; }
        else if (sections[arg]) { return commands.cd(a); }
        var hit = null;
        if (sec && sections[sec]) sections[sec].forEach(function (it) { if (it.n === name) hit = it; });
        if (!hit) pool.forEach(function (it) { if (it.n === name) hit = it; });
        if (hit) { go(hit.u); return; }
        print('open: не найдено: ' + arg, 'err');
      },
      cat: function (a) {
        var raw = false;
        a = a.filter(function (x) { if (x === '--raw' || x === '-r') { raw = true; return false; } return true; });
        var arg = (a[0] || '').replace(/^\/|\/$/g, '');
        if (!arg) { print('cat: укажите файл. Список – ls.', 'err'); return; }
        // user FS file → print stored content (shadows a baked page at the same path)
        var upath = normPath(a[0]);
        var unode = ufs.nodes[upath];
        if (unode) {
          if (unode.type === 'dir') { print('cat: /' + upath + ' – это каталог', 'err'); return; }
          var ulines = (unode.content || '').split('\n');
          if (raw) ulines.forEach(function (l) { print(l); });
          else for (var uli = 0; uli < ulines.length; uli++) { var unode2 = mdLine(ulines[uli]); if (unode2) out.appendChild(unode2); }
          if (!unode.content) print('(пустой файл) · nano ' + a[0] + ' – редактировать', 'dim');
          body.scrollTop = body.scrollHeight; return;
        }
        if (links[arg]) { print('cat: «' + arg + '» – служебная страница без markdown. Откройте: open ' + arg, 'dim'); return; }
        var sec = null, name = arg;
        if (arg.indexOf('/') !== -1) { var p = arg.split('/'); sec = p[0]; name = p[1]; }
        else if (cwd) { sec = cwd; }
        var hit = null;
        if (sec && sections[sec]) sections[sec].forEach(function (it) { if (it.n === name) hit = it; });
        if (!hit) pool.forEach(function (it) { if (it.n === name) hit = it; });
        if (!hit) { print('cat: не найдено: ' + arg, 'err'); return; }
        if (!w.fetch) { print('cat: fetch недоступен в этом браузере – попробуйте open ' + arg, 'err'); return; }
        var url = hit.u + 'index.md';
        print('– ' + url + ' –', 'dim');
        var loading = print('загрузка…', 'dim');
        w.fetch(url).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); }).then(function (txt) {
          if (loading && loading.parentNode) loading.parentNode.removeChild(loading);
          var lines = txt.replace(/\s+$/, '').split('\n'), CAP = 400;
          var slice = lines.slice(0, CAP);
          if (raw) { slice.forEach(function (l) { print(l); }); }
          else {
            for (var li = 0; li < slice.length; li++) {
              var tbl = mdTable(slice, li);
              if (tbl) { out.appendChild(tbl.node); li = tbl.next - 1; continue; }
              var node = mdLine(slice[li]); if (node) out.appendChild(node);
            }
          }
          body.scrollTop = body.scrollHeight;
          if (lines.length > CAP) print('… обрезано (' + (lines.length - CAP) + ' строк). open ' + arg + ' – полная версия.', 'dim');
        }).catch(function (e) {
          if (loading && loading.parentNode) loading.parentNode.removeChild(loading);
          print('cat: не удалось загрузить – ' + e.message, 'err');
        });
      },
      pwd: function () { print(pathStr()); },
      tree: function () {
        print('teamleads.kz', 'accent');
        var rows = sectionNames.map(function (s) { return [s, '/' + s + '/', (sections[s] || []).length]; })
          .concat(linkNames.map(function (k) { return [k, links[k], null]; }));
        rows.forEach(function (r, i) {
          var n = el('span'); n.appendChild(el('span', 'cy', (i === rows.length - 1 ? '└─ ' : '├─ ')));
          n.appendChild(link(r[1], r[0])); n.appendChild(el('span', 'dim', r[2] != null ? '  (' + r[2] + ')' : '')); printNode(n);
        });
      },
      find: function (a) {
        var q = a.join(' ').toLowerCase().trim();
        if (!q) { print('find: укажите запрос. Напр.: find карьера', 'dim'); return; }
        var lh = [];
        linkNames.forEach(function (k) { if (k.indexOf(q) !== -1) lh.push({ n: k, u: links[k] }); });
        function render(hits) {
          if (!hits.length && !lh.length) { print('ничего не найдено по «' + q + '»', 'dim'); return; }
          if (hits.length) {
            print('найдено ' + hits.length + ' (по релевантности):', 'dim');
            hits.slice(0, 12).forEach(function (h) { var n = el('span'); n.appendChild(el('span', 'accent', '→ ')); n.appendChild(link(h.u, h.s + '/' + h.t)); printNode(n); });
            if (hits.length > 12) print('… ещё ' + (hits.length - 12) + '.', 'dim');
          }
          if (lh.length) { print('страницы:', 'dim'); lh.forEach(function (l) { var n = el('span'); n.appendChild(el('span', 'dim', '  ')); n.appendChild(link(l.u, l.n)); printNode(n); }); }
        }
        var R = w.TeamleadsRetrieval;
        if (R && R.fetchIndex && R.rank) {
          var loading = print('find: ищу…', 'dim');
          R.fetchIndex().then(function () { if (loading && loading.parentNode) loading.parentNode.removeChild(loading); render(R.rank(q)); }).catch(function () { if (loading && loading.parentNode) loading.parentNode.removeChild(loading); render([]); });
        } else { render([]); }
      },
      grep: function (a) {
        var exact = false;
        a = a.filter(function (x) { if (x === '--exact' || x === '-e') { exact = true; return false; } return true; });
        var q = a.join(' ').toLowerCase().trim();
        if (!q) { print('grep: укажите запрос. Напр.: grep бас-фактор · grep --exact <строка> – буквальная подстрока', 'dim'); return; }
        var R = w.TeamleadsRetrieval;
        if (!R || !R.fetchIndex || !R.rank) { print('grep: индекс недоступен – попробуйте find <запрос>', 'err'); return; }
        function show(hits, label) {
          if (!hits.length) { print('grep: ничего не найдено по «' + q + '»', 'dim'); return; }
          print('найдено ' + hits.length + label + ':', 'dim');
          hits.slice(0, 12).forEach(function (h) {
            var n = el('span'); n.appendChild(el('span', 'accent', '→ ')); n.appendChild(link(h.u, h.s + '/' + h.t)); printNode(n);
            if (h.snip) print('   ' + h.snip, 'dim');
          });
          if (hits.length > 12) print('… ещё ' + (hits.length - 12) + '. Уточните запрос.', 'dim');
        }
        var loading = print('grep: ищу…', 'dim');
        R.fetchIndex().then(function (items) {
          if (loading && loading.parentNode) loading.parentNode.removeChild(loading);
          if (exact) {
            var hits = [];
            items.forEach(function (p) {
              var b = (p.b || '').toLowerCase(), pos = b.indexOf(q), inTitle = (p.t || '').toLowerCase().indexOf(q) !== -1;
              if (pos === -1 && !inTitle) return;
              var snip = '';
              if (pos !== -1) { var st = Math.max(0, pos - 32); snip = (st > 0 ? '…' : '') + p.b.substr(st, 90).replace(/\s+/g, ' ').trim() + '…'; }
              hits.push({ u: p.u, t: p.t, s: p.s, snip: snip });
            });
            show(hits, ' (точное совпадение)');
          } else {
            show(R.rank(q), ' (по релевантности)');
          }
        }).catch(function (e) {
          if (loading && loading.parentNode) loading.parentNode.removeChild(loading);
          print('grep: индекс недоступен – ' + e.message, 'err');
        });
      },
      latest: function () { var ev = sections.events || []; if (ev.length) { print('последняя встреча: ' + ev[0].t, 'cy'); go(ev[0].u); } else print('latest: нет данных', 'err'); },
      random: function () { if (!pool.length) { print('random: нет данных', 'err'); return; } var r = pool[Math.floor(Math.random() * pool.length)]; print('случайный выбор: ' + r.t, 'cy'); go(r.u); },
      discuss: function () {
        if (!QUESTIONS.length) { print('Бэклог тем пуст. Загляните на ', 'dim'); var nq = el('span'); nq.appendChild(link('/questions/', '/questions/')); printNode(nq); return; }
        var item = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
        print(''); print('💬 Тема для обсуждения:', 'accent');
        print(item.q);
        if (item.u) { var src = el('span'); src.appendChild(el('span', 'dim', 'предложена на встрече ' + (item.d || '') + ' → ')); src.appendChild(link(item.u, item.ev || 'встреча')); printNode(src); }
        print('────────────────────────────', 'dim');
        var R = w.TeamleadsRetrieval;
        if (R && R.retrieve) {
          var loading = print('ищу разбор по теме в архиве…', 'dim');
          R.retrieve(item.q, 2).then(function (hits) {
            if (loading && loading.parentNode) loading.parentNode.removeChild(loading);
            if (hits && hits.length) {
              print('Что есть по теме в архиве:', 'cy');
              hits.forEach(function (h) {
                var n = el('span'); n.appendChild(el('span', 'accent', '→ ')); n.appendChild(link(h.u, h.t)); printNode(n);
                if (h.snip) print('   ' + h.snip, 'dim');
              });
            } else { print('Прямого разбора в архиве нет – отличный повод обсудить первыми.', 'dim'); }
            discussFooter(item);
          }).catch(function () { discussFooter(item); });
        } else { discussFooter(item); }
      },
      toolkit: function () {
        var items = (sections.toolkit || []).slice().sort(function (a, b) { return (a.n || '').localeCompare(b.n || ''); });
        if (!items.length) { print('toolkit: шаблоны не загружены', 'err'); return; }
        print('Операционка тимлида – рабочие шаблоны сообщества:', 'accent');
        items.forEach(function (it) { var n = el('span'); n.appendChild(el('span', 'accent', '• ')); n.appendChild(linkpad(it.u, it.n, 22)); n.appendChild(el('span', 'dim', it.t)); printNode(n); });
        print(''); print('cat toolkit/<имя> – открыть здесь. /toolkit/ – на сайте.', 'dim');
      },
      voices: function () {
        if (!VOICES.length) { print('voices: реплики не загружены', 'err'); return; }
        print('Голоса сообщества – реальные реплики из чата, без редактуры:', 'accent');
        VOICES.forEach(function (v) {
          print('  « ' + v.text + ' »');
          print('    – ' + v.author + (v.topic ? '  · ' + v.topic : ''), 'dim');
        });
        print(''); print('Больше из чата: open insights', 'hint');
      },
      companies: function (a) {
        if (!COMPANIES.length) { print('companies: список не загружен', 'err'); return; }
        var pa = pageArg(a);
        var list = COMPANIES;
        if (pa.q) list = COMPANIES.filter(function (c) { return c.name.toLowerCase().indexOf(pa.q.toLowerCase()) !== -1; });
        if (!list.length) { print('companies: ничего не найдено по «' + pa.q + '»', 'dim'); return; }
        print('Отзывы о компаниях' + (pa.q ? ' · поиск: ' + pa.q : '') + ' (данные techinterview.space):', 'accent');
        var p = paginate(list, pa.page, 8);
        p.slice.forEach(function (c) {
          var n = el('span');
          n.appendChild(el('span', 'accent', pad(rstar(c.rating), 7)));
          n.appendChild(linkpad(TIWEB + '/companies/' + c.slug, c.name, 28, true));
          n.appendChild(el('span', 'dim', c.reviewsCount + ' отз.'));
          printNode(n);
        });
        pageNav(p, 'companies' + (pa.q ? ' ' + pa.q : ''));
        print('Источник: techinterview.space · company <имя> – отзывы в терминале', 'dim');
      },
      company: function (a) {
        var pa = pageArg(a);
        if (!pa.q) { print('company: укажите компанию. Список: companies. Напр.: company kaspi', 'err'); return; }
        var match = resolveCompany(pa.q);
        if (!match) { print('company: «' + pa.q + '» не найдена среди компаний с отзывами. companies – список.', 'err'); return; }
        if (!w.fetch) { print('company: fetch недоступен – откройте ' + TIWEB + '/companies/' + match.slug, 'err'); return; }
        var loading = print('загрузка отзывов о «' + match.name + '»…', 'dim');
        w.fetch(TIAPI + '/companies/' + match.slug).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (data) {
          if (loading && loading.parentNode) loading.parentNode.removeChild(loading);
          var c = (data && data.company) || {};
          var reviews = (c.reviews || []).slice().sort(function (x, y) { return (y.createdAt || '').localeCompare(x.createdAt || ''); });
          print(c.name + '  ' + rstar(c.rating) + '  ·  ' + (c.reviewsCount || reviews.length) + ' отзывов', 'accent');
          var hn = el('span'); hn.appendChild(el('span', 'dim', 'страница: ')); hn.appendChild(linkTI('/companies/' + c.slug, 'techinterview.space/companies/' + c.slug)); printNode(hn);
          print('────────────────────────────', 'dim');
          if (!reviews.length) { print('Пока нет одобренных отзывов. Будьте первым: addreview ' + match.slug, 'hint'); }
          else {
            var p = paginate(reviews, pa.page, 3);
            p.slice.forEach(function (rv) {
              print(rstar(rv.totalRating) + '  ' + (rv.iWorkHere ? 'работает сейчас' : 'бывш. сотрудник') + (rv.createdAt ? ' · ' + fmtDate(rv.createdAt) : ''), 'cy');
              if (rv.pros) print('  + ' + rv.pros);
              if (rv.cons) print('  – ' + rv.cons);
              print('  👍 ' + (rv.likesCount || 0) + '   👎 ' + (rv.dislikesCount || 0), 'dim');
              print('');
            });
            pageNav(p, 'company ' + match.slug);
          }
          print('Источник данных: techinterview.space/companies/' + c.slug, 'dim');
          print('Оставить свой отзыв: addreview ' + match.slug, 'hint');
        }).catch(function (e) {
          if (loading && loading.parentNode) loading.parentNode.removeChild(loading);
          print('company: не удалось загрузить – ' + e.message + '. Откройте ' + TIWEB + '/companies/' + match.slug, 'err');
        });
      },
      addreview: function (a) {
        var q = (a || []).join(' ').trim();
        if (!q) { print('addreview: укажите компанию. Напр.: addreview kaspi', 'err'); return; }
        var match = resolveCompany(q);
        if (!match) { print('addreview: «' + q + '» не найдена. companies – список.', 'err'); return; }
        print('Оставить отзыв о «' + match.name + '» на techinterview.space:', 'accent');
        var n = el('span'); n.appendChild(el('span', 'accent', '→ ')); n.appendChild(linkTI('/companies/' + match.id + '/add-review', 'Открыть форму отзыва')); printNode(n);
        print('Форма откроется на techinterview.space – партнёрском сервисе сообщества.', 'dim');
      },
      tools: function () {
        print('Топ инструментов, которые советует сообщество:', 'accent');
        [
          ['Claude Code (Opus)', 'AI-разработка и рефакторинг под контролем', 'https://claude.com/claude-code'],
          ['Hetzner', 'дешёвый и стабильный хостинг вместо локальных провайдеров', 'https://www.hetzner.com/'],
          ['GitHub / Forgejo', 'код всегда в общем репозитории – лекарство от бас-фактора', 'https://forgejo.org/'],
          ['SonarQube', 'статанализ и дисциплина декомпозиции', 'https://www.sonarsource.com/'],
          ['Swagger / OpenAPI', 'документация API, по которой конформятся новички', 'https://swagger.io/'],
          ['Sales Navigator', 'выход на западных заказчиков через прогрев', 'https://business.linkedin.com/sales-solutions/sales-navigator'],
          ['techinterview.space', 'зарплаты по рынку и подготовка к собеседованиям', 'https://techinterview.space/']
        ].forEach(function (t) { var n = el('span'); n.appendChild(el('span', 'accent', '• ')); n.appendChild(link(t[2], t[0], true)); n.appendChild(el('span', 'dim', ' – ' + t[1])); printNode(n); });
      },
      friends: function () {
        if (!FRIENDS.length) { print('friends: список пуст', 'dim'); return; }
        print('Дружественные сообщества и сервисы:', 'accent');
        FRIENDS.forEach(function (f) {
          var dash = (f.t || '').split(' – '); var name = dash[0]; var desc = dash.slice(1).join(' – ');
          var n = el('span'); n.appendChild(el('span', 'accent', '• ')); n.appendChild(link(f.u, name, true));
          if (desc) n.appendChild(el('span', 'dim', ' – ' + desc)); printNode(n);
        });
      },
      salary: function (a) {
        var grades = SAL.grades || {}, roles = SAL.roles || {}, aliases = SAL.aliases || {};
        var gradeNames = Object.keys(grades), roleNames = Object.keys(roles);
        if (!gradeNames.length || !roleNames.length) { print('salary: данные о зарплатах не загружены', 'err'); return; }
        var S = w.TeamleadsSalary;
        if (a[0] === 'help' || a[0] === '--help' || a[0] === '-h') {
          print('Зарплаты рынка РК – живые данные techinterview.space', 'accent');
          print('Использование: salary [грейд] [роль] [город] [скилл]. Напр.: salary senior backend almaty', 'hint');
          print('  без аргументов – обзор всего рынка (медиана, грейд-лестница, распределение)', 'dim');
          print('  грейды: ' + gradeNames.join(', '), 'dim');
          print('  роли:   ' + roleNames.join(', '), 'dim');
          if (S) {
            print('  города: ' + Object.keys(S.CITY_LABEL).map(function (k) { return S.CITY_LABEL[k]; }).slice(0, 8).join(', ') + ' …', 'dim');
            print('  скиллы: ' + Object.keys(S.SKILL_LABEL).map(function (k) { return S.SKILL_LABEL[k]; }).join(', '), 'dim');
          }
          print('Подробная страница: open salary · /salary/', 'dim');
          print('Добавить свою вилку в выборку: salary submit', 'hint');
          return;
        }
        if (/^(submit|add|добавить|поделиться)$/.test((a[0] || '').toLowerCase())) { return submitSalary(); }
        // Resolve every token to a grade / role / city / skill (via RU aliases); last grade & role win, cities/skills accumulate.
        var grade = '', role = '', cities = [], skills = [];
        a.forEach(function (raw) {
          var lc = raw.toLowerCase(), t = (aliases[lc] || lc);
          if (grades[t]) { grade = t; return; }
          if (roles[t]) { role = t; return; }
          if (S && S.resolveCity(lc) != null) { cities.push(lc); return; }
          if (S && S.resolveSkill(lc) != null) { skills.push(lc); return; }
        });
        if (S && w.fetch) salaryLive(grade, role, cities, skills);
        else salaryOffline(grade, role);
      },
      claude: function (a) {
        var q = a.join(' ').trim();
        try { if (w.ym) w.ym(106055675, 'reachGoal', 'search_open', { source: 'shell', tool: 'claude', query: q ? 'yes' : 'no' }); } catch (e) {}
        if (w.TeamleadsClaude) {
          print('открываю Claude' + (q ? ' с вашим вопросом' : '') + '…', 'cy');
          w.TeamleadsClaude.open(q);
          return;
        }
        // Fallback if the Claude overlay isn't loaded – search content inline.
        print('Claude-окно недоступно – ищу прямо здесь.', 'dim');
        var words = q.toLowerCase().split(/\s+/).filter(function (x) { return x.length > 2; });
        var hits = [];
        sectionNames.forEach(function (s) {
          (sections[s] || []).forEach(function (it) {
            var t = (it.t || '').toLowerCase();
            if (words.some(function (x) { return t.indexOf(x) !== -1; })) hits.push(it);
          });
        });
        if (hits.length) { hits.slice(0, 4).forEach(function (it) { var n = el('span'); n.appendChild(el('span', 'accent', '→ ')); n.appendChild(link(it.u, it.t)); printNode(n); }); }
        else { print('Ничего не нашёл – попробуйте find <слово> или раздел articles.', 'dim'); }
      },
      codex: function (a) {
        var q = a.join(' ').trim();
        try { if (w.ym) w.ym(106055675, 'reachGoal', 'search_open', { source: 'shell', tool: 'codex', query: q ? 'yes' : 'no' }); } catch (e) {}
        if (w.TeamleadsCodex) { print('открываю Codex' + (q ? ' с вашим вопросом' : '') + '…', 'cy'); w.TeamleadsCodex.open(q); return; }
        print('Codex-окно недоступно на этой странице.', 'dim');
      },
      join: function () { print('Еженедельная встреча, среда 17:00 (Астана).', 'cy'); go('/join/'); },
      telegram: function () { print('открываю Telegram…', 'ok'); printNode(link(TG, TG, true)); w.open(TG, '_blank', 'noopener'); },
      contribute: function () {
        var url = 'https://github.com/belyaevsa/teamleads-2025';
        print('Сайт открытый – буду рад правкам и pull request:', 'cy');
        printNode(link(url, url, true));
        w.open(url, '_blank', 'noopener');
      },
      // Unified submission hub. Routes to the right form so a single `submit` verb
      // covers salary, company review and showcase project (no name collisions).
      submit: function (a) {
        var what = (a[0] || '').toLowerCase();
        if (/^(salary|зарплат|вилк)/.test(what)) { submitSalary(); return; }
        if (/^(review|отзыв)/.test(what)) { commands.addreview(a.slice(1)); return; }
        if (/^(project|projects|showcase|проект|витрин)/.test(what)) { commands.showcase(['submit']); return; }
        print('Что отправить сообществу?', 'accent');
        print('  submit salary            – свою зарплату в выборку (techinterview.space)', 'dim');
        print('  submit review <компания> – отзыв о компании', 'dim');
        print('  submit project           – проект в витрину (showcase)', 'dim');
      },
      showcase: function (a) {
        var sub = (a[0] || '').toLowerCase();
        if (/^(submit|add|new|добавить)$/.test(sub)) {
          var url = 'https://github.com/belyaevsa/teamleads-2025/blob/master/landing-main/SHOWCASE.md';
          try { if (w.ym) w.ym(106055675, 'reachGoal', 'showcase_submit', { source: 'shell' }); } catch (e) {}
          print('Добавить свой проект в витрину сообщества.', 'accent');
          print('Инструкция (SHOWCASE.md): форк репозитория → шаблон в content/showcase/ → Pull Request.', 'dim');
          printNode(link(url, url, true));
          w.open(url, '_blank', 'noopener');
          return;
        }
        // bare `showcase` (or anything else) → list the section in place
        commands.ls(['showcase']);
        print('Добавить свой проект: showcase submit', 'hint');
      },
      whoami: function () {
        print('«Тимлид не кодит» – сообщество тимлидов, EM и CTO Казахстана.', 'accent');
        var facts = [
          ['состав', '400+ практик: Kaspi, Kolesa, DAR, Chocofamily, InDrive и другие'],
          ['формат', 'еженедельные встречи, разбор реальных кейсов, отчёты публикуем открыто'],
          ['о чём', 'люди · архитектура · найм · процессы · карьера – без слайдов и хайпа'],
          ['с чего начать', 'sim · salary senior backend · principles · latest']
        ];
        facts.forEach(function (r) { var n = el('span'); n.appendChild(el('span', 'accent', pad(r[0], 15))); n.appendChild(d.createTextNode(r[1])); printNode(n); });
        print('');
        print('whoami → guest. …но мы-то видим тимлида. Добро пожаловать.', 'dim');
      },
      principles: function () {
        print('Доктрина «Тимлид не кодит» – выжимка из реальных кейсов сообщества.', 'accent');
        print('');
        var p = [
          ['Сеньора берут, не дают – лычка не равна уровню.', 'карьера'],
          ['Тимлид – не «сеньор плюс подчинённые». Тимлид и техлид – разные работы.', 'роли'],
          ['Бас-фактор – плата за экономию, отложенная во времени. Знание – живому дублёру, не в документ.', 'бас-фактор'],
          ['Метрики врут не потому что ложны, а потому что вы смотрите не туда.', 'метрики'],
          ['Сначала диагноз (не хочет / забывает / не видит ценности), потом лекарство.', 'процессы'],
          ['Ответственность не передаётся лекцией – дайте обжечься под присмотром и научите откатывать.', 'рост'],
          ['Дорогая оценка часто прячется за страх. Проверяйте её дешёвым совместным экспериментом.', 'оценки'],
          ['Влияние – не подчинение и не саботаж, а аргументы и информированный выбор.', 'стейкхолдеры'],
          ['Нанимать стоит под конкретную перегруженную роль, а не чтобы «стало полегче».', 'найм'],
          ['Самый зрелый способ внедрить ИИ – иногда внедрить его временно: разведать и уйти.', 'AI'],
          ['Не ставьте на один сценарий. Ценна команда, сильная при любом будущем.', 'AI · команда'],
          ['Сначала инженер, потом – продуктовый. Гемба вместо хайпа.', 'продукт']
        ];
        p.forEach(function (r, i) {
          var n = el('div', 'ln');
          n.appendChild(el('span', 'accent', pad(String(i + 1), 3)));
          n.appendChild(d.createTextNode(r[0] + ' '));
          n.appendChild(el('span', 'dim', '– ' + r[1]));
          printNode(n);
        });
        print('');
        print('Каждый принцип – развернутый разбор в статьях: find <тема> или cat articles/…', 'dim');
      },
      date: function () { print(new Date().toString()); },
      echo: function (a) { print(a.join(' ')); },
      history: function () { if (!hist.length) { print('история пуста', 'dim'); return; } hist.forEach(function (c, i) { print('  ' + pad(i + 1, 4) + c); }); },
      clear: function () { out.innerHTML = ''; },
      man: function (a) {
        var pages = MANPAGES;
        var k = (a[0] || '').toLowerCase();
        k = canonName(k);
        if (!k) { print('Использование: man <команда>. Напр.: man tree', 'dim'); return; }
        print(pages[k] || ('man: нет страницы для ' + k), pages[k] ? null : 'err');
      },
      neofetch: function () {
        var info = [['OS', 'Teamleads OS (rolling)'], ['Host', 'teamleads.kz'], ['Shell', 'tlsh 1.0'], ['Разделы', sectionNames.length + ' + ' + linkNames.length + ' страниц'], ['Материалов', pool.length], ['Встречи', 'каждую среду, 17:00 Астана']];
        var art = ['     ◇◇◇   ', '   ◇     ◇ ', '  ◇   ◇   ◇', '   ◇     ◇ ', '     ◇◇◇   ', '          '];
        info.forEach(function (r, i) { var n = el('span'); n.appendChild(el('span', 'cy', (art[i] || '          ') + '  ')); n.appendChild(el('span', 'accent', r[0] + ': ')); n.appendChild(d.createTextNode(String(r[1]))); printNode(n); });
      },
      fortune: function () {
        var f = ['Сеньора не дают – сеньора берут.', 'Бас-фактор – это плата за экономию, отложенная во времени.', 'Документ говорит «что». Человек знает «почему».', 'Срочно – значит, некачественно. Автоматически.', 'За большим хайпом скрывается большой попил.', 'Тимлид и техлид – две разные работы с одним названием.', 'Стоять надо не там, где интересно, а у кормушки с деньгами.', 'Молчаливое большинство, которое читает, – здоровый показатель.'];
        print('« ' + f[Math.floor(Math.random() * f.length)] + ' »', 'accent');
      },
      sim: function () { simStart(SCEN); },
      quiz: function (a) {
        var list = (QUIZZES && QUIZZES.quizzes) ? QUIZZES.quizzes : [];
        if (!list.length) { print('quiz: квизы не загружены', 'err'); return; }
        var id = (a[0] || '').trim(), q = null;
        if (id) { list.forEach(function (x) { if (x.id === id) q = x; }); }
        else { q = list[0]; }
        if (!q) { print('quiz: нет квиза «' + id + '». Доступны: ' + list.map(function (x) { return x.id; }).join(', '), 'dim'); return; }
        simStart(q);
      },
      // Mini-arcade. Each game launches either in the terminal panel (sim) or a
      // popup window (sudoku). New games: add a row to GAMES and a launch branch.
      games: function (a) {
        var GAMES = [
          ['sim', 'тимлид-симулятор: развилки и решения', 'в терминале'],
          ['sudoku', 'классическое судоку 9×9', 'в окне']
        ];
        var pick = (a[0] || '').toLowerCase();
        if (!pick) {
          print('Игры сообщества:', 'accent');
          GAMES.forEach(function (g) {
            var n = el('span'); n.appendChild(el('span', 'accent', '• '));
            var a2 = el('a', null, pad(g[0], 10)); a2.href = 'javascript:void(0)';
            a2.addEventListener('click', (function (name) { return function (e) { e.preventDefault(); run('games ' + name); }; })(g[0]));
            n.appendChild(a2); n.appendChild(d.createTextNode(g[1] + ' ')); n.appendChild(el('span', 'dim', '· ' + g[2])); printNode(n);
          });
          print('Запуск: games <имя>. Напр.: games sudoku', 'hint');
          return;
        }
        if (pick === 'sim' || pick === 'simulator') { simStart(); return; }
        if (pick === 'sudoku') {
          try { if (w.ym) w.ym(106055675, 'reachGoal', 'game_open', { source: 'shell', game: 'sudoku' }); } catch (e) {}
          var url = (w.location.origin || '') + '/games/sudoku.html';
          print('открываю судоку в новом окне…', 'cy');
          printNode(link(url, url, true));
          var win = w.open(url, 'tnk_sudoku', 'width=540,height=760,menubar=no,toolbar=no,location=no');
          if (!win) print('окно заблокировано браузером – кликните по ссылке выше.', 'dim');
          return;
        }
        print('games: нет такой игры: ' + pick, 'err');
        print('доступно: sim, sudoku. Список – games.', 'dim');
      },
      sudoku: function () { commands.games(['sudoku']); },
      // ── fun: inженerные задачки from content/fun. Open one in the Claude/Codex
      //    assistant with its text loaded as context, and download the puzzle file.
      fun: function (a) {
        var items = sections.fun || [];
        if (!items.length) { print('fun: задачки не загружены', 'err'); return; }
        var rest = a.slice(), tool = 'claude';
        rest = rest.filter(function (x) {
          var lx = x.toLowerCase();
          if (/^(--codex|codex|-x)$/.test(lx)) { tool = 'codex'; return false; }
          if (/^(--claude|claude|-c)$/.test(lx)) { tool = 'claude'; return false; }
          return true;
        });
        var name = (rest[0] || '').replace(/^fun\//, '').replace(/^\/|\/$/g, '');
        if (!name) {
          print('Инженерные задачки сообщества:', 'accent');
          items.forEach(function (it) {
            var n = el('span'); n.appendChild(el('span', 'accent', '• '));
            var lnk = el('a', null, pad(it.n, 16)); lnk.href = 'javascript:void(0)';
            lnk.addEventListener('click', (function (nm) { return function (e) { e.preventDefault(); run('fun ' + nm); }; })(it.n));
            n.appendChild(lnk); n.appendChild(d.createTextNode(it.t)); printNode(n);
          });
          print('Открыть с ассистентом: fun <имя> [codex]. Напр.: fun ' + (items[0] && items[0].n) + ' codex', 'hint');
          print('Откроется Claude/Codex с условием, файл задачки скачается.', 'dim');
          return;
        }
        var hit = null; items.forEach(function (it) { if (it.n === name) hit = it; });
        if (!hit) { print('fun: задачка не найдена: ' + name + '. Список – fun.', 'err'); return; }
        var TOOL = tool === 'codex' ? w.TeamleadsCodex : w.TeamleadsClaude;
        if (!TOOL || !TOOL.open) { print('fun: окно ' + tool + ' недоступно на этой странице. Откройте: open fun/' + name, 'err'); return; }
        try { if (w.ym) w.ym(106055675, 'reachGoal', 'fun_open', { source: 'shell', tool: tool, puzzle: name }); } catch (e) {}
        print('загружаю «' + hit.t + '» в ' + (tool === 'codex' ? 'Codex' : 'Claude') + '…', 'cy');
        fetchPageText(hit, function (txt) {
          var clean = cleanPuzzle(txt);
          TOOL.open('', { title: hit.t, content: clean });
          if (downloadText(name + '.txt', clean)) print('условие скачано: ' + name + '.txt', 'ok');
          var ln = el('span'); ln.appendChild(el('span', 'dim', 'страница задачки: ')); ln.appendChild(link(hit.u, hit.u)); printNode(ln);
        });
      },

      // ── file utilities: head / tail / wc / stat over a page's markdown ──
      head: function (a) { headTail('head', a); },
      tail: function (a) { headTail('tail', a); },
      wc: function (a) {
        var un = ufs.nodes[normPath(a[0])];
        if (un) {
          if (un.type === 'dir') { print('wc: /' + normPath(a[0]) + ' – каталог', 'err'); return; }
          var c = un.content || '', l = c === '' ? 0 : c.replace(/\s+$/, '').split('\n').length, wds = (c.match(/\S+/g) || []).length;
          print('  ' + pad(l, 6) + pad(wds, 7) + c.length + '  ' + a[0], 'cy');
          print('  строк   слов   символов', 'dim'); return;
        }
        var hit = resolvePage(a[0]);
        if (!hit) { print('wc: не найдено: ' + (a[0] || ''), 'err'); return; }
        fetchPageText(hit, function (txt) {
          var prose = plainText(txt);
          var lines = txt.replace(/\s+$/, '').split('\n').length;
          var words = (prose.match(/\S+/g) || []).length;
          var mins = Math.max(1, Math.round(words / 200));
          print('  ' + pad(lines, 6) + pad(words, 7) + txt.length + '  ' + hit.n, 'cy');
          print('  строк   слов   символов · ~' + mins + ' мин чтения', 'dim');
        });
      },
      stat: function (a) {
        var path = normPath(a[0]), un = ufs.nodes[path];
        if (un) {
          print('  File:    /' + path, 'accent');
          print('  Type:    ' + (un.type === 'dir' ? 'каталог' : 'файл') + (un.type === 'dir' ? '' : ' · ' + ((un.content || '').length) + ' Б'));
          print('  Author:  ' + (un.author || 'guest'));
          print('  Created: ' + fmtTs(un.ctime));
          print('  Modified:' + fmtTs(un.mtime), 'dim');
          if (un.type === 'file') print('  cat /' + path + ' · nano /' + path + ' – редактировать', 'dim');
          return;
        }
        var hit = resolvePage(a[0]);
        if (!hit) { print('stat: не найдено: ' + (a[0] || '') + '. Список – ls.', 'err'); return; }
        var sec = ''; sectionNames.forEach(function (s) { (sections[s] || []).forEach(function (it) { if (it === hit) sec = s; }); });
        print('  File:    ' + hit.n, 'accent');
        print('  Title:   ' + hit.t);
        if (sec) print('  Section: ' + sec);
        if (hit.d) print('  Date:    ' + hit.d);
        var ln = el('span'); ln.appendChild(el('span', 'dim', '  URL:     ')); ln.appendChild(link(hit.u, hit.u)); printNode(ln);
        fetchPageText(hit, function (txt) {
          var words = (plainText(txt).match(/\S+/g) || []).length;
          print('  Size:    ' + words + ' слов · ~' + Math.max(1, Math.round(words / 200)) + ' мин · cat ' + hit.n + ' – прочитать', 'dim');
        });
      },

      // ── meta: apropos / whatis / which / alias ──
      apropos: function (a) {
        var q = a.join(' ').toLowerCase().trim();
        if (!q) { print('apropos <слово> – найти команды по описанию. Напр.: apropos зарплат', 'dim'); return; }
        var hits = Object.keys(MANPAGES).filter(function (k) { return k.indexOf(q) !== -1 || MANPAGES[k].toLowerCase().indexOf(q) !== -1; });
        if (!hits.length) { print('apropos: ничего по «' + q + '»', 'dim'); return; }
        print('Найдено ' + hits.length + ':', 'dim');
        hits.forEach(function (k) { var n = el('span'); n.appendChild(el('span', 'accent', pad(k, 12))); n.appendChild(d.createTextNode(manSummary(k))); printNode(n); });
      },
      whatis: function (a) {
        var k = canonName((a[0] || '').toLowerCase());
        if (!k) { print('whatis <команда> – короткое описание. Напр.: whatis grep', 'dim'); return; }
        if (MANPAGES[k]) print(k + ' – ' + manSummary(k)); else print('whatis: ' + (a[0] || '') + ': нет описания', 'err');
      },
      which: function (a) {
        var k = (a[0] || '').toLowerCase();
        if (!k) { print('which <имя> – к какой команде сводится имя.', 'dim'); return; }
        if (!Object.prototype.hasOwnProperty.call(commands, k)) { print('which: ' + k + ': команда не найдена', 'err'); return; }
        if (ALIASES[k]) print(k + ' → ' + canonName(k) + '  (алиас)', 'cy');
        else print(k + '  – встроенная команда', null);
      },
      alias: function (a) {
        var k = (a[0] || '').toLowerCase();
        if (k) {
          if (ALIASES[k]) print(k + ' → ' + ALIASES[k], 'cy');
          else if (Object.prototype.hasOwnProperty.call(commands, k)) print(k + ' – команда, не алиас', 'dim');
          else print('alias: ' + k + ' не найден', 'err');
          return;
        }
        var byTarget = {};
        Object.keys(ALIASES).sort().forEach(function (n) { (byTarget[ALIASES[n]] = byTarget[ALIASES[n]] || []).push(n); });
        var targets = Object.keys(byTarget).sort();
        print('Псевдонимы команд (' + targets.length + '):', 'accent');
        targets.forEach(function (t) { var n = el('span'); n.appendChild(el('span', 'accent', pad(t, 12))); n.appendChild(el('span', 'dim', byTarget[t].join(', '))); printNode(n); });
      },

      // ── environment: theme / share / feedback ──
      theme: function (a) {
        var t = (a[0] || '').toLowerCase();
        var MAP = { ps: 'powershell', powershell: 'powershell', win: 'powershell', bash: 'bash', default: 'bash', unix: 'bash', dark: 'bash' };
        if (!t) {
          print('Текущая тема: ' + (psActive() ? 'powershell' : 'bash'), 'accent');
          print('theme ps – PowerShell (синяя) · theme bash – стандартная. Выбор сохраняется.', 'dim');
          return;
        }
        if (!MAP[t]) { print('theme: неизвестная тема: ' + t + '. Доступно: ps, bash', 'err'); return; }
        if (MAP[t] === 'powershell') root.classList.add('term--ps'); else root.classList.remove('term--ps');
        try { if (w.localStorage) w.localStorage.setItem('tnk_shell_theme', MAP[t]); } catch (e) {}
        setPrompt(); print('тема: ' + MAP[t], 'ok');
      },
      share: function () {
        var last = null;
        for (var i = hist.length - 1; i >= 0; i--) { var v = (hist[i].split(/\s+/)[0] || '').toLowerCase(); if (v !== 'share' && SHARE[v]) { last = hist[i]; break; } }
        var url;
        if (last) {
          var parts = last.split(/\s+/), verb = parts[0].toLowerCase(), args = parts.slice(1).join(' ');
          url = (w.location.origin || '') + '/s/' + SHARE[verb] + '/';
          if (args) url += '?cmd=' + encodeURIComponent(args).replace(/%20/g, '+');
        } else {
          url = (w.location.origin || '') + '/shell/';
        }
        copyText(url).then(function () { print('ссылка скопирована: ' + url, 'ok'); }, function () { print('ссылка: ' + url, 'cy'); });
        printNode(link(url, url, true));
      },
      feedback: function (a) {
        var body = a.join(' ').trim();
        var base = 'https://github.com/belyaevsa/teamleads-2025/issues/new';
        var url = base + '?title=' + encodeURIComponent('[shell] обратная связь') + (body ? '&body=' + encodeURIComponent(body) : '');
        try { if (w.ym) w.ym(106055675, 'reachGoal', 'shell_feedback', { source: 'shell' }); } catch (e) {}
        print('Спасибо! Откроется форма нового issue на GitHub.', 'accent');
        printNode(link(url, url, true));
        w.open(url, '_blank', 'noopener');
      },

      vim: function () { vimMode = true; print('~', 'dim'); print('~  VIM – Vi IMproved', 'dim'); print('~', 'dim'); print('Вы в vim. Удачи с выходом: :q (или :q!).', 'hint'); },
      top: function () {
        print('PID   COMMAND           %CPU  STATE', 'dim');
        [['1', 'daily-standup', '38', 'running'], ['7', 'retro', '12', 'blocked'], ['42', 'coffee', '73', 'critical'], ['99', 'code-review', '21', 'waiting'], ['100', 'tg-notifications', '55', 'running']].forEach(function (p) { print('  ' + pad(p[0], 5) + pad(p[1], 18) + pad(p[2], 6) + p[3]); });
        print('тимлид не кодит – тимлид анблокает.', 'dim');
      },
      sudo: function () { print('guest отсутствует в файле sudoers. Инцидент запротоколирован. 🚨', 'err'); },
      git: function (a) {
        a = a || [];
        var sub = (a[0] || '').toLowerCase(), rest = a.slice(1);
        if (sub === '-v' || sub === '--version') sub = 'version';
        if (!sub) { gitHelp(); return; }
        sub = GIT_ALIASES[sub] || sub;
        if (Object.prototype.hasOwnProperty.call(GIT, sub) && typeof GIT[sub] === 'function') {
          try { GIT[sub](rest); } catch (e) { print('git: ' + e.message, 'err'); }
        } else {
          print("git: '" + sub + "' не команда git. git help – список.", 'err');
        }
      },
      coffee: function () { print('☕  Тимлид не кодит. Тимлид пьёт кофе и анблокает команду.', 'accent'); },
      // ── writable filesystem: mkdir / touch / rm / rmdir / mv / cp on the user FS ──
      mkdir: function (a) {
        a = a || []; var parents = / -p\b| -[a-z]*p/.test(' ' + a.join(' '));
        var dirs = a.filter(function (x) { return x && x.charAt(0) !== '-'; });
        if (!dirs.length) { print('mkdir [-p] <каталог>…', 'dim'); return; }
        var author = ufsUser(), now = ufsNow(), changed = false;
        dirs.forEach(function (raw) {
          var path = normPath(raw);
          if (path === '') { print('mkdir: нельзя создать /', 'err'); return; }
          if (statPath(path)) { print('mkdir: уже существует: /' + path, 'err'); return; }
          var parent = parentOf(path);
          if (parents) { var err = ensureDir(parent, author, now); if (err) { print('mkdir: ' + err, 'err'); return; } }
          else if (parent !== '' && !isDir(parent)) { print('mkdir: нет каталога: /' + parent + ' (добавьте -p)', 'err'); return; }
          ufs.nodes[path] = { type: 'dir', ctime: now, mtime: now, author: author }; changed = true;
          print('каталог создан: /' + path, 'ok');
        });
        if (changed) ufsSave();
      },
      touch: function (a) {
        var files = (a || []).filter(function (x) { return x && x.charAt(0) !== '-'; });
        if (!files.length) { print('touch <файл>…', 'dim'); return; }
        var author = ufsUser(), now = ufsNow(), changed = false;
        files.forEach(function (raw) {
          var path = normPath(raw);
          if (path === '') { print('touch: неверный путь', 'err'); return; }
          var u = ufs.nodes[path];
          if (u) { u.mtime = now; changed = true; return; }
          var b = bakedAt(path);
          if (b && b.type === 'dir') { print('touch: /' + path + ' – каталог', 'err'); return; }
          var parent = parentOf(path);
          if (parent !== '' && !isDir(parent)) { print('touch: нет каталога: /' + parent, 'err'); return; }
          ufs.nodes[path] = { type: 'file', content: '', ctime: now, mtime: now, author: author }; changed = true;
        });
        if (changed) ufsSave();
      },
      rm: function (a) {
        a = a || [];
        var rec = false, paths = [];
        a.forEach(function (x) { if (x.charAt(0) === '-' && x.length > 1) { if (/[rR]/.test(x)) rec = true; } else if (x) paths.push(x); });
        // the classic gag: rm -rf / still refuses, with a wink
        if (rec && paths.some(function (p) { return normPath(p) === ''; })) {
          print('rm: удаляю / …', 'err'); print('…', 'dim');
          setTimeout(function () { print('обошлось. В этот раз. На проде так не надо.', 'ok'); }, reduced ? 0 : 550); return;
        }
        if (!paths.length) { print('rm [-r] <файл|каталог>…', 'dim'); return; }
        var changed = false;
        paths.forEach(function (raw) {
          var path = normPath(raw), u = ufs.nodes[path];
          if (u) {
            if (u.type === 'dir' && !rec && ufsChildrenCount(path) > 0) { print('rm: /' + path + ' – каталог не пуст (rm -r)', 'err'); return; }
            ufsRemoveSubtree(path); changed = true; return;
          }
          var b = bakedAt(path);
          if (b) {
            if (b.type === 'dir' && !rec) { print('rm: /' + path + ' – раздел сайта (rm -r чтобы скрыть его в вашем виде)', 'err'); return; }
            ufs.tombs[path] = 1; changed = true; print('скрыто: /' + path + ' (это материал сайта; скрыт только у вас)', 'dim'); return;
          }
          if (ufs.tombs[path]) { print('rm: уже удалено: /' + path, 'dim'); return; }
          print('rm: нет такого файла: /' + path, 'err');
        });
        if (changed) ufsSave();
      },
      rmdir: function (a) {
        var dirs = (a || []).filter(function (x) { return x && x.charAt(0) !== '-'; });
        if (!dirs.length) { print('rmdir <каталог>…', 'dim'); return; }
        var changed = false;
        dirs.forEach(function (raw) {
          var path = normPath(raw), u = ufs.nodes[path];
          if (!u || u.type !== 'dir') { print('rmdir: нет каталога: /' + path, 'err'); return; }
          if (ufsChildrenCount(path) > 0) { print('rmdir: /' + path + ' не пуст', 'err'); return; }
          delete ufs.nodes[path]; changed = true;
        });
        if (changed) ufsSave();
      },
      mv: function (a) {
        var args = (a || []).filter(function (x) { return x && x.charAt(0) !== '-'; });
        if (args.length < 2) { print('mv <откуда> <куда>', 'dim'); return; }
        var src = normPath(args[0]), dst = normPath(args[1]), u = ufs.nodes[src];
        if (!u) { print(bakedAt(src) ? ('mv: /' + src + ' – материал сайта (только чтение). cp скопирует его в файл.') : ('mv: нет: /' + src), 'err'); return; }
        if (isDir(dst)) dst = (dst === '' ? '' : dst + '/') + baseName(src);
        if (src === dst) return;
        if (statPath(dst)) { print('mv: уже существует: /' + dst, 'err'); return; }
        var parent = parentOf(dst);
        if (parent !== '' && !isDir(parent)) { print('mv: нет каталога: /' + parent, 'err'); return; }
        var now = ufsNow(), pre = src + '/', moves = [[src, dst]];
        Object.keys(ufs.nodes).forEach(function (p) { if (p.indexOf(pre) === 0) moves.push([p, dst + p.slice(src.length)]); });
        moves.forEach(function (m) { var node = ufs.nodes[m[0]]; node.mtime = now; ufs.nodes[m[1]] = node; });
        moves.forEach(function (m) { if (m[0] !== m[1]) delete ufs.nodes[m[0]]; });
        ufsSave();
      },
      cp: function (a) {
        var rec = /-[a-zA-Z]*[rR]/.test(' ' + (a || []).join(' '));
        var args = (a || []).filter(function (x) { return x && x.charAt(0) !== '-'; });
        if (args.length < 2) { print('cp [-r] <откуда> <куда>', 'dim'); return; }
        var src = normPath(args[0]), dst = normPath(args[1]), author = ufsUser(), now = ufsNow();
        function destFor(s, dd) { return isDir(dd) ? ((dd === '' ? '' : dd + '/') + baseName(s)) : dd; }
        var u = ufs.nodes[src];
        if (u) {
          var target = destFor(src, dst);
          if (statPath(target)) { print('cp: уже существует: /' + target, 'err'); return; }
          if (u.type === 'dir' && !rec) { print('cp: /' + src + ' – каталог (cp -r)', 'err'); return; }
          var copies = [[src, target]], pre = src + '/';
          if (rec) Object.keys(ufs.nodes).forEach(function (p) { if (p.indexOf(pre) === 0) copies.push([p, target + p.slice(src.length)]); });
          copies.forEach(function (m) { var o = ufs.nodes[m[0]]; ufs.nodes[m[1]] = { type: o.type, content: o.content, ctime: now, mtime: now, author: author }; });
          ufsSave(); return;
        }
        var b = bakedAt(src);
        if (b && b.type === 'file' && b.item) {
          var target2 = destFor(src, dst);
          if (statPath(target2)) { print('cp: уже существует: /' + target2, 'err'); return; }
          var parent2 = parentOf(target2);
          if (parent2 !== '' && !isDir(parent2)) { print('cp: нет каталога: /' + parent2, 'err'); return; }
          fetchPageText(b.item, function (txt) {
            ufs.nodes[target2] = { type: 'file', content: txt, ctime: now, mtime: now, author: author };
            ufsSave(); print('скопировано → /' + target2 + ' (' + txt.length + ' Б)', 'ok');
          });
          return;
        }
        print('cp: нет: /' + src, 'err');
      },
      nano: function (a) {
        var arg = (a || []).filter(function (x) { return x && x.charAt(0) !== '-'; })[0];
        if (!arg) { print('nano <файл> – создать или редактировать файл. Напр.: nano notes.md', 'dim'); return; }
        var path = normPath(arg);
        if (path === '') { print('nano: неверный путь', 'err'); return; }
        var b = bakedAt(path);
        if (b && b.type === 'file' && !ufs.nodes[path]) { print('nano: /' + path + ' – материал сайта (только чтение). cp ' + arg + ' <имя> сделает редактируемую копию.', 'err'); return; }
        nanoStart(path);
      },
      '42': function () { print('Ответ на главный вопрос жизни, вселенной и всего такого – 42.', 'accent'); print('Но запрошенной страницы среди ответов нет.', 'dim'); },
      home: function () { go('/'); },
      exit: function () { go('/'); }
    };
    // Aliases go through alias(name, target): it records the mapping (powering `which`
    // and `alias`) and refuses to overwrite a real command, so a future duplicate like
    // the old `submit`→`addreview` clash is caught at load instead of silently breaking.
    [
      ['go', 'open'], ['search', 'find'], ['answer', '42'], ['vi', 'vim'],
      ['ai', 'claude'], ['ask', 'claude'], ['gpt', 'codex'], ['openai', 'codex'],
      ['github', 'contribute'], ['gh', 'contribute'], ['pr', 'contribute'],
      ['simulator', 'sim'], ['game', 'games'], ['play', 'games'], ['arcade', 'games'],
      ['topic', 'discuss'], ['обсудить', 'discuss'], ['тема', 'discuss'],
      ['chat', 'voices'], ['голоса', 'voices'], ['quotes', 'voices'],
      ['reviews', 'company'], ['review', 'company'], ['addreviews', 'addreview'],
      ['компании', 'companies'], ['компания', 'company'],
      ['about', 'whoami'], ['manifesto', 'principles'], ['doctrine', 'principles'],
      ['contribute_salary', 'submit'], ['добавить-зарплату', 'submit'],
      ['projects', 'showcase'], ['витрина', 'showcase'],
      ['bug', 'feedback'], ['справка', 'apropos'], ['ll', 'ls'],
      ['puzzles', 'fun'], ['задачки', 'fun'], ['задачка', 'fun'],
      // PowerShell dialect – Windows visitors drive the shell with the verbs they know.
      ['dir', 'ls'], ['gci', 'ls'], ['get-childitem', 'ls'],
      ['sl', 'cd'], ['chdir', 'cd'], ['set-location', 'cd'],
      ['type', 'cat'], ['gc', 'cat'], ['get-content', 'cat'],
      ['gl', 'pwd'], ['get-location', 'pwd'],
      ['cls', 'clear'], ['clear-host', 'clear'],
      ['del', 'rm'], ['ri', 'rm'], ['remove-item', 'rm'],
      ['edit', 'nano'], ['ne', 'nano'], ['md', 'mkdir'], ['ni', 'touch'], ['new-item', 'touch'],
      ['move', 'mv'], ['move-item', 'mv'], ['copy', 'cp'], ['copy-item', 'cp'], ['rd', 'rmdir'],
      ['sls', 'grep'], ['select-string', 'grep'],
      ['write-output', 'echo'], ['write-host', 'echo'],
      ['ghy', 'history'], ['get-history', 'history'],
      ['start', 'open'], ['ii', 'open'], ['invoke-item', 'open'],
      ['gal', 'alias'], ['gcm', 'help'], ['get-command', 'help']
    ].forEach(function (p) { alias(p[0], p[1]); });

    // Analytics: count each typed command as a Yandex.Metrika goal (counter 106055675).
    // Sends only the command NAME (first token) – never the free-text arguments – so no PII.
    function track(str) {
      try {
        var name = (str.split(/\s+/)[0] || '').toLowerCase();
        if (!name) return;
        var known = commands.hasOwnProperty(name);
        if (w.ym) w.ym(106055675, 'reachGoal', 'shell_command', { command: name, known: known ? 'yes' : 'no' });
      } catch (e) {}
    }

    // Make the address bar a shareable link for the command just run: a /s/<id>/
    // OG-card page when one exists, else /shell/#<cmd>. Copying the URL = sharing.
    function syncUrl(cmd) {
      try {
        if (!URLSYNC) return;   // embedded terminals (homepage, 404) leave the address bar alone
        if (!(w.history && w.history.replaceState)) return;
        var parts = cmd.split(/\s+/), verb = (parts[0] || '').toLowerCase(), rest = parts.slice(1);
        // `git <sub>` shares as its own two-word card when one exists; the subcommand is
        // consumed from the args so only the remainder rides along as ?cmd= (git log events).
        var id;
        if (verb === 'git' && rest.length) { id = SHARE['git ' + rest[0].toLowerCase()]; if (id) rest = rest.slice(1); }
        if (!id) id = SHARE[verb];
        var args = rest.join(' '), url;
        if (id) {
          // /s/<id>/ card, carrying the exact arguments as ?cmd= (e.g. `find metrics` → /s/find/?cmd=metrics)
          url = w.location.origin + '/s/' + id + '/';
          if (args) url += '?cmd=' + encodeURIComponent(args).replace(/%20/g, '+');
        } else {
          url = w.location.origin + '/shell/#' + encodeURIComponent(cmd);
        }
        w.history.replaceState(null, '', url);
        if (!hintedShare) { hintedShare = true; print('адрес в строке браузера обновился – это ссылка на эту команду с запросом, делитесь', 'dim'); }
      } catch (e) {}
    }

    function run(raw, noTrack) {
      var str = raw.trim();
      var p = el('div', 'ln'); var pr = el('span', 'term-prompt'); pr.innerHTML = promptMarkup() + ' ';
      p.appendChild(pr); p.appendChild(d.createTextNode(str)); out.appendChild(p);
      if (vimMode) {
        if (/^:(q|q!|wq|wq!|x)$/.test(str)) { vimMode = false; print('вышли из vim. Невозможное возможно.', 'ok'); }
        else print('E37: незаписанные изменения. :q! чтобы выйти не сохраняя.', 'err');
        body.scrollTop = body.scrollHeight; return;
      }
      if (!str) { body.scrollTop = body.scrollHeight; return; }
      if (!noTrack) { hist.push(str); track(str); saveHist(); syncUrl(str); }
      hpos = hist.length;
      var parts = str.split(/\s+/), cmd = parts[0].toLowerCase(), args = parts.slice(1);
      if (commands.hasOwnProperty(cmd)) { try { commands[cmd](args); } catch (e) { print('ошибка: ' + e.message, 'err'); } }
      else print(cmd + ': команда не найдена. help – список команд.', 'err');
      body.scrollTop = body.scrollHeight;
    }

    // Echo the current prompt + typed text into the output, like run() does on Enter,
    // so Tab-completion listings appear BELOW the command instead of above the live prompt.
    function echoLine() {
      var p = el('div', 'ln'); var pr = el('span', 'term-prompt'); pr.innerHTML = promptMarkup() + ' ';
      p.appendChild(pr); p.appendChild(d.createTextNode(input.value)); out.appendChild(p); body.scrollTop = body.scrollHeight;
    }

    function complete() {
      var v = input.value;
      // Repeated Tab on an unchanged value → cycle to the next candidate
      if (comp.full !== null && v === comp.full && comp.list.length > 1) {
        comp.idx = (comp.idx + 1) % comp.list.length;
        input.value = comp.base + comp.list[comp.idx];
        comp.full = input.value;
        return;
      }
      var parts = v.split(/\s+/), frag = parts[parts.length - 1], pool;
      var verb0 = (parts[0] || '').toLowerCase();
      if (parts.length <= 1) {
        pool = Object.keys(commands);
      } else if (verb0 === 'salary' && frag.indexOf('/') === -1) {
        // `salary <Tab>` → suggest grades, roles, cities, skills. On empty fragment
        // show a grouped cheatsheet so it's clear what each argument means.
        var S = w.TeamleadsSalary;
        pool = Object.keys(SAL.grades || {}).concat(Object.keys(SAL.roles || {}));
        if (S) pool = pool.concat(S.CITY_KEYS || [], S.SKILL_KEYS || []);
        if (!frag) {
          echoLine();
          print('грейд: ' + Object.keys(SAL.grades || {}).join(' '), 'dim');
          print('роль:  ' + Object.keys(SAL.roles || {}).join(' '), 'dim');
          if (S) {
            print('город: ' + (S.CITY_KEYS || []).slice(0, 10).join(' ') + ' …', 'dim');
            print('скилл: ' + (S.SKILL_KEYS || []).slice(0, 12).join(' ') + ' …', 'dim');
          }
          print('пример: salary senior backend almaty python', 'hint');
          comp.full = null; return;
        }
      } else if (verb0 === 'git' && parts.length <= 2 && frag.indexOf('/') === -1) {
        // `git <Tab>` → suggest subcommands (and their short aliases)
        pool = Object.keys(GIT).concat(Object.keys(GIT_ALIASES));
      } else if (/^(company|reviews|review|addreview|addreviews)$/.test(verb0)) {
        // `company <Tab>` → complete company slugs from the baked list
        if (!frag) {
          echoLine();
          print('напр.: ' + COMPANIES.slice(0, 10).map(function (c) { return c.slug.replace(/-[0-9a-f]{6,}$/, ''); }).join(' · '), 'dim');
          print('companies – полный список компаний с отзывами', 'hint');
          comp.full = null; return;
        }
        pool = COMPANIES.map(function (c) { return c.slug; });
      } else if (frag.indexOf('/') !== -1) {
        // "<dir>/partial" → complete entries within that dir (baked + user FS, union)
        var slash = frag.lastIndexOf('/'), pref = frag.slice(0, slash + 1);
        pool = listDir(normPath(frag.slice(0, slash))).map(function (e) { return pref + e.name + (e.type === 'dir' ? '/' : ''); });
      } else {
        // entries in the current directory (baked sections/links + user nodes)
        pool = listDir(cwd).map(function (e) { return e.name + (e.type === 'dir' ? '/' : ''); });
      }
      if (!frag) { if (pool.length) { echoLine(); print(pool.slice(0, 40).join('   '), 'dim'); } comp.full = null; return; }
      var hits = pool.filter(function (c) { return c.indexOf(frag) === 0; });
      if (!hits.length) { comp.full = null; return; }
      comp.base = parts.slice(0, parts.length - 1).join(' '); if (comp.base) comp.base += ' ';
      comp.list = hits; comp.idx = 0;
      input.value = comp.base + hits[0];     // fill the first match…
      comp.full = input.value;
      if (hits.length > 1) { echoLine(); print(hits.slice(0, 40).join('   '), 'dim'); }  // …and show the rest (Tab cycles them)
    }

    input.addEventListener('keydown', function (e) {
      if (simSt || editorSt) return;  // sim / nano panels own the keyboard while active
      if (e.key === 'Enter') { run(input.value); input.value = ''; }
      else if (e.key === 'Tab') { e.preventDefault(); complete(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); histPrev(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); histNext(); }
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'l' || e.key === 'L')) { e.preventDefault(); commands.clear(); }
    });

    // Simulator keyboard: a/b/c (or 1/2/3) to choose, Enter to advance, s share, q/Esc quit.
    root.addEventListener('keydown', function (e) {
      if (!simSt) return;
      var k = (e.key || '');
      if (k === 'Escape' || k.toLowerCase() === 'q') { e.preventDefault(); simExit(); return; }
      if (k.toLowerCase() === 's') { e.preventDefault(); simShareUI(); return; }
      if (simSt.phase === 'choice') {
        var idx = 'abcdefgh'.indexOf(k.toLowerCase());
        if (idx < 0 && /^[1-9]$/.test(k)) idx = parseInt(k, 10) - 1;
        if (idx >= 0 && idx < simSt.list[simSt.idx].options.length) { e.preventDefault(); simPick(idx); }
      } else if (k === 'Enter') {
        if (e.target && e.target.tagName === 'BUTTON') return;  // let the focused button fire its own click
        e.preventDefault(); simAdvance();
      }
    });
    body.addEventListener('click', function (e) { if (e.target.tagName !== 'A') input.focus(); });

    // Mobile helper bar – taps map to the same actions as the hardware keys.
    var keysBar = root.querySelector('[data-term-keys]');
    if (keysBar) keysBar.addEventListener('click', function (e) {
      var k = e.target && e.target.getAttribute ? e.target.getAttribute('data-k') : null;
      if (!k) return;
      input.focus();
      if (k === 'tab') complete();
      else if (k === 'up') histPrev();
      else if (k === 'down') histNext();
      else if (k === 'run') { run(input.value); input.value = ''; }
      else if (k === 'clear') commands.clear();
    });

    // nano editor: ^O save, ^X save+exit, Esc discard+exit, Tab inserts spaces.
    if (edArea) {
      edArea.addEventListener('input', function () { if (editorSt) { editorSt.dirty = true; nanoMeta(); } });
      edArea.addEventListener('keydown', function (e) {
        if (!editorSt) return;
        var k = (e.key || '').toLowerCase();
        if ((e.ctrlKey || e.metaKey) && k === 'o') { e.preventDefault(); nanoSave(); print('nano: сохранено /' + editorSt.path, 'ok'); return; }
        if ((e.ctrlKey || e.metaKey) && k === 'x') { e.preventDefault(); if (editorSt.dirty) nanoSave(); nanoExit(); return; }
        if (k === 'escape') { e.preventDefault(); nanoExit(); return; }
        if (e.key === 'Tab') {
          e.preventDefault();
          var s = edArea.selectionStart, en = edArea.selectionEnd;
          edArea.value = edArea.value.slice(0, s) + '  ' + edArea.value.slice(en);
          edArea.selectionStart = edArea.selectionEnd = s + 2;
          editorSt.dirty = true; nanoMeta();
        }
      });
    }
    if (edPanel) edPanel.addEventListener('click', function (e) {
      var k = e.target && e.target.getAttribute ? e.target.getAttribute('data-ek') : null;
      if (!k || !editorSt) return;
      if (k === 'save') { nanoSave(); print('nano: сохранено /' + editorSt.path, 'ok'); try { edArea.focus(); } catch (_) {} }
      else if (k === 'exit') { if (editorSt.dirty) nanoSave(); nanoExit(); }
    });

    // A shareable deep-link can carry a command: /shell/#cat events/meetup-2026-06-24
    // or /shell/?cmd=cat%20articles/... – it runs once the shell is ready.
    function urlCommand() {
      try {
        var h = (w.location.hash || '').replace(/^#/, '');
        if (h) return decodeURIComponent(h).trim();
        var m = (w.location.search || '').match(/[?&]cmd=([^&]*)/);
        if (m) return decodeURIComponent(m[1].replace(/\+/g, ' ')).trim();
      } catch (e) {}
      return '';
    }
    function ready() {
      if (line) line.hidden = false; input.focus();
      var urlcmd = urlCommand();
      if (urlcmd) {
        // Assistant share links (claude/codex …) land in the terminal with the command
        // ENTERED in the prompt, ready to run – don't auto-fire someone else's question.
        // Other share links (cat, sim, salary …) still auto-run.
        var verb0 = (urlcmd.split(/\s+/)[0] || '').toLowerCase();
        if (/^(claude|codex|ai|ask|gpt|openai)$/.test(verb0)) {
          input.value = urlcmd;
          try { input.setSelectionRange(urlcmd.length, urlcmd.length); } catch (e) {}
          input.focus();
          return;
        }
        setTimeout(function () { run(urlcmd); }, reduced ? 0 : 150); return;
      }
      if (mode === 'full') setTimeout(function () { run('ls', true); }, reduced ? 0 : 140);
    }
    var boot;
    if (mode === '404') {
      var path = w.location.pathname || '/404';
      boot = [['$ curl -i https://teamleads.kz' + path, 'cy'], ['HTTP/1.1 404 Not Found', 'dim'], ['content-type: text/html; charset=utf-8', 'dim'], ['', null], ['Ресурс не найден. Но раз вы здесь – поднимаем сессию.', null], ['Это Shell Mode: навигируйте по сайту прямо отсюда. help – команды.', 'hint'], ['', null]];
    } else {
      boot = [['Teamleads Shell – навигация по сайту из терминала.', 'cy'], ['help – команды · ls – осмотреться · open <стр> – открыть · find <слово> – поиск.', 'hint'], ['С чего начать: sim – симулятор развилок · salary senior backend · principles – доктрина.', 'hint'], ['', null]];
    }
    function bootSeq(i) { if (i >= boot.length) { ready(); return; } print(boot[i][0], boot[i][1]); setTimeout(function () { bootSeq(i + 1); }, reduced ? 0 : 200); }
    setPrompt(); bootSeq(0);

    // Let other UI (the Claude/Codex assistants) run a command in this live terminal.
    if (mode === 'full') { w.TeamleadsShell = w.TeamleadsShell || {}; w.TeamleadsShell.run = function (c) { if (simSt) simExit(); input.value = ''; run(String(c || '')); }; }
  }

  function autoMount() { var ns = d.querySelectorAll('[data-term]'); for (var i = 0; i < ns.length; i++) mount(ns[i]); }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', autoMount); else autoMount();
  w.TeamleadsShell = w.TeamleadsShell || {}; w.TeamleadsShell.mount = mount;
})(window, document);
