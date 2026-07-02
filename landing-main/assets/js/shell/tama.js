/*!
 * Тимагочи «Тимлид» – вырасти разработчика и команду прямо в консоли. Анимированный
 * напарник живёт в HUD-полосе над выводом (data-term-hud) и реагирует на состояние;
 * команды (team · 1on1 · mentor · cr · pair · delegate · retro · hire · fire · ship ·
 * standup) меняют метрики команды: доверие, экспертиза, конфликт, настрой.
 *
 * В отличие от sim.js это НЕ модальная панель: игра управляется обычными командами в
 * приглашении, поэтому клавиатуру не перехватывает. Новое здесь – живое состояние с
 * сохранением в localStorage (tnk_shell_tama) и распад во времени между сессиями
 * (Date.now() при загрузке): если забросить, доверие падает, конфликт зреет, настрой тает.
 * Анимация – тик setInterval, моргающий ASCII-кадр (моргание/смена выражения).
 *
 * Состояние – локальное в замыкании (per-mount), как требует принцип изоляции.
 */
export function makeTama(S) {
  var w = S.w, el = S.el, print = S.print, printNode = S.printNode, link = S.link, copyText = S.copyText, hud = S.hud, run = S.run;
  // user-FS helpers – журнал ведётся как обычный файл (team/log.md), читаемый cat/tail/ls;
  // pool – материалы сайта (для контент-связок после инцидентов/стиля).
  var ufs = S.ufs, ufsSave = S.ufsSave, ufsNow = S.ufsNow, ufsUser = S.ufsUser, ensureDir = S.ensureDir, pool = S.pool || [];
  var KEY = 'tnk_shell_tama';
  var LOG_PATH = 'team/log.md';
  var GOAL_SHIP = 5;           // релизов для победы
  var WIN_STAGE = 4;           // индекс стадии «тимлид»
  var START_BUDGET = 100;
  var RELEASE_SIZE = 100;

  // ── статичные данные ──
  var ARCHES = {
    coder:      { label: 'бэкендер',   body: ' /[#]\\', boost: 'expertise' },
    frontender: { label: 'фронтендер', body: ' /[<]\\', boost: 'morale' },
    teamlead:   { label: 'тимлид',     body: ' /[=]\\', boost: 'trust' }
  };
  var STAGES = ['стажёр', 'джуниор', 'миддл', 'сеньор', 'тимлид', 'CTO'];
  var STAGE_XP = [0, 30, 90, 200, 380, 650];
  // «Шляпа» напарника растёт со стадией (ASCII-safe, 3 символа – ровно над глазами).
  var STAGE_HAT = ['___', '___', '_-_', '_~_', 'vvv', 'WWW'];
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
  var GRADES = {
    trainee: { label: 'стажёр', salary: 1, speed: 0.6 },
    junior:  { label: 'джуниор', salary: 2, speed: 0.8 },
    middle:  { label: 'миддл', salary: 3, speed: 1 },
    senior:  { label: 'сеньор', salary: 6, speed: 1.45 },
    lead:    { label: 'лид', salary: 8, speed: 1.7 }
  };
  var LABELS = {
    trust: 'доверие', expertise: 'экспертиза', conflict: 'конфликт', morale: 'настрой',
    xp: 'опыт', shipped: 'релиз', budget: 'деньги', releaseProgress: '% релиза', days: 'дн. ёмкости'
  };

  // ── инциденты: ветвящиеся дилеммы тимлида ──
  // Дека грузится из data/tama_incidents.yaml (community-editable, без правок кода)
  // и дополняется динамическими инцидентами из живого бэклога вопросов сообщества
  // (/questions → S.QUESTIONS), так что контент обновляется по мере роста сайта.
  // Вариант (o[]): l (текст) · s (стиль для архетипа) · e (эффекты метрик/финансов/ёмкости) · out (исход).
  var QUESTIONS = S.QUESTIONS || [];
  var INCIDENTS = (S.INCIDENTS || []).concat(questionIncidents());
  // Архетипы лидерства – зеркало стиля игры (главный вирусный крючок: «я оказался…»).
  var ARCHETYPES = [
    { k: 'fire', icon: '🔥', name: 'Пожарный', desc: 'тушишь пожары, но не строишь систему' },
    { k: 'people', icon: '🌳', name: 'Садовник', desc: 'растишь людей – команда становится сильнее тебя' },
    { k: 'deliver', icon: '🚢', name: 'Капитан', desc: 'двигаешь продукт – только береги людей от усталости' },
    { k: 'harmony', icon: '🕊', name: 'Дипломат', desc: 'держишь мир – но не уходи от жёстких решений' },
    { k: 'expertise', icon: '🧬', name: 'Архитектор', desc: 'качество прежде всего – не забудь про человеческое' }
  ];
  var ARCH_BY_LETTER = {
    f: { icon: '🔥', name: 'Пожарный' }, p: { icon: '🌳', name: 'Садовник' }, d: { icon: '🚢', name: 'Капитан' },
    h: { icon: '🕊', name: 'Дипломат' }, x: { icon: '🧬', name: 'Архитектор' },
    b: { icon: '⚖️', name: 'Бирюзовый лид' }, n: { icon: '🌱', name: 'Новичок' }
  };
  var ARCH_LETTER = { fire: 'f', people: 'p', deliver: 'd', harmony: 'h', expertise: 'x', balanced: 'b', novice: 'n' };
  var VOICES = S.VOICES || [];

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
      finance: { budget: START_BUDGET, releaseProgress: 0, releaseSize: RELEASE_SIZE },
      metrics: { trust: 50, expertise: 35, conflict: 20, morale: 60 },
      team: [], style: {}, pending: null, hire: null, history: [], prevMetrics: null,
      asleep: false, over: false, overWhy: '', overLogged: false, won: false
    };
  }
  function normalizeState(o) {
    if (!o) return o;
    o.team = o.team || [];
    o.metrics = o.metrics || { trust: 50, expertise: 35, conflict: 20, morale: 60 };
    o.finance = o.finance || {};
    if (typeof o.finance.budget !== 'number' || isNaN(o.finance.budget)) o.finance.budget = START_BUDGET;
    if (typeof o.finance.releaseProgress !== 'number' || isNaN(o.finance.releaseProgress)) o.finance.releaseProgress = 0;
    if (typeof o.finance.releaseSize !== 'number' || isNaN(o.finance.releaseSize) || o.finance.releaseSize <= 0) o.finance.releaseSize = RELEASE_SIZE;
    o.finance.releaseProgress = Math.max(0, Math.min(o.finance.releaseSize - 1, Math.round(o.finance.releaseProgress)));
    return o;
  }
  function load() {
    try { var raw = w.localStorage && w.localStorage.getItem(KEY); if (raw) { var o = JSON.parse(raw); if (o && o.metrics) return normalizeState(o); } } catch (e) {}
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
  // Дрейф за n «дней»: если не заниматься командой, всё проседает, конфликт зреет; трейты подкручивают.
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
    else if (st.finance && st.finance.budget <= 0) { st.over = true; st.overWhy = 'деньги закончились'; }
  }
  function stageFor(xp) { var s = 0; for (var i = 0; i < STAGE_XP.length; i++) if (xp >= STAGE_XP[i]) s = i; return s; }

  // ── финансы и скорость поставки ──
  function gradeKey(v) {
    var s = String(v || '').toLowerCase();
    if (/^(trainee|intern|стаж)/.test(s)) return 'trainee';
    if (/^(junior|jun|джун)/.test(s)) return 'junior';
    if (/^(middle|mid|мид)/.test(s)) return 'middle';
    if (/^(senior|sr|сень|сениор)/.test(s)) return 'senior';
    if (/^(lead|teamlead|tl|лид|тимлид)/.test(s)) return 'lead';
    return '';
  }
  function gradeFromRole(role) {
    var s = String(role || '').toLowerCase();
    if (/стаж|trainee|intern/.test(s)) return 'trainee';
    if (/джун|junior|jun/.test(s)) return 'junior';
    if (/мид|middle|mid/.test(s)) return 'middle';
    if (/сень|сениор|senior|sr/.test(s)) return 'senior';
    if (/лид|тимлид|lead|teamlead/.test(s)) return 'lead';
    return '';
  }
  function gradeFromSkill(skill) {
    var n = Number(skill) || 0;
    if (n >= 9) return 'senior';
    if (n >= 5) return 'middle';
    return 'junior';
  }
  function candidateGrade(c) { return gradeKey(c && c.grade) || gradeFromRole(c && c.role) || gradeFromSkill(c && c.skill); }
  function gradeMeta(v) { return GRADES[gradeKey(v)] || null; }
  function gradeLabel(v) {
    var g = gradeMeta(v);
    return g ? g.label : '';
  }
  function personSummary(t) {
    var parts = [], role = t && t.role, grade = gradeLabel(t && t.grade), trait = t && t.trait;
    if (role) parts.push(role);
    if (grade && parts.indexOf(grade) < 0) parts.push(grade);
    if (trait) parts.push(trait);
    return parts.join(', ') || 'без профиля';
  }
  function personSalary(t) {
    var g = gradeMeta(t && t.grade);
    return g ? g.salary : 3;
  }
  function personSpeed(t) {
    var g = gradeMeta(t && t.grade);
    return g ? g.speed : 1;
  }
  function teamSalary() {
    var sum = 0;
    (st.team || []).forEach(function (t) { sum += personSalary(t); });
    return sum;
  }
  function teamSpeedUnits() {
    var sum = 0;
    (st.team || []).forEach(function (t) { sum += personSpeed(t); });
    return sum;
  }
  function income() {
    var m = st.metrics || {};
    return Math.max(0, Math.min(50,
      3 + st.shipped * 2 + Math.floor(((m.expertise || 0) + (m.trust || 0) + (m.morale || 0)) / 60) - Math.floor((m.conflict || 0) / 25)
    ));
  }
  function burn() { return 5 + teamSalary(); }
  function runway() {
    var net = income() - burn(), b = st.finance ? st.finance.budget : 0;
    if (net >= 0) return '∞';
    return Math.max(0, Math.floor(b / Math.max(1, -net))) + 'д';
  }
  function budgetPct() {
    var b = st.finance ? st.finance.budget : 0;
    return Math.max(0, Math.min(100, Math.round(b / START_BUDGET * 100)));
  }
  function moneyFlowLine() {
    return 'доход +' + income() + '/д · расход -' + burn() + '/д · запас ' + runway();
  }
  function moneyLine() {
    var f = st.finance || {};
    return 'деньги ' + Math.round(f.budget || 0) + ' · ' + moneyFlowLine();
  }
  function financeTick() {
    normalizeState(st);
    st.finance.budget = Math.round(st.finance.budget + income() - burn());
    checkOver();
  }
  function releasePct() {
    var f = st.finance || {};
    return Math.max(0, Math.min(99, Math.round((f.releaseProgress || 0) / (f.releaseSize || RELEASE_SIZE) * 100)));
  }
  function releaseLine() { return 'релиз ' + releasePct() + '% · скорость ' + shipPower() + '%/ship'; }
  function shipPower() {
    var m = st.metrics || {}, people = teamSpeedUnits();
    return Math.max(5, Math.round(
      12 + Math.sqrt(people) * 14 + (m.expertise || 0) / 6 + (m.trust || 0) / 10 + (m.morale || 0) / 12 - (m.conflict || 0) / 8
    ));
  }
  function changeReleaseProgress(delta) {
    normalizeState(st);
    var f = st.finance, done = 0;
    f.releaseProgress += delta;
    if (f.releaseProgress < 0) f.releaseProgress = 0;
    while (f.releaseProgress >= f.releaseSize) { f.releaseProgress -= f.releaseSize; done++; }
    if (done) st.shipped += done;
    return done;
  }
  function addReleaseProgress(power) { return changeReleaseProgress(power); }

  // Применить дельты к метрикам / xp / shipped.
  function apply(d) {
    var m = st.metrics;
    for (var k in d) {
      if (k === 'xp') st.xp += d.xp;
      else if (k === 'shipped') st.shipped += d.shipped;
      else if (k === 'budget') { normalizeState(st); st.finance.budget = Math.round(st.finance.budget + d.budget); }
      else if (k === 'releaseProgress') changeReleaseProgress(d.releaseProgress);
      else if (k === 'days') continue;
      else m[k] = clamp(m[k] + d[k]);
    }
    checkOver();
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
    if (st.over) return;
    var ns = stageFor(st.xp);
    if (ns > st.stage && st.metrics.trust > 35) {
      st.stage = ns; apply({ morale: 6 });
      print('  ⬆ повышение: ' + ARCHES[st.arch].label + ' дорос до уровня «' + STAGES[ns] + '»!', 'ok');
      chron('⬆ повышение до «' + STAGES[ns] + '»');
    } else if (ns > st.stage) {
      print('  …до «' + STAGES[ns] + '» уже хватает опыта, но без доверия команды не растут. Подними trust.', 'dim');
    }
    if (!st.won && st.stage >= WIN_STAGE && st.shipped >= GOAL_SHIP) {
      st.won = true;
      print('  🏆 Победа! Ты вырастил тимлида и команду, которая стабильно поставляет. Можно играть дальше.', 'ok');
      chron('🏆 ПОБЕДА: тимлид + ' + GOAL_SHIP + ' релизов');
      revealStyle();
      print('  поделись результатом: team share', 'hint');
    }
  }
  function reportOver() {
    if (!st.over) return false;
    if (!st.overLogged) { st.overLogged = true; chron('💀 ' + st.overWhy); }
    print('  💀 Game over: ' + st.overWhy + '. team reset – начать заново.', 'err');
    revealStyle();
    print('  поделись результатом: team share', 'hint');
    paint();
    return true;
  }

  // ── общий конвейер действия ──
  function ensure() {
    if (st) return true;
    print('Игра не начата. team new [coder|frontender|teamlead] – создать напарника. team help – правила.', 'hint');
    return false;
  }
  function act(d, msg, style) {
    if (!ensure()) return false;
    if (st.over) { reportOver(); return false; }
    if (st.pending || st.hire) { remindBusy(); return false; }
    st.asleep = false;
    snapPrev();
    apply(d);
    tallyStyle(style);
    st.day += 1;
    drift(0.6);                 // время идёт – лёгкий дневной дрейф
    financeTick();
    print(msg + '  (' + deltaStr(d) + ')', 'accent');
    chron(msg);
    maybeIncident();
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
    return ['  ' + (STAGE_HAT[st.stage] || '___'), ' [' + eyes + ']', a.body, '  | |'];
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
  function trendArrow(cur, prev) {
    if (prev == null) return '';
    var d = Math.round(cur) - Math.round(prev);
    return d >= 1 ? '↑' : d <= -1 ? '↓' : '';
  }
  function metricRow(label, key, invert) {
    var val = st.metrics[key], prev = st.prevMetrics ? st.prevMetrics[key] : null;
    var good = invert ? val < 35 : val > 60, bad = invert ? val > 65 : val < 30;
    var r = el('div', 'hud-row' + (good ? ' is-good' : bad ? ' is-bad' : ''));
    r.appendChild(el('span', 'hud-label', label));
    r.appendChild(el('span', 'hud-bar', bars(val)));
    r.appendChild(el('span', 'hud-num', String(Math.round(val))));
    var tr = trendArrow(val, prev); if (tr) r.appendChild(el('span', 'hud-trend ' + (tr === '↑' ? 'up' : 'down'), tr));
    return r;
  }
  function xpPct() {
    var c = STAGE_XP[st.stage], n = STAGE_XP[st.stage + 1];
    if (n == null) return 100;
    return Math.max(0, Math.min(100, (st.xp - c) / (n - c) * 100));
  }
  function paint() {
    if (!hud) return;
    if (!st) { hud.hidden = true; hud.innerHTML = ''; return; }
    hud.hidden = false; hud.innerHTML = '';
    var wrap = el('div', 'hud-wrap');
    faceEl = el('pre', 'hud-face mood-' + moodOf()); faceEl.textContent = faceLines().join('\n');
    wrap.appendChild(faceEl);
    var stats = el('div', 'hud-stats');
    var a = ARCHES[st.arch] || ARCHES.coder, sprint = Math.ceil(st.day / 5);
    stats.appendChild(el('div', 'hud-head', 'team@' + a.label + ' · ' + STAGES[st.stage] + ' · спринт ' + sprint +
      ' · день ' + st.day + ' · релизы ' + st.shipped + '/' + GOAL_SHIP + ' · 👥 ' + st.team.length));
    var grid = el('div', 'hud-grid'), left = el('div', 'hud-col'), right = el('div', 'hud-col hud-col-finance');
    function valueRow(label, value, cls) {
      var r = el('div', 'hud-row' + (cls ? ' ' + cls : ''));
      r.appendChild(el('span', 'hud-label', label));
      r.appendChild(el('span', 'hud-value', value));
      return r;
    }
    left.appendChild(metricRow('доверие  ', 'trust', false));
    left.appendChild(metricRow('экспертиза', 'expertise', false));
    left.appendChild(metricRow('настрой  ', 'morale', false));
    left.appendChild(metricRow('конфликт ', 'conflict', true));
    // XP-полоса до следующей стадии
    var xr = el('div', 'hud-row');
    xr.appendChild(el('span', 'hud-label', 'опыт→' + (STAGES[st.stage + 1] || 'max')));
    xr.appendChild(el('span', 'hud-bar xp', bars(xpPct())));
    xr.appendChild(el('span', 'hud-num', Math.round(xpPct()) + '%'));
    left.appendChild(xr);
    // Состав команды поимённо – не просто счётчик, а кто именно в команде (трейт-намёк в title).
    var tr = el('div', 'hud-row hud-team');
    tr.appendChild(el('span', 'hud-label', 'команда  '));
    var names = el('span', 'hud-team-names');
    if (st.team.length) {
      st.team.forEach(function (t, i) {
        var chip = el('span', 'hud-team-name trait-' + (t.trait || ''), t.name + (i < st.team.length - 1 ? ',' : ''));
        try { chip.title = personSummary(t); } catch (e) {}
        names.appendChild(chip);
      });
    } else {
      names.appendChild(el('span', 'hud-team-empty', 'пока никого – hire'));
    }
    tr.appendChild(names);
    left.appendChild(tr);

    var fb = st.finance ? st.finance.budget : 0;
    var fr = el('div', 'hud-row' + (fb <= 20 ? ' is-bad' : income() >= burn() ? ' is-good' : ''));
    fr.appendChild(el('span', 'hud-label', 'деньги  '));
    fr.appendChild(el('span', 'hud-bar money', bars(budgetPct())));
    fr.appendChild(el('span', 'hud-num', String(Math.round(fb))));
    right.appendChild(fr);
    right.appendChild(valueRow('доход   ', '+' + income() + '/д', income() >= burn() ? 'is-good' : ''));
    right.appendChild(valueRow('расход  ', '-' + burn() + '/д', fb <= 20 ? 'is-bad' : ''));
    right.appendChild(valueRow('запас   ', runway(), fb <= 20 ? 'is-bad' : ''));
    var rr = el('div', 'hud-row');
    rr.appendChild(el('span', 'hud-label', 'релиз→'));
    rr.appendChild(el('span', 'hud-bar xp', bars(releasePct())));
    rr.appendChild(el('span', 'hud-num', releasePct() + '%'));
    right.appendChild(rr);
    right.appendChild(valueRow('скорость', '+' + shipPower() + '%/ship', ''));
    grid.appendChild(left); grid.appendChild(right);
    stats.appendChild(grid);
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
      '☕ 1-on-1' + (who ? ' c «' + who + '»' : '') + ': выслушал, снял напряжение.', 'people');
  }
  function mentor(a) {
    var who = (a || []).join(' ').trim();
    return act({ expertise: 8, xp: 6, trust: 2, morale: -3 },
      '📚 менторишь' + (who ? ' «' + who + '»' : '') + ': растёт экспертиза, но сил это стоит.', 'people');
  }
  function codereview() {
    return act({ expertise: 6, trust: 3, conflict: 2, morale: -2, xp: 3 },
      '🔍 код-ревью: качество вверх, придирки чуть злят.', 'expertise');
  }
  function pair() {
    return act({ expertise: 5, morale: 5, trust: 3, xp: 4 },
      '👯 парное программирование: и учитесь, и заряжаетесь.', 'people');
  }
  function delegate(a) {
    var what = (a || []).join(' ').trim();
    return act({ morale: 7, trust: 6, expertise: 3, conflict: 2, xp: 3 },
      '🎯 делегировал' + (what ? ' «' + what + '»' : ' задачу') + ': команда чувствует доверие.', 'people');
  }
  function retro() {
    return act({ conflict: -15, trust: 5, morale: 2, xp: 2 },
      '🔄 ретро: проговорили боль, конфликт спал.', 'harmony');
  }
  function standup(a) {
    if (!ensure()) return;
    if (st.over) { reportOver(); return; }
    if (st.pending || st.hire) { remindBusy(); return; }
    st.asleep = false; snapPrev(); st.day += 1; drift(1);
    financeTick();
    print('🗓 стендап: новый день, команда синкнулась.', 'accent');
    chron('🗓 стендап');
    maybeIncident(); promote(); st.ts = Date.now(); save();
    if (!reportOver()) paint();
  }
  // hire запускает сценарий-симулятор (startHire); прямого мгновенного найма больше нет.
  function fire(a) {
    if (!ensure()) return;
    if (st.over) { reportOver(); return; }
    if (st.pending || st.hire) { remindBusy(); return; }
    var who = (a || []).join(' ').trim();
    if (!who) { print('fire <имя> – кого увольняем? team – список.', 'hint'); return; }
    var idx = -1; st.team.forEach(function (t, i) { if (t.name.toLowerCase() === who.toLowerCase()) idx = i; });
    if (idx < 0) { print('fire: в команде нет «' + who + '». team – список.', 'err'); return; }
    var t = st.team.splice(idx, 1)[0];
    var toxic = t.trait === 'токсичный';
    act(toxic ? { conflict: -14, morale: 2, trust: -3, xp: 1 } : { morale: -8, trust: -5, conflict: 4, xp: 1 },
      '👋 уволил ' + t.name + ' (' + t.trait + '). ' + (toxic ? 'Токсичность ушла – выдохнули.' : 'Команде тяжело терять своих.'), 'fire');
  }
  function ship() {
    if (!ensure()) return;
    if (st.over) { reportOver(); return; }
    if (st.pending || st.hire) { remindBusy(); return; }
    var m = st.metrics;
    if (m.morale < 15) { print('🚀 ship: команда на грани выгорания (настрой ' + Math.round(m.morale) + '). Сначала retro/pair/1on1.', 'err'); return; }
    var power = shipPower();
    st.asleep = false; snapPrev();
    var done = addReleaseProgress(power);
    apply({ morale: -8, trust: 2, conflict: -2, xp: Math.round(power / 4) + done * 10 });
    tallyStyle('deliver'); if (m.morale < 30) tallyStyle('fire');   // релиз через выгорание = пожарный стиль
    st.day += 1; drift(0.6); financeTick();
    if (done) print('🚀 релиз выкачен +' + done + ' (всего ' + st.shipped + '/' + GOAL_SHIP + '). Остаток прогресса ' + releasePct() + '%.', 'ok');
    else print('🚀 прогресс релиза +' + power + '% (' + releasePct() + '/100). Крауч стоит сил.', 'ok');
    chron(done ? ('🚀 релиз +' + done + ' (всего ' + st.shipped + '/' + GOAL_SHIP + ', остаток ' + releasePct() + '%)') : ('🚀 прогресс релиза +' + power + '% (' + releasePct() + '/100)'));
    if (st.metrics.morale < 12 && st.team.length) {
      var lost = st.team.pop();
      apply({ conflict: 10, trust: -4 });
      print('  ⚠ выгорание после крауча: ' + lost.name + ' ушёл. Береги людей.', 'err');
      chron('⚠ выгорание после крауча: ' + lost.name + ' ушёл');
    }
    maybeIncident(); promote(); st.ts = Date.now(); save();
    if (!reportOver()) paint();
  }

  // ── стиль игры → архетип лидерства ──
  function tallyStyle(s) { if (!s || !st) return; st.style = st.style || {}; st.style[s] = (st.style[s] || 0) + 1; }
  function archetype() {
    var s = st.style || {}, total = 0, top = ARCHETYPES[0], max = -1;
    ARCHETYPES.forEach(function (a) { var v = s[a.k] || 0; total += v; if (v > max) { max = v; top = a; } });
    if (total < 4) return { k: 'novice', icon: '🌱', name: 'Новичок', desc: 'ещё мало решений – сыграй подольше' };
    if (max <= Math.ceil(total * 0.34)) return { k: 'balanced', icon: '⚖️', name: 'Бирюзовый лид', desc: 'редкий баланс: люди, продукт и мир разом' };
    return top;
  }
  function revealStyle() {
    if (!ensure()) return;
    var a = archetype(), s = st.style || {};
    print('🧭 Твой стиль лидерства: ' + a.icon + ' ' + a.name, 'accent');
    print('  ' + a.desc, null);
    print('  решения: люди ' + (s.people || 0) + ' · продукт ' + (s.deliver || 0) + ' · мир ' + (s.harmony || 0) +
      ' · экспертиза ' + (s.expertise || 0) + ' · пожары ' + (s.fire || 0), 'dim');
    var row = el('span'); row.appendChild(el('span', 'dim', 'разобрать стиль: '));
    row.appendChild(claudeLink('как развиваться лидеру в стиле «' + a.name + '»')); printNode(row);
    print('  доктрина сообщества: principles · обсудить: discuss · похвастаться: team share', 'hint');
  }

  // ── реплики людей из сообщества (data/voices.yaml) ──
  function voiceByTopic(topic) {
    var m = VOICES.filter(function (v) { return v.topic === topic; });
    return m.length ? pick(m) : (VOICES.length ? pick(VOICES) : null);
  }
  function voiceAny() { return VOICES.length ? pick(VOICES) : null; }

  // ── инциденты: ветвящиеся дилеммы (блокируют, пока не решишь) ──
  function remindBusy() {
    if (st.hire) { print('⏳ Идёт найм. Заверши: team yes / team no (или team cancel).', 'err'); return; }
    if (st.pending) { print('⚡ Сначала разрули инцидент: team a · team b · team c (team – показать снова).', 'err'); }
  }
  // Динамические инциденты из живого бэклога вопросов (/questions → S.QUESTIONS):
  // реальный вопрос сообщества становится дилеммой, ссылка ведёт на разбор-источник.
  function questionIncidents() {
    var list = (typeof QUESTIONS !== 'undefined' && QUESTIONS) ? QUESTIONS : [], out = [];
    list.slice(0, 6).forEach(function (qq, i) {
      if (!qq || !qq.q) return;
      out.push({
        id: 'q-' + i, q: null, src: { u: qq.u, t: qq.ev || 'разбор сообщества' }, srcQ: qq.q,
        t: '{name} приносит тему с разбора «' + (qq.ev || 'встречи') + '»: «' + qq.q + '» Команде интересно, что ты об этом думаешь. Как реагируешь?',
        o: [
          { l: 'Вынести на общее обсуждение командой', s: 'harmony', e: { trust: 6, conflict: -4, releaseProgress: -10, days: 1, xp: 2 }, out: 'Разобрали вместе – люди почувствовали, что их слышат. День ушёл на синхронизацию.' },
          { l: 'Поделиться своим опытом и примерами', s: 'people', e: { trust: 4, morale: 3, releaseProgress: -5, xp: 3 }, out: 'Твой разбор зашёл – команда унесла что-то полезное, но фокус немного просел.' },
          { l: 'Сейчас не до этого – вернуться к задачам', s: 'deliver', e: { releaseProgress: 8, conflict: 4, morale: -3, xp: 1 }, out: 'Быстро вернулись к делу, но интерес притушили.' }
        ]
      });
    });
    return out;
  }
  function incById(id) { for (var i = 0; i < INCIDENTS.length; i++) if (INCIDENTS[i].id === id) return INCIDENTS[i]; return null; }
  function eligibleIncidents() { return INCIDENTS.filter(function (i) { return !(i.need === 'team' && !st.team.length); }); }
  function maybeIncident() {
    if (st.over || st.pending || st.hire) return;
    var r = Math.random();
    if (r < 0.42) { fireIncident(); return; }
    if (r < 0.62) { var e = pick(EVENTS); apply(e.d); print('  ⚡ ' + e.t + '  (' + deltaStr(e.d) + ')' + (e.hint ? ' · ' + e.hint : ''), 'cy'); }
  }
  function fireIncident() {
    var list = eligibleIncidents(); if (!list.length) return;
    var inc = pick(list);
    st.pending = { id: inc.id, name: st.team.length ? pick(st.team).name : 'кто-то из команды' };
    renderIncident();
  }
  function renderIncident() {
    var inc = incById(st.pending && st.pending.id); if (!inc) { st.pending = null; return; }
    print('⚡ ИНЦИДЕНТ · день ' + st.day, 'cy');
    print('  ' + inc.t.replace('{name}', st.pending.name), null);
    if (inc.q) { var v = voiceByTopic(inc.q); if (v) print('  💬 в чате по теме: «' + v.text + '» – ' + v.author, 'dim'); }
    inc.o.forEach(function (op, i) { print('  ' + String.fromCharCode(97 + i) + ') ' + op.l, null); });
    print('  реши: team a · team b · team c', 'hint');
  }
  function resolveIncident(letter) {
    var inc = incById(st.pending && st.pending.id);
    if (!inc) { st.pending = null; return; }
    var idx = 'abcdefgh'.indexOf(letter); if (idx < 0 && /^[1-9]$/.test(letter)) idx = parseInt(letter, 10) - 1;
    var op = inc.o[idx];
    if (!op) { print('Нет такого варианта. team a · team b · team c', 'err'); return; }
    var name = st.pending.name, harsh = (op.e.conflict || 0) > 6 || (op.e.morale || 0) < -4;
    snapPrev(); apply(op.e); tallyStyle(op.s);
    var days = Math.max(0, Math.round((op.e && op.e.days) || 0));
    if (days) {
      for (var di = 0; di < days; di++) { st.day += 1; drift(0.6); financeTick(); }
    } else {
      financeTick();
    }
    print('→ ' + op.out.replace('{name}', name) + '  (' + deltaStr(op.e) + ')', harsh ? 'err' : 'accent');
    chron('⚡ ' + inc.t.replace('{name}', name) + ' → ' + op.l);
    tieIn({ topic: inc.q, page: inc.src, q: inc.srcQ });
    st.pending = null; promote(); st.ts = Date.now(); save();
    if (!reportOver()) paint();
  }

  // ── симулятор найма: кого позвать, что спросить, кого взять ──
  var ROLES = ['джуниор', 'миддл-бэкендер', 'фронтендер', 'фуллстек', 'сеньор', 'девопс', 'QA-инженер'];
  var QUESTIONS = [
    { id: 'conflict', q: 'Расскажи про конфликт в команде и как ты его разрулил.', reveal: 'trait' },
    { id: 'tech', q: 'Самая сложная техническая задача за последний год?', reveal: 'skill' },
    { id: 'why', q: 'Почему уходишь с текущего места?', reveal: 'culture' },
    { id: 'review', q: 'Как относишься к ревью своих PR?', reveal: 'collab' }
  ];
  function makeCandidate(used) {
    var free = NAMES.filter(function (n) { return !used[n]; });
    var name = free.length ? pick(free) : ('Кандидат-' + (rnd(900) + 100));
    var role = pick(ROLES), skill = rnd(7) + 3;
    used[name] = 1;
    return { name: name, role: role, grade: gradeFromRole(role) || gradeFromSkill(skill), trait: pick(TRAIT_KEYS), skill: skill, asked: [] };
  }
  function candBlurb(c) {
    return c.role + (gradeLabel(candidateGrade(c)) ? ' · ' + gradeLabel(candidateGrade(c)) : '') +
      ', ' + (c.skill >= 8 ? 'сильное резюме' : c.skill >= 5 ? 'ровное резюме' : 'скромное резюме');
  }
  function candidateSignal(c, q) {
    if (q.reveal === 'skill') return 'по технике: ' + (c.skill >= 8 ? 'очень силён' : c.skill >= 5 ? 'крепкий уровень' : 'есть пробелы') + ' (скилл ~' + c.skill + '/10).';
    if (q.reveal === 'trait') {
      var t = c.trait;
      if (t === 'токсичный') return 'тревожный сигнал: в ответе много «они виноваты».';
      if (t === 'спорщик') return 'любит поспорить – принципиальный, но колючий.';
      if (t === 'надёжный') return 'спокойно берёт ответственность на себя.';
      if (t === 'звезда') return 'амбициозен – нужен челлендж, иначе заскучает.';
      if (t === 'выгорающий') return 'упоминает усталость с прошлого места.';
      return 'сдержан, без ярких сигналов.';
    }
    if (q.reveal === 'culture') return c.trait === 'выгорающий' ? 'бежит от выгорания – нужен бережный онбординг.' : 'мотивация адекватная, growth-ориентирован.';
    return c.trait === 'токсичный' ? 'к ревью относится болезненно.' : 'ревью воспринимает как норму.';
  }
  function startHire() {
    if (!ensure()) return;
    if (st.over) { reportOver(); return; }
    if (st.pending) { remindBusy(); return; }
    if (st.team.length >= 6) { print('hire: команда уже большая (6). Сначала вырасти текущих.', 'err'); return; }
    if (st.hire) { if (st.hire.phase === 'interview') showQuestions(); else listCandidates(); return; }
    var used = {}; st.team.forEach(function (t) { used[t.name] = 1; });
    var cands = []; for (var i = 0; i < 3; i++) cands.push(makeCandidate(used));
    st.hire = { cands: cands, phase: 'list', sel: -1, budget: 2 };
    print('🧑‍💼 Найм: на столе 3 резюме. Кого позвать на интервью?', 'accent');
    listCandidates(); save();
  }
  function listCandidates() {
    if (!st.hire) return;
    st.hire.cands.forEach(function (c, i) { print('  ' + (i + 1) + ') ' + c.name + ' – ' + candBlurb(c), null); });
    print('  интервью: team hire 1 | 2 | 3 · отменить: team cancel', 'hint');
  }
  function interview(i) {
    var c = st.hire.cands[i]; if (!c) { print('Нет такого кандидата. team hire 1 | 2 | 3', 'err'); return; }
    st.hire.phase = 'interview'; st.hire.sel = i; st.hire.budget = 2; c.asked = [];
    print('🎙 Интервью: ' + c.name + ' (' + c.role + '). Можно задать 2 вопроса.', 'accent');
    showQuestions(); save();
  }
  function showQuestions() {
    var c = st.hire.cands[st.hire.sel];
    QUESTIONS.forEach(function (q, i) { var done = c.asked.indexOf(q.id) >= 0; print('  ' + String.fromCharCode(97 + i) + ') ' + q.q + (done ? ' ✓' : ''), done ? 'dim' : null); });
    print('  спроси: team a · b · c · d  ·  решай: team yes (взять) / team no (пропустить)  ·  вопросов осталось: ' + st.hire.budget, 'hint');
  }
  function askQuestion(letter) {
    var c = st.hire.cands[st.hire.sel], idx = 'abcd'.indexOf(letter), q = QUESTIONS[idx];
    if (!q) { print('Нет такого вопроса.', 'err'); return; }
    if (c.asked.indexOf(q.id) >= 0) { print('Этот вопрос уже задан.', 'dim'); showQuestions(); return; }
    if (st.hire.budget <= 0) { print('Вопросы кончились – решай: team yes / team no.', 'err'); return; }
    c.asked.push(q.id); st.hire.budget--;
    var v = voiceAny();
    print('  ' + c.name + ': «' + (v ? v.text : '…') + '»', null);
    print('  🔎 ' + candidateSignal(c, q), 'dim');
    save();
    if (st.hire.budget <= 0) print('  вопросы кончились – решай: team yes / team no', 'hint');
    else showQuestions();
  }
  function decideHire(yes) {
    if (st.hire.sel < 0) { print('Сначала позови кого-то на интервью: team hire 1 | 2 | 3', 'err'); return; }
    var c = st.hire.cands[st.hire.sel];
    if (!yes) {
      print('👋 Пропустил ' + c.name + '. Поиск продолжается.', 'dim');
      st.hire.phase = 'list'; st.hire.sel = -1; listCandidates(); save(); return;
    }
    var vetted = c.asked.length;
    st.team.push({ name: c.name, role: c.role, grade: candidateGrade(c), trait: c.trait, skill: c.skill });
    var base = { trust: -4, conflict: 4, morale: -2, expertise: Math.round(c.skill / 2), xp: 3 };
    if (c.trait === 'токсичный' && vetted < 2) base.conflict += 8;   // взял вслепую – влетел токсик
    if (vetted >= 2) { base.trust += 3; base.conflict -= 2; }        // тщательный найм мягче
    st.hire = null;
    tallyStyle('people');
    act(base, '🧑‍💻 Нанят: ' + c.name + ' (' + c.trait + '). ' + (vetted >= 2 ? 'Вычитал внимательно – онбординг мягче.' : 'Взял почти вслепую.'));
  }

  // ── шеринг результата: код снимка → ссылка-реплей + соц-шаринг ──
  // Состояние локально (localStorage), поэтому результат кодируется прямо в URL: открыв
  // ссылку, получатель видит ЧУЖОЙ итог (team result <code>) и зовётся сыграть сам.
  // Формат кода: tl3-<стадия>-<релизы>-<день>-<доверие>-<экспертиза>-<настрой>-<конфликт>-<команда>-<флаг>-<арх>-<стиль>-<бюджет>-<прогресс>
  function archCode(a) { return a === 'frontender' ? 'f' : a === 'teamlead' ? 't' : 'c'; }
  function archFromCode(c) { return c === 'f' ? 'frontender' : c === 't' ? 'teamlead' : 'coder'; }
  function flagOf(s) { return s.over ? 'x' : s.won ? 'w' : 'p'; }
  function encode() {
    var m = st.metrics, f = st.finance || {}, a = archetype();
    return ['tl3', st.stage, st.shipped, st.day, Math.round(m.trust), Math.round(m.expertise),
      Math.round(m.morale), Math.round(m.conflict), st.team.length, flagOf(st), archCode(st.arch),
      (ARCH_LETTER[a.k] || 'n'), Math.max(0, Math.round(f.budget || 0)), releasePct()].join('-');
  }
  function decode(code) {
    var p = String(code || '').toLowerCase().split('-');
    if ((p[0] !== 'tl1' && p[0] !== 'tl2' && p[0] !== 'tl3') || p.length < 11) return null;
    var n = function (i) { var v = parseInt(p[i], 10); return isNaN(v) ? 0 : Math.max(0, Math.min(999, v)); };
    return { stage: Math.min(5, n(1)), shipped: n(2), day: n(3), trust: Math.min(100, n(4)),
      expertise: Math.min(100, n(5)), morale: Math.min(100, n(6)), conflict: Math.min(100, n(7)),
      team: Math.min(20, n(8)), flag: (p[9] || 'p'), arch: archFromCode(p[10]),
      style: ((p[0] === 'tl2' || p[0] === 'tl3') && ARCH_BY_LETTER[p[11]]) ? ARCH_BY_LETTER[p[11]] : null,
      budget: p[0] === 'tl3' ? Math.min(999, n(12)) : null, progress: p[0] === 'tl3' ? Math.min(99, n(13)) : null };
  }
  function isWin(s) { return s.flag === 'w' || s.stage >= 5 || (s.stage >= WIN_STAGE && s.shipped >= GOAL_SHIP); }
  function resultTitle(s) {
    if (s.flag === 'x' && s.budget === 0) return '💀 деньги закончились';
    if (s.flag === 'x') return '💀 команда развалилась';
    if (s.stage >= 5) return '🚀 дорос до CTO';
    if (isWin(s)) return '🏆 вырастил тимлида и команду';
    return 'в процессе: уровень «' + STAGES[s.stage] + '»';
  }
  // Выбор готовой OG-карточки по исходу (статичные milestone-картинки, Tier A).
  function milestoneId(s) { return s.flag === 'x' ? 'team-burnout' : isWin(s) ? 'team-win' : 'team-result'; }
  function origin() { try { return (w.location && w.location.origin) || ''; } catch (e) { return ''; } }
  function shareUrl(s, code) { return (origin() || 'https://teamleads.kz') + '/s/' + milestoneId(s) + '/?cmd=' + encodeURIComponent(code); }
  function shareText(s, url) {
    return '🎮 Тимагочи «Тимлид»: ' + resultTitle(s) + '. Уровень «' + STAGES[s.stage] + '», релизы ' +
      s.shipped + '/' + GOAL_SHIP + ', день ' + s.day + '. Доверие ' + s.trust + ', конфликт ' + s.conflict +
      (s.budget != null ? ', деньги ' + s.budget + ', прогресс релиза ' + s.progress + '%' : '') +
      (s.style ? '. Мой стиль: ' + s.style.icon + ' ' + s.style.name : '') + '. Обгонишь? ' + url;
  }
  function share() {
    if (!ensure()) return;
    var code = encode(), s = decode(code), url = shareUrl(s, code), txt = shareText(s, url);
    // адресная строка = ссылка-результат (как и остальной шеринг сайта)
    try { if (w.history && w.history.replaceState) w.history.replaceState(null, '', url); } catch (e) {}
    print('🔗 Результат готов к шарингу:', 'accent');
    print('  ' + resultTitle(s) + ' · «' + STAGES[s.stage] + '» · релизы ' + s.shipped + '/' + GOAL_SHIP + ' · день ' + s.day +
      (s.budget != null ? ' · деньги ' + s.budget + ' · прогресс ' + s.progress + '%' : ''), null);
    var shared = false;
    try { if (w.navigator && w.navigator.share) { w.navigator.share({ title: 'Тимагочи «Тимлид»', text: txt, url: url }); shared = true; } } catch (e) {}
    if (!shared && copyText) copyText(txt).then(function () { print('  скопировано в буфер – вставь в чат.', 'ok'); }, function () { print('  ссылка: ' + url, 'dim'); });
    else if (!shared) print('  ссылка: ' + url, 'dim');
    var tg = 'https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(txt);
    printNode(link(tg, '📨 поделиться в Telegram', true));
    printNode(link(url, url, true));
  }
  function showResult(code) {
    var s = decode(code);
    if (!s) { print('team result: не разобрать код результата. Это ссылка-результат из team share.', 'err'); return; }
    var label = (ARCHES[s.arch] || ARCHES.coder).label;
    print('🎮 Тимагочи «Тимлид» – чужой результат', 'accent');
    print('team@' + label + ' · уровень «' + STAGES[s.stage] + '» · день ' + s.day + ' · релизы ' + s.shipped + '/' + GOAL_SHIP, null);
    print('  ' + resultTitle(s), s.flag === 'x' ? 'err' : 'ok');
    if (s.style) print('  стиль лидерства: ' + s.style.icon + ' ' + s.style.name, 'cy');
    print('  доверие ' + bars(s.trust) + ' ' + s.trust + '   экспертиза ' + bars(s.expertise) + ' ' + s.expertise, null);
    print('  настрой ' + bars(s.morale) + ' ' + s.morale + '   конфликт  ' + bars(s.conflict) + ' ' + s.conflict, null);
    if (s.budget != null) print('  деньги: ' + s.budget + '   прогресс релиза: ' + s.progress + '%', 'dim');
    print('  команда: ' + s.team + ' чел.', 'dim');
    print('────────────────────────────', 'dim');
    print('Обгонишь? team new – начни свою игру.', 'hint');
  }

  // ── снимок метрик для трендовых стрелок (↑↓ относительно прошлого хода) ──
  function snapPrev() { if (!st) return; var m = st.metrics; st.prevMetrics = { trust: m.trust, expertise: m.expertise, morale: m.morale, conflict: m.conflict }; }

  // ── журнал команды как файл в пользовательской ФС (team/log.md) ──
  function chron(text) { if (!st) return; st.history = st.history || []; st.history.push({ d: st.day, t: text }); if (st.history.length > 300) st.history.shift(); writeLog(); }
  function writeLog() {
    if (!st || !ufs) return;
    var now = ufsNow ? ufsNow() : Date.now(), author = ufsUser ? ufsUser() : 'guest';
    var a = ARCHES[st.arch] || ARCHES.coder, m = st.metrics, arc = archetype();
    if (ensureDir) ensureDir('team', author, now);
    var L = [];
    L.push('# Журнал команды team@' + a.label);
    L.push('');
    L.push('Уровень: **' + STAGES[st.stage] + '** · день ' + st.day + ' · релизы ' + st.shipped + '/' + GOAL_SHIP +
      (st.won ? ' · 🏆 победа' : '') + (st.over ? ' · 💀 ' + st.overWhy : ''));
    L.push('');
    L.push('Доверие ' + Math.round(m.trust) + ' · Экспертиза ' + Math.round(m.expertise) + ' · Настрой ' + Math.round(m.morale) + ' · Конфликт ' + Math.round(m.conflict));
    L.push('');
    L.push('Финансы: ' + moneyLine() + ' · ' + releaseLine());
    L.push('');
    L.push('Стиль лидерства: ' + arc.icon + ' ' + arc.name);
    L.push('');
    L.push('Команда (' + st.team.length + '): ' + (st.team.map(function (t) { return t.name + ' (' + personSummary(t) + ')'; }).join(', ') || '–'));
    L.push('');
    L.push('## Хроника');
    var h = st.history || [];
    if (!h.length) L.push('- пока пусто');
    else h.forEach(function (e) { L.push('- день ' + e.d + ' · ' + e.t); });
    var content = L.join('\n') + '\n';
    var ex = ufs.nodes[LOG_PATH];
    ufs.nodes[LOG_PATH] = { type: 'file', content: content, ctime: (ex && ex.ctime) || now, mtime: now, author: author };
    if (ufsSave) ufsSave();
  }
  function showLog() {
    if (!ensure()) return;
    writeLog();
    var h = st.history || [];
    if (!h.length) { print('Журнал пуст – сыграй пару ходов.', 'dim'); }
    else {
      print('📓 Журнал команды (последние ' + Math.min(15, h.length) + ' из ' + h.length + '):', 'accent');
      h.slice(-15).forEach(function (e) { print('  день ' + e.d + ' · ' + e.t, null); });
    }
    print('  весь журнал – файл в твоей ФС: cat ' + LOG_PATH + ' · хвост: tail ' + LOG_PATH, 'hint');
  }

  // ── контент-связки: воронка из игры в материалы сайта и ассистента ──
  var TOPIC_KW = {
    'Рост': ['рост', 'карьер', 'сеньор', 'грейд', 'эксперт', 'джун', 'ментор', 'онбординг'], 'Процессы': ['процесс', 'ревью', 'инцидент', 'архитектур', 'докум', 'код'],
    'Мотивация': ['мотивац', 'выгор', 'настро', 'деньги'], 'AI': ['ai', 'llm', 'клод', 'codex', 'нейро'], 'Карьера': ['карьер', 'собес', 'найм', 'оффер', 'зарплат']
  };
  var TOPIC_Q = {
    'Рост': 'как удержать сильного разработчика', 'Процессы': 'как чинить процессы в команде',
    'Мотивация': 'как бороться с выгоранием в команде', 'AI': 'как ревьюить код от LLM', 'Карьера': 'как нанимать в команду'
  };
  function relatedPage(topic) {
    var kw = TOPIC_KW[topic] || [];
    for (var i = 0; i < pool.length; i++) {
      var t = ((pool[i].t || '') + ' ' + (pool[i].n || '')).toLowerCase();
      for (var j = 0; j < kw.length; j++) if (t.indexOf(kw[j]) >= 0) return pool[i];
    }
    return null;
  }
  function claudeLink(q) {
    var a = el('a', null, 'claude «' + q + '»'); a.href = 'javascript:void(0)';
    a.addEventListener('click', function (e) { e.preventDefault(); run('claude ' + q); });
    return a;
  }
  // Воронка в материалы сайта/ассистента. opts.page – явный источник (напр. разбор,
  // откуда взят вопрос); иначе ищем материал по теме (opts.topic) в S.pool.
  function tieIn(opts) {
    opts = opts || {};
    var page = opts.page || relatedPage(opts.topic), q = opts.q || TOPIC_Q[opts.topic] || 'тимлидство';
    print('  ── разобрать глубже ──', 'dim');
    if (page && page.u) { var n = el('span'); n.appendChild(el('span', 'dim', 'материал: ')); n.appendChild(link(page.u, page.t || page.n)); printNode(n); }
    var row = el('span'); row.appendChild(el('span', 'dim', 'спросить ассистента: ')); row.appendChild(claudeLink(q)); printNode(row);
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
    print('  ' + moneyLine() + ' · ' + releaseLine(), 'dim');
    print('  опыт: ' + st.xp + ' · до «' + (STAGES[st.stage + 1] || 'максимума') + '»: ' +
      (STAGE_XP[st.stage + 1] != null ? Math.max(0, STAGE_XP[st.stage + 1] - st.xp) + ' xp' : '–'), 'dim');
    if (st.team.length) {
      print('  команда (' + st.team.length + '):', 'dim');
      st.team.forEach(function (t) { print('    • ' + t.name + ' – ' + personSummary(t), 'dim'); });
    } else {
      print('  команда пуста – hire наймёт первого человека.', 'dim');
    }
    if (st.over) print('  💀 ' + st.overWhy + '. team reset – заново.', 'err');
    print('  действия (через team): team 1on1 · team mentor · team cr · team pair · team delegate · team retro · team hire · team fire <имя> · team ship · team standup', 'hint');
    print('  стиль · журнал · шеринг: team style · team log · team share', 'hint');
  }
  function teamHelp() {
    print('Тимагочи «Тимлид» – вырасти разработчика и команду в консоли.', 'accent');
    print('Старт:   team new [coder|frontender|teamlead]', null);
    print('Метрики: доверие · экспертиза · настрой растим, конфликт держим низким.', null);
    print('Цель:    дорасти до уровня «тимлид» и выкатить ' + GOAL_SHIP + ' релизов (team ship).', null);
    print('Деньги:  каждый ход деньги += доход - расход. Доход растёт от релизов и здоровья команды; расход растёт от зарплат грейдов.', null);
    print('Ship:    team ship копит прогресс релиза. Грейды ускоряют ship, но старшие люди дороже.', null);
    print('Забота:  без регулярных действий метрики со временем проседают – заглядывай (team standup).', 'dim');
    print('Действия – через team <действие> (напр. team ship, team 1on1 Маша):', 'dim');
    print('  1on1 [имя]   +доверие, -конфликт      mentor [имя] +экспертиза, +опыт', null);
    print('  cr           код-ревью: +экспертиза   pair         +экспертиза, +настрой', null);
    print('  delegate     +настрой, +доверие       retro        -конфликт', null);
    print('  hire         нанять человека          fire <имя>   уволить', null);
    print('  ship         выкатить релиз (цель)    standup      прожить день', null);
    print('Найм:    team hire – интервью: позови (team hire 1), спроси (team a/b/c), реши (team yes/no).', null);
    print('Жизнь:   команда подкидывает инциденты – решай team a/b/c. Стиль решений → team style.', null);
    print('Выбор:   обсуждения и прототипы тратят ёмкость/деньги сейчас; быстрые решения двигают релиз, но копят долг.', null);
    print('Журнал:  team log – хроника решений; это файл: cat ' + LOG_PATH + ' · tail ' + LOG_PATH + '.', null);
    print('Поделиться: team share – ссылка-результат + карточка для чата (обгонят?).', null);
    print('Управление: team (дашборд) · team new <архетип> · team reset', 'hint');
  }
  function startGame(arch) {
    arch = (arch || 'coder').toLowerCase();
    if (!ARCHES[arch]) { print('team new: архетип – coder, frontender или teamlead.', 'err'); return; }
    st = defaults(arch);
    // стартовый напарник в команде – чтобы мир сразу был живым (cold open)
    st.team.push({ name: pick(NAMES), trait: pick(['надёжный', 'тихий', 'звезда']) });
    save(); startTick();
    print('Создан напарник: ' + ARCHES[arch].label + ' (стажёр). Бонус архетипа: +' + LABELS[ARCHES[arch].boost] + '.', 'ok');
    print('В команде уже есть ' + st.team[0].name + ' (' + st.team[0].trait + ').', 'dim');
    // стартовый бонус архетипа
    var b = {}; b[ARCHES[arch].boost] = 12; apply(b);
    snapPrev(); chron('🎬 Новая игра: ' + ARCHES[arch].label + ', напарник ' + st.team[0].name);
    save(); paint();
    teamHelp();
    // cold open: сразу первый инцидент – учим петлю через действие
    fireIncident(); save();
  }
  // Действия можно вызывать и напрямую (ship), и через team <действие> (team ship) –
  // так интуитивнее. Один источник правды для обоих путей.
  var ACTIONS = {
    '1on1': oneonone, mentor: mentor, cr: codereview, codereview: codereview, pair: pair,
    delegate: delegate, retro: retro, hire: startHire, fire: fire, ship: ship,
    standup: standup, daily: standup
  };
  function team(a) {
    var sub = (a[0] || '').toLowerCase();
    // всегда доступно
    if (/^tl\d/.test(sub)) { showResult(a[0]); return; }          // ссылка-результат: team <code>
    if (sub === 'share') { share(); return; }
    if (sub === 'result') { showResult(a[1]); return; }
    if (sub === 'style' || sub === 'стиль') { revealStyle(); return; }
    if (sub === 'log' || sub === 'журнал') { showLog(); return; }
    if (sub === 'new' || sub === 'start') { startGame(a[1]); return; }
    if (sub === 'reset' || sub === 'delete') {
      st = null; stopTick(); try { if (w.localStorage) w.localStorage.removeItem(KEY); } catch (e) {}
      if (hud) { hud.hidden = true; hud.innerHTML = ''; }
      print('Игра сброшена. team new – начать заново.', 'ok'); return;
    }
    if (sub === 'help' || sub === '?') { teamHelp(); return; }
    if (!st) { teamHelp(); return; }
    // активный найм перехватывает ввод (сценарий-симулятор)
    if (st.hire) {
      if (sub === 'cancel' || sub === 'отмена') { st.hire = null; save(); print('Найм отменён.', 'dim'); paint(); return; }
      if (sub === 'hire') {
        if (st.hire.phase === 'list' && /^[1-9]$/.test(a[1] || '')) { interview(parseInt(a[1], 10) - 1); return; }
        if (st.hire.phase === 'interview') showQuestions(); else listCandidates(); return;
      }
      if (!sub) { if (st.hire.phase === 'interview') showQuestions(); else listCandidates(); return; }
      if (sub === 'yes' || sub === 'да') { decideHire(true); return; }
      if (sub === 'no' || sub === 'pass' || sub === 'нет') { decideHire(false); return; }
      if (st.hire.phase === 'list' && /^[1-9]$/.test(sub)) { interview(parseInt(sub, 10) - 1); return; }
      if (st.hire.phase === 'interview' && /^[a-d]$/.test(sub)) { askQuestion(sub); return; }
      remindBusy(); return;
    }
    // активный инцидент перехватывает ввод (ветвящаяся дилемма)
    if (st.pending) {
      if (!sub) { renderIncident(); return; }
      if (/^[a-h1-9]$/.test(sub)) { resolveIncident(sub); return; }
      remindBusy(); return;
    }
    if (ACTIONS[sub]) { ACTIONS[sub](a.slice(1)); return; }
    if (st.asleep) { st.asleep = false; save(); }
    dashboard(); paint();
  }

  // Вызывается из main.js после загрузки: тихо поднять HUD, если есть сохранение.
  function resume() {
    var saved = load();
    if (!saved) return;
    st = saved; decay(); snapPrev(); save(); paint(); startTick();
    writeLog();   // привести файл-журнал в соответствие с восстановленным состоянием
  }

  return {
    resume: resume,
    isActive: function () { return !!st; },
    // Действия НЕ регистрируются как самостоятельные команды – только через team <действие>
    // (см. ACTIONS в team()), чтобы не пересекаться с остальными командами шелла (cr, ship, fire …).
    commands: { team: team }
  };
}
