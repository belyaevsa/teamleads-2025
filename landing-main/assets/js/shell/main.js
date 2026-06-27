/*!
 * Teamleads Shell – a tiny, dependency-free terminal that turns the site into a
 * navigable filesystem. Config comes from data-* attributes on the mount node:
 *   data-mode  "full" | "404"
 *   data-tg    Telegram URL
 *   data-fs    JSON: { sections: {name: [{n,u,t,d,a,p}]}, links: {name:url} }
 *              (a = author, p = participant names – used by `git blame`/`shortlog`)
 * Auto-mounts every [data-term] on load. Also exposed as window.TeamleadsShell.
 *
 * Source is split into ES modules under assets/js/shell/ and bundled by Hugo's
 * js.Build (esbuild) into a single fingerprinted IIFE. Each module is a factory
 * that receives the shell's helpers/state so per-mount instances stay isolated.
 */
import { makeDom } from './dom.js';
import { makeMarkdown } from './markdown.js';
import { makeFs } from './fs.js';
import { makeGit } from './git.js';
import { makeEditor } from './editor.js';
import { makeSim } from './sim.js';
import { makeTama } from './tama.js';
import { makeMan } from './man.js';
import { makeSalary } from './salary.js';
import { makeFsCommands } from './commands-fs.js';
import { makeContentCommands } from './commands-content.js';
import { makeMetaCommands } from './commands-meta.js';

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
    var hud = root.querySelector('[data-term-hud]');
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

    // DOM + formatting helpers live in dom.js – one instance per mounted terminal.
    var _dom = makeDom({ d: d, w: w, out: out, body: body, reduced: reduced });
    var el = _dom.el, print = _dom.print, printNode = _dom.printNode, link = _dom.link, pad = _dom.pad, linkpad = _dom.linkpad,
        linkTI = _dom.linkTI, fmtDate = _dom.fmtDate, rstar = _dom.rstar, fmtTs = _dom.fmtTs, paginate = _dom.paginate, pageNav = _dom.pageNav, go = _dom.go,
        TIAPI = _dom.TIAPI, TIWEB = _dom.TIWEB, RU_MON = _dom.RU_MON;
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
    // User filesystem engine + page resolution live in fs.js. `cwd` is read via the
    // getCwd accessor so it stays a plain local here; `ufs` is a shared object.
    var _fs = makeFs({
      w: w, print: print, printNode: printNode, el: el, link: link, linkpad: linkpad, pad: pad, fmtTs: fmtTs,
      sections: sections, links: links, sectionNames: sectionNames, linkNames: linkNames, pool: pool,
      getCwd: function () { return cwd; }
    });
    var ufs = _fs.ufs, ufsSave = _fs.ufsSave, ufsUser = _fs.ufsUser, ufsNow = _fs.ufsNow,
        resolvePage = _fs.resolvePage, normPath = _fs.normPath, parentOf = _fs.parentOf, baseName = _fs.baseName,
        bakedAt = _fs.bakedAt, bakedChildren = _fs.bakedChildren, statPath = _fs.statPath, isDir = _fs.isDir,
        ufsChildrenCount = _fs.ufsChildrenCount, listDir = _fs.listDir, ensureDir = _fs.ensureDir,
        ufsRemoveSubtree = _fs.ufsRemoveSubtree, lsRenderEntry = _fs.lsRenderEntry;
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

    // Markdown rendering for `cat` lives in markdown.js (pure; injected DOM helpers).
    var _md = makeMarkdown({ el: el, link: link, d: d });
    var mdInline = _md.mdInline, mdLine = _md.mdLine, mdRow = _md.mdRow, mdIsSep = _md.mdIsSep, mdTable = _md.mdTable;

    function copyText(t) {
      if (w.navigator && w.navigator.clipboard && w.navigator.clipboard.writeText) return w.navigator.clipboard.writeText(t);
      return new Promise(function (res, rej) {
        try { var ta = d.createElement('textarea'); ta.value = t; ta.style.position = 'absolute'; ta.style.left = '-9999px'; d.body.appendChild(ta); ta.select(); var ok = d.execCommand('copy'); d.body.removeChild(ta); ok ? res() : rej(new Error('copy')); } catch (e) { rej(e); }
      });
    }

    // man pages (the big data block) live in man.js.
    var _man = makeMan(), MANPAGES = _man.MANPAGES, manSummary = _man.manSummary;

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

    // ════════════════════════════════════════════════════════════════════════
    // Shared context `S`: every command module is a factory `make…(S)` that pulls
    // helpers/config/fs from here and returns a partial command map. Mutable state
    // (cwd, vimMode, …) stays as locals in this file and is reached via accessors;
    // `S.commands` is wired AFTER the registry is assembled (commands call each other).
    // ════════════════════════════════════════════════════════════════════════
    var S = {
      w: w, d: d, root: root, out: out, body: body, input: input, line: line,
      promptEl: promptEl, titleEl: titleEl, simPanel: simPanel, hud: hud, edPanel: edPanel, edArea: edArea, edName: edName, edMeta: edMeta,
      mode: mode, URLSYNC: URLSYNC, reduced: reduced, TG: TG,
      FS: FS, SAL: SAL, FRIENDS: FRIENDS, SCEN: SCEN, QUIZZES: QUIZZES, SHARE: SHARE, QUESTIONS: QUESTIONS, VOICES: VOICES, COMPANIES: COMPANIES,
      sections: sections, links: links, sectionNames: sectionNames, linkNames: linkNames, pool: pool,
      // dom + formatting
      el: el, print: print, printNode: printNode, link: link, pad: pad, linkpad: linkpad, paginate: paginate, pageNav: pageNav,
      go: go, fmtDate: fmtDate, fmtTs: fmtTs, rstar: rstar, linkTI: linkTI, TIAPI: TIAPI, TIWEB: TIWEB, RU_MON: RU_MON,
      // markdown
      mdLine: mdLine, mdTable: mdTable, mdInline: mdInline,
      // filesystem
      ufs: ufs, ufsSave: ufsSave, ufsUser: ufsUser, ufsNow: ufsNow, resolvePage: resolvePage, normPath: normPath,
      parentOf: parentOf, baseName: baseName, bakedAt: bakedAt, bakedChildren: bakedChildren, statPath: statPath, isDir: isDir,
      ufsChildrenCount: ufsChildrenCount, listDir: listDir, ensureDir: ensureDir, ufsRemoveSubtree: ufsRemoveSubtree, lsRenderEntry: lsRenderEntry,
      // page + content helpers
      fetchPageText: fetchPageText, plainText: plainText, downloadText: downloadText, cleanPuzzle: cleanPuzzle,
      discussFooter: discussFooter, pageArg: pageArg, resolveCompany: resolveCompany,
      MANPAGES: MANPAGES, manSummary: manSummary,
      copyText: copyText, setPrompt: setPrompt, psActive: psActive, pathStr: pathStr, winPath: winPath,
      track: track, run: run, syncUrl: syncUrl,
      // accessors for mutable state that stays local in this file
      getCwd: function () { return cwd; }, setCwd: function (v) { cwd = v; },
      getPrevCwd: function () { return prevCwd; }, setPrevCwd: function (v) { prevCwd = v; },
      getVimMode: function () { return vimMode; }, setVimMode: function (v) { vimMode = v; },
      getHist: function () { return hist; },
      ALIASES: ALIASES, canonName: canonName, headTail: headTail,
      submitSalary: null,   // wired from salary.js below
      commands: null        // wired after the registry is built
    };
    // git subsystem → git.js
    var _git = makeGit(S), gitNames = _git.gitNames;
    var _editor = makeEditor(S);   // nano modal (owns editorSt, installs its own keyboard)
    var _sim = makeSim(S);         // simulator/quiz/arcade (owns simSt, installs its own keyboard)
    var _tama = makeTama(S);       // тимагочи: команды-действия + анимированный HUD-напарник
    var _salary = makeSalary(S);   // salary subsystem (live data + offline fallback)
    S.submitSalary = _salary.submitSalary;

    // ── command registry: assembled from grouped factory modules + the already-
    //    extracted subsystem commands (salary, sim, git, nano). See README.md.
    var commands = Object.assign(
      {},
      makeFsCommands(S),       // ls cd open cat pwd tree find grep latest random head tail wc stat mkdir touch rm rmdir mv cp
      makeContentCommands(S),  // discuss toolkit voices companies company addreview tools friends claude codex join telegram contribute submit showcase whoami principles fun
      makeMetaCommands(S),     // help man whatis apropos which alias theme share feedback neofetch date echo history clear fortune vim top sudo coffee 42 home exit
      {
        salary: _salary.salary,
        sim: _sim.sim, quiz: _sim.quiz, games: _sim.games, sudoku: _sim.sudoku,
        git: _git.git,
        nano: _editor.nano
      },
      _tama.commands        // { team } – тимагочи; действия только через team <действие>, не как отдельные команды
    );
    S.commands = commands;   // wire cross-command calls (git show→cat, checkout→cd, …)
    // Aliases go through alias(name, target): it records the mapping (powering `which`
    // and `alias`) and refuses to overwrite a real command, so a future duplicate like
    // the old `submit`→`addreview` clash is caught at load instead of silently breaking.
    [
      ['go', 'open'], ['search', 'find'], ['answer', '42'], ['vi', 'vim'],
      ['ai', 'claude'], ['ask', 'claude'], ['gpt', 'codex'], ['openai', 'codex'],
      ['github', 'contribute'], ['gh', 'contribute'], ['pr', 'contribute'],
      ['simulator', 'sim'], ['game', 'games'], ['play', 'games'], ['arcade', 'games'],
      ['tamagotchi', 'team'], ['тимагочи', 'team'], ['pet', 'team'],
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
        // `git <sub>` / `team <sub>` share as their own two-word card when one exists; the
        // subcommand is consumed from the args so only the remainder rides along as ?cmd=.
        var id;
        if ((verb === 'git' || verb === 'team') && rest.length) { id = SHARE[verb + ' ' + rest[0].toLowerCase()]; if (id) rest = rest.slice(1); }
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
        pool = gitNames;
      } else if ((verb0 === 'team' || verb0 === 'tamagotchi' || verb0 === 'pet') && parts.length <= 2 && frag.indexOf('/') === -1) {
        // `team <Tab>` → suggest тимагочи actions + management subcommands
        pool = ['new', '1on1', 'mentor', 'cr', 'pair', 'delegate', 'retro', 'hire', 'fire', 'ship', 'standup', 'share', 'reset', 'help'];
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
      if (_sim.isActive() || _editor.isActive()) return;  // sim / nano panels own the keyboard while active
      if (e.key === 'Enter') { run(input.value); input.value = ''; }
      else if (e.key === 'Tab') { e.preventDefault(); complete(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); histPrev(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); histNext(); }
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'l' || e.key === 'L')) { e.preventDefault(); commands.clear(); }
    });

    // (Simulator keyboard handler lives in sim.js, installed on the root node.)
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

    // Title-bar window controls (the macOS-style dots). green = expand, yellow = roll up.
    var bar = root.querySelector('.term-bar');
    // The command to carry when expanding: whatever is typed now, else the last one run.
    function currentCmd() {
      var v = (input.value || '').trim();
      return v || (hist.length ? hist[hist.length - 1] : '');
    }
    if (bar) bar.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('[data-term-btn]') : null;
      // Clicking anywhere on the bar while rolled up restores the window.
      if (!btn) { if (root.classList.contains('term--rolled')) { root.classList.remove('term--rolled'); input.focus(); } return; }
      var act = btn.getAttribute('data-term-btn');
      if (act === 'min') {
        // Roll the window up to a compact size (like the homepage embed); click again to restore.
        root.classList.remove('term--max');
        root.classList.toggle('term--rolled');
        if (!root.classList.contains('term--rolled')) input.focus();
      } else if (act === 'max') {
        root.classList.remove('term--rolled');
        if (URLSYNC) {
          // Already on /shell/ – no bigger page to open, so toggle true fullscreen.
          root.classList.toggle('term--max');
          input.focus();
        } else {
          // Homepage / 404 embed – open the dedicated /shell/ page with the current command.
          var cmd = currentCmd();
          w.location.href = '/shell/' + (cmd ? '#' + encodeURIComponent(cmd) : '');
        }
      }
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
      if (mode === 'full') _tama.resume();   // тихо поднять HUD-напарника, если есть сохранение
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
    if (mode === 'full') { w.TeamleadsShell = w.TeamleadsShell || {}; w.TeamleadsShell.run = function (c) { if (_sim.isActive()) _sim.exit(); input.value = ''; run(String(c || '')); }; }
  }

  function autoMount() { var ns = d.querySelectorAll('[data-term]'); for (var i = 0; i < ns.length; i++) mount(ns[i]); }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', autoMount); else autoMount();
  w.TeamleadsShell = w.TeamleadsShell || {}; w.TeamleadsShell.mount = mount;
})(window, document);
