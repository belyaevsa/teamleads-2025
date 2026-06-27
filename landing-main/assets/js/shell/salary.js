/*!
 * salary: live IT market data for Kazakhstan from techinterview.space via the
 * shared window.TeamleadsSalary module, with the static community model (data-salary)
 * as an offline fallback. salaryLive renders charts/analytics; salaryNudge always
 * asks the visitor to contribute their own salary so the sample improves.
 * (`ctx` is the shell context; the live API object is the local `S` inside helpers.)
 */
export function makeSalary(ctx) {
  var print = ctx.print, printNode = ctx.printNode, el = ctx.el, link = ctx.link, d = ctx.d, w = ctx.w, pad = ctx.pad, SAL = ctx.SAL;

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

  function salary(a) {
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
  }

  return { salary: salary, salaryLive: salaryLive, salaryOffline: salaryOffline, salaryNudge: salaryNudge, submitSalary: submitSalary };
}
