/*!
 * Filesystem + navigation + reading commands: ls, cd, open, cat, pwd, tree,
 * find, grep, latest, random, head, tail, wc, stat, and the writable mutations
 * (mkdir, touch, rm, rmdir, mv, cp). All path resolution goes through the fs.js
 * helpers on S; `cwd` is read/written via S.getCwd()/setCwd(); cross-command
 * calls go through S.commands. Returns a partial command map.
 */
export function makeFsCommands(S) {
  var print = S.print, el = S.el, link = S.link, linkpad = S.linkpad, pad = S.pad, printNode = S.printNode,
      paginate = S.paginate, pageNav = S.pageNav, go = S.go, fmtTs = S.fmtTs, mdLine = S.mdLine, mdTable = S.mdTable,
      normPath = S.normPath, statPath = S.statPath, listDir = S.listDir, lsRenderEntry = S.lsRenderEntry,
      baseName = S.baseName, parentOf = S.parentOf, bakedAt = S.bakedAt, isDir = S.isDir,
      ufs = S.ufs, ufsUser = S.ufsUser, ufsNow = S.ufsNow, ensureDir = S.ensureDir, ufsChildrenCount = S.ufsChildrenCount,
      ufsRemoveSubtree = S.ufsRemoveSubtree, ufsSave = S.ufsSave, resolvePage = S.resolvePage, fetchPageText = S.fetchPageText,
      plainText = S.plainText, headTail = S.headTail, sections = S.sections, links = S.links,
      sectionNames = S.sectionNames, linkNames = S.linkNames, pool = S.pool, w = S.w, out = S.out, body = S.body,
      setPrompt = S.setPrompt, pathStr = S.pathStr, reduced = S.reduced,
      getCwd = S.getCwd, setCwd = S.setCwd, getPrevCwd = S.getPrevCwd, setPrevCwd = S.setPrevCwd;

  // ── Mermaid: lazy-load the self-hosted runtime the first time `cat` hits a
  //    ```mermaid block, then render fenced diagrams to inline SVG. ────────────
  var _mermaidP = null, _mermaidSeq = 0;
  function ensureMermaid() {
    if (_mermaidP) return _mermaidP;
    _mermaidP = new Promise(function (res, rej) {
      if (w.mermaid) return res(w.mermaid);
      if (!w.document) return rej(new Error('no document'));
      var s = w.document.createElement('script');
      s.src = '/js/mermaid.min.js'; s.async = true;
      s.onload = function () {
        if (!w.mermaid) return rej(new Error('mermaid missing after load'));
        try { w.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'dark' }); } catch (e) {}
        res(w.mermaid);
      };
      s.onerror = function () { rej(new Error('mermaid failed to load')); };
      w.document.head.appendChild(s);
    });
    return _mermaidP;
  }
  function renderMermaid(code) {
    var box = el('div', 'md-mermaid');
    var ph = el('div', 'md-mermaid-loading'); ph.textContent = 'рендер диаграммы…';
    box.appendChild(ph);
    var id = 'sh-mmd-' + (++_mermaidSeq);
    ensureMermaid().then(function (m) { return m.render(id, code); }).then(function (r) {
      box.innerHTML = r.svg;
      if (r.bindFunctions) r.bindFunctions(box);
      if (body) body.scrollTop = body.scrollHeight;
    }).catch(function () {
      box.className = 'md-pre'; box.textContent = code;   // graceful fallback: show the source
    });
    return box;
  }
  function renderCode(code) { var pre = el('pre', 'md-pre'); pre.textContent = code; return pre; }

  return {
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
      if (arg === '-') { var d0 = getPrevCwd(); setPrevCwd(getCwd()); setCwd(d0); setPrompt(); print(pathStr(), 'dim'); return; }
      // a bare link name navigates to the real page (join, salary, …), from anywhere
      if (arg && arg.indexOf('/') === -1 && links[arg] && !ufs.nodes[normPath(arg)] && !sections[arg]) { go(links[arg]); return; }
      var target = normPath(arg === '' ? '~' : arg);
      if (target !== '' && !isDir(target)) {
        var s = statPath(target);
        print(s && s.type === 'file' ? ('cd: не каталог: /' + target) : ('cd: нет такого каталога: /' + target), 'err');
        return;
      }
      setPrevCwd(getCwd()); setCwd(target); setPrompt();
    },
    open: function (a) {
      var arg = (a[0] || '').replace(/^\/|\/$/g, '');
      if (!arg) { print('open: укажите страницу. Список – ls.', 'err'); return; }
      if (links[arg]) { go(links[arg]); return; }
      var sec = null, name = arg;
      if (arg.indexOf('/') !== -1) { var p = arg.split('/'); sec = p[0]; name = p[1]; }
      else if (getCwd()) { sec = getCwd(); }
      else if (sections[arg]) { return S.commands.cd(a); }
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
      else if (getCwd()) { sec = getCwd(); }
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
            var fence = /^```(\w*)\s*$/.exec(slice[li]);
            if (fence) {
              var lang = fence[1] || '', clines = [], lj = li + 1;
              for (; lj < slice.length; lj++) { if (/^```\s*$/.test(slice[lj])) break; clines.push(slice[lj]); }
              var code = clines.join('\n');
              out.appendChild(lang === 'mermaid' ? renderMermaid(code) : renderCode(code));
              li = lj;   // skip the closing fence (for-loop's li++ steps past it)
              continue;
            }
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
    }
  };
}
