/*!
 * git: the site modeled as a content repository. The top-level `git` command is a
 * multiplexer that dispatches into GIT. Real subcommands (log, show, diff, blame,
 * shortlog, branch, checkout, status, remote, pull, grep, clone) reuse the same
 * sections the filesystem commands walk; the rest keep the shell's voice.
 *
 * Cross-command calls (show→cat, checkout→cd, pull→latest, …) resolve through
 * S.commands at call time; `cwd` is read via S.getCwd().
 */
export function makeGit(S) {
  var print = S.print, printNode = S.printNode, el = S.el, link = S.link, pad = S.pad,
      paginate = S.paginate, pageNav = S.pageNav, sections = S.sections, sectionNames = S.sectionNames,
      QUESTIONS = S.QUESTIONS, resolvePage = S.resolvePage, TG = S.TG, FRIENDS = S.FRIENDS, getCwd = S.getCwd;
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
      S.commands.cat([arg]);
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
      var cwd = getCwd(), branch = cwd || 'master';
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
      var cwd = getCwd();
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
      if (t === 'master' || t === 'main') { S.commands.cd([]); print("Switched to branch '" + t + "'", 'ok'); return; }
      if (!sections[t]) { print("error: pathspec '" + t + "' did not match. git branch – список веток.", 'err'); return; }
      S.commands.cd([t]); print("Switched to branch '" + t + "'", 'ok');
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
      S.commands.latest([]);
    },
    grep: function (rest) { S.commands.grep(rest || []); },
    clone: function () { print("Cloning into 'teamleads-2025'…", 'dim'); S.commands.contribute([]); },
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

  function git(a) {
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
  }

  return { git: git, gitNames: Object.keys(GIT).concat(Object.keys(GIT_ALIASES)) };
}
