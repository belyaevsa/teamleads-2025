/*!
 * Community + content commands: discuss, toolkit, voices, companies, company,
 * addreview, tools, friends, claude, codex, join, telegram, contribute, submit,
 * showcase, whoami, principles, fun. Pull data (VOICES/COMPANIES/FRIENDS/QUESTIONS)
 * and helpers from S; cross-command calls and salary submit go through S.
 */
export function makeContentCommands(S) {
  var print = S.print, el = S.el, link = S.link, linkpad = S.linkpad, pad = S.pad, printNode = S.printNode,
      paginate = S.paginate, pageNav = S.pageNav, fmtDate = S.fmtDate, rstar = S.rstar, linkTI = S.linkTI,
      TIWEB = S.TIWEB, TIAPI = S.TIAPI, d = S.d, w = S.w, go = S.go, sections = S.sections, sectionNames = S.sectionNames,
      VOICES = S.VOICES, COMPANIES = S.COMPANIES, FRIENDS = S.FRIENDS, QUESTIONS = S.QUESTIONS, TG = S.TG,
      pageArg = S.pageArg, resolveCompany = S.resolveCompany, discussFooter = S.discussFooter,
      fetchPageText = S.fetchPageText, cleanPuzzle = S.cleanPuzzle, downloadText = S.downloadText, run = S.run;

  return {
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
      if (/^(salary|зарплат|вилк)/.test(what)) { if (S.submitSalary) S.submitSalary(); else S.invoke('salary', ['submit']); return; }
      if (/^(review|отзыв)/.test(what)) { S.commands.addreview(a.slice(1)); return; }
      if (/^(project|projects|showcase|проект|витрин)/.test(what)) { S.commands.showcase(['submit']); return; }
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
      S.commands.ls(['showcase']);
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
    // ── fun: инженерные задачки from content/fun. Open one in the Claude/Codex
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
    }
  };
}
