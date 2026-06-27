/*!
 * User filesystem: a writable overlay in localStorage, unioned OVER the baked
 * read-only content. Full-overlay model: user nodes may be created at ANY path
 * (even inside /events), a user node SHADOWS the baked node at the same path,
 * and deleting a baked node records a tombstone (whiteout) that hides it.
 * Keyed by a normalized path string with NO leading slash – same encoding as
 * `cwd` ('' = root, 'projects', 'projects/sub/idea.md').
 *
 * The current directory is read through S.getCwd() so the owning module keeps
 * `cwd` as a plain local (no shared-state rewrite); `ufs` is returned by value
 * (an object) so command modules mutate the same instance.
 */
export function makeFs(S) {
  var w = S.w, print = S.print, printNode = S.printNode, el = S.el, linkpad = S.linkpad, pad = S.pad, fmtTs = S.fmtTs;
  var sections = S.sections, links = S.links, sectionNames = S.sectionNames, linkNames = S.linkNames, pool = S.pool;
  var getCwd = S.getCwd;

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

  // Resolve a `section/name` (or bare name in cwd) to a baked page item – shared by cat/head/tail/wc/stat.
  function resolvePage(arg) {
    arg = (arg || '').replace(/^\/|\/$/g, '');
    if (!arg || links[arg]) return null;
    var sec = null, name = arg, cwd = getCwd();
    if (arg.indexOf('/') !== -1) { var p = arg.split('/'); sec = p[0]; name = p[1]; }
    else if (cwd) sec = cwd;
    var hit = null;
    if (sec && sections[sec]) sections[sec].forEach(function (it) { if (it.n === name) hit = it; });
    if (!hit) pool.forEach(function (it) { if (it.n === name) hit = it; });
    return hit;
  }
  // Normalize an arg to a path with NO leading/trailing slash ('' = root). Leading
  // / or ~ → absolute; otherwise relative to cwd. Resolves '.' and '..'.
  function normPath(arg) {
    arg = String(arg == null ? '' : arg);
    var absolute = arg.charAt(0) === '/' || arg.charAt(0) === '~';
    if (arg.charAt(0) === '~') arg = arg.slice(1);
    var cwd = getCwd();
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

  return {
    ufs: ufs, ufsSave: ufsSave, ufsUser: ufsUser, ufsNow: ufsNow,
    resolvePage: resolvePage, normPath: normPath, parentOf: parentOf, baseName: baseName,
    bakedAt: bakedAt, bakedChildren: bakedChildren, statPath: statPath, isDir: isDir,
    ufsChildrenCount: ufsChildrenCount, listDir: listDir, ensureDir: ensureDir,
    ufsRemoveSubtree: ufsRemoveSubtree, lsRenderEntry: lsRenderEntry
  };
}
