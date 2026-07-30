/*!
 * Help, documentation, environment and easter-egg commands: help, man, whatis,
 * apropos, which, alias, theme, share, feedback, anon, neofetch, date, echo, history,
 * clear, fortune, vim, top, sudo, coffee, 42, home, exit. The alias table and
 * man pages come from S; `hist` and `vimMode` are reached via accessors.
 */
export function makeMetaCommands(S) {
  var print = S.print, el = S.el, link = S.link, pad = S.pad, printNode = S.printNode, d = S.d, w = S.w, root = S.root, out = S.out, go = S.go,
      MANPAGES = S.MANPAGES, manSummary = S.manSummary, canonName = S.canonName, ALIASES = S.ALIASES, SHARE = S.SHARE,
      copyText = S.copyText, psActive = S.psActive, setPrompt = S.setPrompt, sectionNames = S.sectionNames, linkNames = S.linkNames, pool = S.pool,
      getHist = S.getHist, setVimMode = S.setVimMode;

  return {
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
        ['anon <вопрос>', 'спросить в чат анонимно (через модерацию)'],
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
    date: function () { print(new Date().toString()); },
    echo: function (a) { print(a.join(' ')); },
    history: function () { var hist = getHist(); if (!hist.length) { print('история пуста', 'dim'); return; } hist.forEach(function (c, i) { print('  ' + pad(i + 1, 4) + c); }); },
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
      if (!Object.prototype.hasOwnProperty.call(S.commands, k)) { print('which: ' + k + ': команда не найдена', 'err'); return; }
      if (ALIASES[k]) print(k + ' → ' + canonName(k) + '  (алиас)', 'cy');
      else print(k + '  – встроенная команда', null);
    },
    alias: function (a) {
      var k = (a[0] || '').toLowerCase();
      if (k) {
        if (ALIASES[k]) print(k + ' → ' + ALIASES[k], 'cy');
        else if (Object.prototype.hasOwnProperty.call(S.commands, k)) print(k + ' – команда, не алиас', 'dim');
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
      var hist = getHist(), last = null;
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
    // Anonymous question to the community chat: the shell twin of /anon/. The text
    // goes to the same moderated pipeline; nothing about the sender is stored.
    anon: function (a) {
      var body = a.join(' ').trim();
      if (!body) {
        print('anon <вопрос> – задать вопрос в чат сообщества анонимно.', 'accent');
        print('Админ проверит текст и опубликует его в чате от имени бота.');
        print('Автор не сохраняется: ни имени, ни id, ни IP – только текст.', 'dim');
        print('Код бэкенда открыт – проверьте сами, что там хранится:', 'dim');
        printNode(link('https://github.com/belyaevsa/teamleads-2025/tree/master/backend', 'github.com/belyaevsa/teamleads-2025 · backend', true));
        print('Длинный вопрос удобнее набрать на странице:', 'hint');
        printNode(link('/anon/', 'teamleads.kz/anon'));
        return;
      }
      if (body.length < 20) { print('Слишком коротко: нужно хотя бы 20 символов. Чату нужен контекст.', 'err'); return; }

      print('Отправляем…', 'dim');
      w.fetch(w.TEAMLEADS_ANON_API || '/api/anon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: body, source: 'shell' })
      }).then(function (r) {
        if (r.status === 429) throw new Error('rate');
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (data) {
        print('Запрос ' + ((data && data.publicId) || '') + ' отправлен на модерацию.', 'ok');
        print('Опубликуем в чате анонимно. Статус – в боте: /status ' + ((data && data.publicId) || ''), 'dim');
        printNode(link('https://t.me/temlead_helper_bot', '@temlead_helper_bot', true));
        try { if (w.ym) w.ym(106055675, 'reachGoal', 'anon_submit', { source: 'shell' }); } catch (e) {}
      }).catch(function (err) {
        print(err && err.message === 'rate'
          ? 'Слишком много запросов с вашего адреса. Попробуйте через час или напишите боту.'
          : 'Не отправилось. Попробуйте форму на /anon/ или бота @temlead_helper_bot.', 'err');
      });
    },
    // ── easter eggs ──
    vim: function () { setVimMode(true); print('~', 'dim'); print('~  VIM – Vi IMproved', 'dim'); print('~', 'dim'); print('Вы в vim. Удачи с выходом: :q (или :q!).', 'hint'); },
    top: function () {
      print('PID   COMMAND           %CPU  STATE', 'dim');
      [['1', 'daily-standup', '38', 'running'], ['7', 'retro', '12', 'blocked'], ['42', 'coffee', '73', 'critical'], ['99', 'code-review', '21', 'waiting'], ['100', 'tg-notifications', '55', 'running']].forEach(function (p) { print('  ' + pad(p[0], 5) + pad(p[1], 18) + pad(p[2], 6) + p[3]); });
      print('тимлид не кодит – тимлид анблокает.', 'dim');
    },
    sudo: function () { print('guest отсутствует в файле sudoers. Инцидент запротоколирован. 🚨', 'err'); },
    coffee: function () { print('☕  Тимлид не кодит. Тимлид пьёт кофе и анблокает команду.', 'accent'); },
    '42': function () { print('Ответ на главный вопрос жизни, вселенной и всего такого – 42.', 'accent'); print('Но запрошенной страницы среди ответов нет.', 'dim'); },
    home: function () { go('/'); },
    exit: function () { go('/'); }
  };
}
