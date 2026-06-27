/*!
 * Тимагочи «Тимлид» – вырасти разработчика и команду прямо в консоли. Анимированный
 * напарник живёт в HUD-полосе над выводом (data-term-hud) и реагирует на состояние;
 * команды (team · 1on1 · mentor · cr · pair · delegate · retro · hire · fire · ship ·
 * standup) меняют метрики команды: доверие, экспертиза, конфликт, настрой.
 *
 * В отличие от sim.js это НЕ модальная панель: игра управляется обычными командами в
 * приглашении, поэтому клавиатуру не перехватывает. Новое здесь – живое состояние с
 * сохранением в localStorage (tnk_shell_tama) и распад во времени между сессиями
 * (Date.now() при загрузке): без ухода доверие падает, конфликт зреет, настрой тает.
 * Анимация – тик setInterval, моргающий ASCII-кадр (моргание/смена выражения).
 *
 * Состояние – локальное в замыкании (per-mount), как требует принцип изоляции.
 */
export function makeTama(S) {
  var w = S.w, el = S.el, print = S.print, printNode = S.printNode, hud = S.hud, run = S.run;
  var KEY = 'tnk_shell_tama';
  var GOAL_SHIP = 5;           // релизов для победы
  var WIN_STAGE = 4;           // индекс стадии «тимлид»

  // ── статичные данные ──
  var ARCHES = {
    coder:      { label: 'бэкендер',   body: ' /[#]\\', boost: 'expertise' },
    frontender: { label: 'фронтендер', body: ' /[<]\\', boost: 'morale' },
    teamlead:   { label: 'тимлид',     body: ' /[=]\\', boost: 'trust' }
  };
  var STAGES = ['стажёр', 'джуниор', 'миддл', 'сеньор', 'тимлид', 'CTO'];
  var STAGE_XP = [0, 30, 90, 200, 380, 650];
  var EYES = {
    happy:    ['^_^', '-_-'],
    neutral:  ['o_o', '-_-'],
    stressed: ['@_@', '>_<'],
    sleep:    ['u_u', 'z_z'],
    dead:     ['x_x', 'x_x']
  };
  var NAMES = ['Маша', 'Ержан', 'Дима', 'Айгуль', 'Влад', 'Сауле', 'Тимур', 'Настя', 'Канат', 'Олег', 'Лера', 'Бекзат'];
  // trait → влияние на дневной дрейф (плюс флавор в событиях)
  var TRAITS = {
    'надёжный':   { trust: 0.4, conflict: -0.3 },
    'звезда':     { expertise: 0.6, conflict: 0.2 },
    'токсичный':  { conflict: 0.9, morale: -0.4 },
    'выгорающий': { morale: -0.7 },
    'тихий':      { conflict: 0.1 },
    'спорщик':    { conflict: 0.5, expertise: 0.2 }
  };
  var TRAIT_KEYS = Object.keys(TRAITS);
  var LABELS = { trust: 'доверие', expertise: 'экспертиза', conflict: 'конфликт', morale: 'настрой', xp: 'опыт', shipped: 'релиз' };

  // ── состояние ──
  var st = null;          // null = игра не начата
  var timer = null;       // setInterval анимации
  var frame = 0;          // кадр моргания
  var faceEl = null;      // ссылка на <pre> лица для дешёвой перерисовки

  function clamp(v) { return Math.max(0, Math.min(100, v)); }
  function rnd(n) { return Math.floor(Math.random() * n); }
  function pick(arr) { return arr[rnd(arr.length)]; }

  function defaults(arch) {
    return {
      arch: arch, ts: Date.now(), day: 1, xp: 0, stage: 0, shipped: 0,
      metrics: { trust: 50, expertise: 35, conflict: 20, morale: 60 },
      team: [], asleep: false, over: false, overWhy: '', won: false
    };
  }
  function load() {
    try { var raw = w.localStorage && w.localStorage.getItem(KEY); if (raw) { var o = JSON.parse(raw); if (o && o.metrics) return o; } } catch (e) {}
    return null;
  }
  function save() { try { if (w.localStorage && st) w.localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }

  function toxicCount() { var n = 0; (st.team || []).forEach(function (t) { if (t.trait === 'токсичный') n++; }); return n; }
  function teamDrift() {                                   // сумма трейтовых модификаторов команды
    var acc = { trust: 0, expertise: 0, conflict: 0, morale: 0 };
    (st.team || []).forEach(function (t) {
      var mod = TRAITS[t.trait] || {};
      for (var k in mod) acc[k] += mod[k];
    });
    return acc;
  }
  // Дрейф за n «дней»: без ухода всё проседает, конфликт зреет; трейты команды подкручивают.
  function drift(n) {
    var m = st.metrics, td = teamDrift();
    m.trust = clamp(m.trust + (-1.2 + td.trust) * n);
    m.morale = clamp(m.morale + (-1.0 + td.morale) * n);
    m.conflict = clamp(m.conflict + (1.3 + td.conflict) * n);
    m.expertise = clamp(m.expertise + (-0.5 + td.expertise) * n);
    checkOver();
  }
  // Реальное время между сессиями → распад (18 ч = «день», максимум 7 дней штрафа).
  function decay() {
    var now = Date.now(), gap = now - (st.ts || now);
    var days = Math.min(7, Math.floor(gap / (1000 * 60 * 60 * 18)));
    if (days > 0) drift(days);
    st.asleep = gap > 1000 * 60 * 60 * 6;
    st.ts = now;
  }
  function checkOver() {
    if (st.over) return;
    if (st.metrics.morale <= 0) { st.over = true; st.overWhy = 'команда выгорела'; }
    else if (st.metrics.conflict >= 100) { st.over = true; st.overWhy = 'команда развалилась от конфликтов'; }
  }
  function stageFor(xp) { var s = 0; for (var i = 0; i < STAGE_XP.length; i++) if (xp >= STAGE_XP[i]) s = i; return s; }

  // Применить дельты к метрикам / xp / shipped.
  function apply(d) {
    var m = st.metrics;
    for (var k in d) {
      if (k === 'xp') st.xp += d.xp;
      else if (k === 'shipped') st.shipped += d.shipped;
      else m[k] = clamp(m[k] + d[k]);
    }
  }
  function deltaStr(d) {
    var parts = [];
    for (var k in d) { var v = Math.round(d[k]); if (!v) continue; parts.push((v > 0 ? '+' : '') + v + ' ' + (LABELS[k] || k)); }
    return parts.join(' · ');
  }

  // ── события: после действия иногда случается жизнь ──
  var EVENTS = [
    { t: 'Два сеньора схлестнулись по архитектуре.', d: { conflict: 12 }, hint: 'retro или 1on1 остудят' },
    { t: 'Джун выкатил первую фичу в прод 🎉', d: { morale: 8, expertise: 3 } },
    { t: 'Команда засиделась до ночи на релизе.', d: { morale: -8, conflict: 4 }, hint: 'дай отдохнуть – pair/retro' },
    { t: 'Кто-то принёс в офис плов.', d: { morale: 6, trust: 2 } },
    { t: 'Прилетел срочный хотфикс от продакта.', d: { morale: -5, conflict: 3 } },
    { t: 'На ретро вскрыли давний затык – стало легче.', d: { conflict: -8, trust: 3 } },
    { t: 'Сеньор скучает без сложных задач.', d: { morale: -4 }, hint: 'delegate ему что-то весомое' },
    { t: 'Менторская сессия зашла – все прокачались.', d: { expertise: 5, trust: 2 } },
    { t: 'Тимлид соседней команды переманивает людей.', d: { trust: -5, morale: -3 }, hint: '1on1, пока не поздно' },
    { t: 'Команда сама закрыла инцидент без тебя.', d: { trust: 6, morale: 4 } }
  ];
  function maybeEvent() {
    if (st.over || Math.random() > 0.35) return;
    var e = pick(EVENTS);
    apply(e.d);
    print('  ⚡ ' + e.t + '  (' + deltaStr(e.d) + ')' + (e.hint ? ' · ' + e.hint : ''), 'cy');
  }

  // ── промо/победа/конец ──
  function promote() {
    var ns = stageFor(st.xp);
    if (ns > st.stage && st.metrics.trust > 35) {
      st.stage = ns; apply({ morale: 6 });
      print('  ⬆ повышение: ' + ARCHES[st.arch].label + ' дорос до уровня «' + STAGES[ns] + '»!', 'ok');
    } else if (ns > st.stage) {
      print('  …до «' + STAGES[ns] + '» уже хватает опыта, но без доверия команды не растут. Подними trust.', 'dim');
    }
    if (!st.won && st.stage >= WIN_STAGE && st.shipped >= GOAL_SHIP) {
      st.won = true;
      print('  🏆 Победа! Ты вырастил тимлида и команду, которая стабильно поставляет. Можно играть дальше.', 'ok');
    }
  }
  function reportOver() {
    if (!st.over) return false;
    print('  💀 Game over: ' + st.overWhy + '. team reset – начать заново.', 'err');
    paint();
    return true;
  }

  // ── общий конвейер действия ──
  function ensure() {
    if (st) return true;
    print('Игра не начата. team new [coder|frontender|teamlead] – создать напарника. team help – правила.', 'hint');
    return false;
  }
  function act(d, msg) {
    if (!ensure()) return false;
    if (st.over) { reportOver(); return false; }
    st.asleep = false;
    apply(d);
    st.day += 1;
    drift(0.6);                 // время идёт – лёгкий дневной дрейф
    print(msg + '  (' + deltaStr(d) + ')', 'accent');
    maybeEvent();
    promote();
    st.ts = Date.now();
    save();
    if (!reportOver()) paint();
    return true;
  }

  // ── HUD: лицо + полосы ──
  function moodOf() {
    if (!st || st.over) return 'dead';
    if (st.asleep) return 'sleep';
    var m = st.metrics;
    if (m.morale < 25 || m.conflict > 75) return 'stressed';
    if (m.trust > 62 && m.morale > 58 && m.conflict < 38) return 'happy';
    return 'neutral';
  }
  function faceLines() {
    var mood = moodOf(), eyes = (EYES[mood] || EYES.neutral)[frame ? 1 : 0], a = ARCHES[st.arch] || ARCHES.coder;
    return ['  ___', ' [' + eyes + ']', a.body, '  | |'];
  }
  function paintFace() {
    if (!faceEl || !st) return;
    faceEl.textContent = faceLines().join('\n');
    faceEl.className = 'hud-face mood-' + moodOf();
  }
  function bars(v) {
    var n = Math.max(0, Math.min(10, Math.round(v / 10)));
    return new Array(n + 1).join('█') + new Array(10 - n + 1).join('░');
  }
  function metricRow(label, val, invert) {
    var good = invert ? val < 35 : val > 60, bad = invert ? val > 65 : val < 30;
    var r = el('div', 'hud-row' + (good ? ' is-good' : bad ? ' is-bad' : ''));
    r.appendChild(el('span', 'hud-label', label));
    r.appendChild(el('span', 'hud-bar', bars(val)));
    r.appendChild(el('span', 'hud-num', String(Math.round(val))));
    return r;
  }
  function paint() {
    if (!hud) return;
    if (!st) { hud.hidden = true; hud.innerHTML = ''; return; }
    hud.hidden = false; hud.innerHTML = '';
    var wrap = el('div', 'hud-wrap');
    faceEl = el('pre', 'hud-face mood-' + moodOf()); faceEl.textContent = faceLines().join('\n');
    wrap.appendChild(faceEl);
    var stats = el('div', 'hud-stats');
    var a = ARCHES[st.arch] || ARCHES.coder;
    stats.appendChild(el('div', 'hud-head', 'team@' + a.label + ' · ' + STAGES[st.stage] + ' · день ' + st.day +
      ' · релизы ' + st.shipped + '/' + GOAL_SHIP + ' · 👥 ' + st.team.length));
    var m = st.metrics;
    stats.appendChild(metricRow('доверие  ', m.trust, false));
    stats.appendChild(metricRow('экспертиза', m.expertise, false));
    stats.appendChild(metricRow('настрой  ', m.morale, false));
    stats.appendChild(metricRow('конфликт ', m.conflict, true));
    wrap.appendChild(stats);
    hud.appendChild(wrap);
  }

  function startTick() {
    if (timer) return;
    timer = w.setInterval(function () {
      if (!st) return;
      try { if (w.document && w.document.hidden) return; } catch (e) {}
      frame = frame ? 0 : 1; paintFace();
    }, 650);
  }
  function stopTick() { if (timer) { w.clearInterval(timer); timer = null; } }

  // ── команды действий ──
  function oneonone(a) {
    var who = (a || []).join(' ').trim();
    return act({ trust: 8, conflict: -6, morale: 3, xp: 2 },
      '☕ 1-on-1' + (who ? ' c «' + who + '»' : '') + ': выслушал, снял напряжение.');
  }
  function mentor(a) {
    var who = (a || []).join(' ').trim();
    return act({ expertise: 8, xp: 6, trust: 2, morale: -3 },
      '📚 менторишь' + (who ? ' «' + who + '»' : '') + ': растёт экспертиза, но сил это стоит.');
  }
  function codereview() {
    return act({ expertise: 6, trust: 3, conflict: 2, morale: -2, xp: 3 },
      '🔍 код-ревью: качество вверх, придирки чуть злят.');
  }
  function pair() {
    return act({ expertise: 5, morale: 5, trust: 3, xp: 4 },
      '👯 парное программирование: и учитесь, и заряжаетесь.');
  }
  function delegate(a) {
    var what = (a || []).join(' ').trim();
    return act({ morale: 7, trust: 6, expertise: 3, conflict: 2, xp: 3 },
      '🎯 делегировал' + (what ? ' «' + what + '»' : ' задачу') + ': команда чувствует доверие.');
  }
  function retro() {
    return act({ conflict: -15, trust: 5, morale: 2, xp: 2 },
      '🔄 ретро: проговорили боль, конфликт спал.');
  }
  function standup(a) {
    if (!ensure()) return;
    if (st.over) { reportOver(); return; }
    st.asleep = false; st.day += 1; drift(1);
    print('🗓 стендап: новый день, команда синкнулась.', 'accent');
    maybeEvent(); promote(); st.ts = Date.now(); save();
    if (!reportOver()) paint();
  }
  function hire() {
    if (!ensure()) return;
    if (st.over) { reportOver(); return; }
    if (st.team.length >= 6) { print('hire: команда уже большая (6). Сначала вырасти текущих.', 'err'); return; }
    var used = {}; st.team.forEach(function (t) { used[t.name] = 1; });
    var free = NAMES.filter(function (n) { return !used[n]; });
    if (!free.length) { print('hire: имена кончились.', 'err'); return; }
    var who = pick(free), trait = pick(TRAIT_KEYS);
    st.team.push({ name: who, trait: trait });
    act({ trust: -6, conflict: 5, morale: -3, expertise: 2, xp: 2 },
      '🧑‍💻 нанял: ' + who + ' (' + trait + '). Онбординг сначала тормозит команду.');
  }
  function fire(a) {
    if (!ensure()) return;
    if (st.over) { reportOver(); return; }
    var who = (a || []).join(' ').trim();
    if (!who) { print('fire <имя> – кого увольняем? team – список.', 'hint'); return; }
    var idx = -1; st.team.forEach(function (t, i) { if (t.name.toLowerCase() === who.toLowerCase()) idx = i; });
    if (idx < 0) { print('fire: в команде нет «' + who + '». team – список.', 'err'); return; }
    var t = st.team.splice(idx, 1)[0];
    var toxic = t.trait === 'токсичный';
    act(toxic ? { conflict: -14, morale: 2, trust: -3, xp: 1 } : { morale: -8, trust: -5, conflict: 4, xp: 1 },
      '👋 уволил ' + t.name + ' (' + t.trait + '). ' + (toxic ? 'Токсичность ушла – выдохнули.' : 'Команде тяжело терять своих.'));
  }
  function ship() {
    if (!ensure()) return;
    if (st.over) { reportOver(); return; }
    var m = st.metrics;
    if (m.morale < 15) { print('🚀 ship: команда на грани выгорания (настрой ' + Math.round(m.morale) + '). Сначала retro/pair/1on1.', 'err'); return; }
    var y = Math.max(1, Math.round((m.expertise * 0.5 + m.morale * 0.3 + (100 - m.conflict) * 0.2) / 20));
    st.asleep = false;
    apply({ shipped: y, morale: -15, trust: 4, conflict: -3, xp: 20 + y * 5 });
    st.day += 1; drift(0.6);
    print('🚀 релиз выкачен: +' + y + ' (всего ' + st.shipped + '/' + GOAL_SHIP + '). Крауч стоит сил.', 'ok');
    if (st.metrics.morale < 12 && st.team.length) {
      var lost = st.team.pop();
      apply({ conflict: 10, trust: -4 });
      print('  ⚠ выгорание после крауча: ' + lost.name + ' ушёл. Береги людей.', 'err');
    }
    maybeEvent(); promote(); st.ts = Date.now(); save();
    if (!reportOver()) paint();
  }

  // ── team: дашборд + управление игрой ──
  function dashboard() {
    var a = ARCHES[st.arch] || ARCHES.coder, m = st.metrics;
    print('team@' + a.label + ' · уровень «' + STAGES[st.stage] + '» · день ' + st.day +
      ' · релизы ' + st.shipped + '/' + GOAL_SHIP + (st.won ? ' · 🏆' : ''), 'accent');
    print('  доверие ' + bars(m.trust) + ' ' + Math.round(m.trust) +
      '   экспертиза ' + bars(m.expertise) + ' ' + Math.round(m.expertise), null);
    print('  настрой ' + bars(m.morale) + ' ' + Math.round(m.morale) +
      '   конфликт  ' + bars(m.conflict) + ' ' + Math.round(m.conflict), null);
    print('  опыт: ' + st.xp + ' · до «' + (STAGES[st.stage + 1] || 'максимума') + '»: ' +
      (STAGE_XP[st.stage + 1] != null ? Math.max(0, STAGE_XP[st.stage + 1] - st.xp) + ' xp' : '–'), 'dim');
    if (st.team.length) {
      print('  команда (' + st.team.length + '):', 'dim');
      st.team.forEach(function (t) { print('    • ' + t.name + ' – ' + t.trait, 'dim'); });
    } else {
      print('  команда пуста – hire наймёт первого человека.', 'dim');
    }
    if (st.over) print('  💀 ' + st.overWhy + '. team reset – заново.', 'err');
    print('  действия: 1on1 · mentor · cr · pair · delegate · retro · hire · fire <имя> · ship · standup', 'hint');
  }
  function teamHelp() {
    print('Тимагочи «Тимлид» – вырасти разработчика и команду в консоли.', 'accent');
    print('Старт:   team new [coder|frontender|teamlead]', null);
    print('Метрики: доверие · экспертиза · настрой растим, конфликт держим низким.', null);
    print('Цель:    дорасти до уровня «тимлид» и выкатить ' + GOAL_SHIP + ' релизов (ship).', null);
    print('Уход:    без действий метрики проседают со временем – заглядывай (standup).', 'dim');
    print('Команды действий:', 'dim');
    print('  1on1 [имя]   +доверие, -конфликт      mentor [имя] +экспертиза, +опыт', null);
    print('  cr           код-ревью: +экспертиза   pair         +экспертиза, +настрой', null);
    print('  delegate     +настрой, +доверие       retro        -конфликт', null);
    print('  hire         нанять человека          fire <имя>   уволить', null);
    print('  ship         выкатить релиз (цель)    standup      прожить день', null);
    print('Управление: team (дашборд) · team new <архетип> · team reset', 'hint');
  }
  function startGame(arch) {
    arch = (arch || 'coder').toLowerCase();
    if (!ARCHES[arch]) { print('team new: архетип – coder, frontender или teamlead.', 'err'); return; }
    st = defaults(arch); save(); paint(); startTick();
    print('Создан напарник: ' + ARCHES[arch].label + ' (стажёр). Бонус архетипа: +' + LABELS[ARCHES[arch].boost] + '.', 'ok');
    // стартовый бонус архетипа
    var b = {}; b[ARCHES[arch].boost] = 12; apply(b); save(); paint();
    teamHelp();
  }
  function team(a) {
    var sub = (a[0] || '').toLowerCase();
    if (sub === 'new' || sub === 'start') { startGame(a[1]); return; }
    if (sub === 'reset' || sub === 'delete') {
      st = null; stopTick(); try { if (w.localStorage) w.localStorage.removeItem(KEY); } catch (e) {}
      if (hud) { hud.hidden = true; hud.innerHTML = ''; }
      print('Игра сброшена. team new – начать заново.', 'ok'); return;
    }
    if (sub === 'help' || sub === '?') { teamHelp(); return; }
    if (!st) { teamHelp(); return; }
    if (st.asleep) { st.asleep = false; save(); }
    dashboard(); paint();
  }

  // Вызывается из main.js после загрузки: тихо поднять HUD, если есть сохранение.
  function resume() {
    var saved = load();
    if (!saved) return;
    st = saved; decay(); save(); paint(); startTick();
  }

  return {
    resume: resume,
    isActive: function () { return !!st; },
    commands: {
      team: team, mentor: mentor, cr: codereview, pair: pair, delegate: delegate,
      retro: retro, hire: hire, fire: fire, ship: ship, standup: standup,
      '1on1': oneonone
    }
  };
}
