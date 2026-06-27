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

  // ── инциденты: ветвящиеся дилеммы тимлида (заменяют плоские события) ──
  // Каждый вариант (o[]) несёт стиль (s: people|deliver|harmony|expertise|fire) для
  // вычисления архетипа лидерства, эффекты (e) и исход (out). {name} подставляет
  // случайного человека из команды; q привязывает реплику из voices.yaml по теме.
  var INCIDENTS = [
    { id: 'star-offer', need: 'team', q: 'Рост',
      t: '{name} принесла оффер от другой компании, +40%. Сидит, мнётся.',
      o: [
        { l: 'Контроффер деньгами', s: 'deliver', e: { trust: 3, morale: 4, conflict: 7 }, out: 'Деньги нашли. Остальные узнали – и обиделись.' },
        { l: 'Честный 1-on-1', s: 'people', e: { trust: 9, morale: 5, xp: 4 }, out: 'Дело не в деньгах, а в скуке. Дал челлендж – осталась.' },
        { l: 'Отпустить красиво', s: 'harmony', e: { morale: -6, trust: 5, conflict: -3 }, out: 'Ушла тепло, обещала рекомендовать вас. Но дырка в команде.' }
      ] },
    { id: 'prod-down', q: 'Процессы',
      t: 'Прод упал в пятницу 18:00. Телефон разрывается.',
      o: [
        { l: 'Чиню сам до ночи', s: 'fire', e: { expertise: 3, morale: -10, trust: 2 }, out: 'Поднял к полуночи. Герой. Завтра никакой.' },
        { l: 'Поднимаю дежурного', s: 'people', e: { trust: 4, expertise: 5, conflict: 3 }, out: 'Дежурный справился сам – вырос. Немного поворчал.' },
        { l: 'Откат и разбор в понедельник', s: 'harmony', e: { morale: 4, conflict: 5 }, out: 'Команда выдохнула. Продакт – нет.' }
      ] },
    { id: 'arch-feud', need: 'team', q: 'Процессы',
      t: 'Два инженера неделю спорят: монолит против микросервисов.',
      o: [
        { l: 'Решаю сам, быстро', s: 'deliver', e: { conflict: -8, trust: -4, morale: -2 }, out: 'Спор закрыт. Автономия тоже.' },
        { l: 'ADR + день на прототип', s: 'expertise', e: { expertise: 8, conflict: -6, morale: 3, xp: 4 }, out: 'Решение на данных. Медленно, но по-взрослому.' },
        { l: 'Пусть договорятся сами', s: 'people', e: { trust: 5, conflict: 4 }, out: 'Договорились. Заняло ещё три дня.' }
      ] },
    { id: 'junior-ci', need: 'team', q: 'Процессы',
      t: '{name} третий раз за неделю уронил CI на мейне.',
      o: [
        { l: 'Публично разобрать', s: 'fire', e: { conflict: 8, morale: -6, expertise: 2 }, out: 'CI больше не падает. И {name} теперь боится коммитить.' },
        { l: '1-on-1 + менторство', s: 'people', e: { expertise: 6, trust: 6, morale: 3, xp: 4 }, out: 'Оказалось, не знал про pre-commit. Научил – расцвёл.' },
        { l: 'Поставить branch protection', s: 'expertise', e: { expertise: 5, conflict: -2 }, out: 'Процесс вместо нотаций. Мейн в безопасности.' }
      ] },
    { id: 'deadline-cut', q: 'Мотивация',
      t: 'Продакт срезал срок вдвое: «бизнес просит».',
      o: [
        { l: 'Защитить команду', s: 'harmony', e: { trust: 8, morale: 6, conflict: 4 }, out: 'Отстоял реальные сроки. Продакт надулся, команда зауважала.' },
        { l: 'Согласиться и крауч', s: 'deliver', e: { shipped: 1, morale: -12, conflict: 6 }, out: 'Успели. Цена – выгорание на горизонте.' },
        { l: 'Срезать скоуп', s: 'expertise', e: { trust: 4, morale: 3, expertise: 2 }, out: 'Договорились о MVP. Все живы.' }
      ] },
    { id: 'burnout-sign', need: 'team', q: 'Мотивация',
      t: '{name} тихо перегружен: PR-ы в 2 ночи, шутки про увольнение.',
      o: [
        { l: 'Отправить в отпуск', s: 'people', e: { morale: 8, trust: 6, shipped: 0 }, out: 'Вернулся с горящими глазами. Стоило недели простоя.' },
        { l: 'Снять часть задач', s: 'harmony', e: { morale: 5, trust: 4, conflict: -2 }, out: 'Разгрузил. Выдохнул.' },
        { l: 'Сделать вид, что не заметил', s: 'fire', e: { morale: -8, conflict: 6, trust: -5 }, out: 'Через неделю {name} принёс заявление.' }
      ] },
    { id: 'toxic-star', need: 'team', q: 'Рост',
      t: '{name} – сильный инженер, но топит митинги в сарказме. Джуны молчат.',
      o: [
        { l: 'Жёсткий разговор', s: 'fire', e: { conflict: -10, morale: 4, trust: 3 }, out: 'Поведение поправилось. Осадок остался.' },
        { l: 'Дать роль ментора', s: 'people', e: { expertise: 6, conflict: -6, trust: 5, xp: 3 }, out: 'Ответственность развернула энергию в плюс.' },
        { l: 'Терпеть ради скилла', s: 'deliver', e: { expertise: 4, conflict: 9, morale: -5 }, out: 'Код едет, атмосфера – нет.' }
      ] },
    { id: 'hire-choice', q: 'Карьера',
      t: 'Два финалиста: ровный мидл и яркий, но рисковый сеньор.',
      o: [
        { l: 'Надёжный мидл', s: 'harmony', e: { trust: 4, conflict: -3, expertise: 3 }, out: 'Предсказуемо и спокойно. Без фейерверков.' },
        { l: 'Рисковый сеньор', s: 'deliver', e: { expertise: 8, conflict: 5, morale: 2 }, out: 'Мощно и непредсказуемо. Посмотрим.' },
        { l: 'Никого, поднять текущих', s: 'people', e: { trust: 6, morale: 5, xp: 4 }, out: 'Вложился в своих. Найм подождёт.' }
      ] },
    { id: 'remote-trust', need: 'team', q: 'Процессы',
      t: '{name} на удалёнке: камера выключена, отвечает к вечеру. Команда шепчется.',
      o: [
        { l: 'Ввести жёсткий контроль', s: 'fire', e: { trust: -8, conflict: 6, morale: -4 }, out: 'Микроменеджмент. Доверие просело у всех.' },
        { l: 'Договориться об overlap-часах', s: 'expertise', e: { trust: 4, conflict: -4, expertise: 2 }, out: 'Async по-взрослому: договорённости вместо слежки.' },
        { l: '1-on-1: всё ли ок?', s: 'people', e: { trust: 8, morale: 4 }, out: 'У человека был тяжёлый период. Поддержал.' }
      ] },
    { id: 'ai-trap', q: 'AI',
      t: 'Команда залила в прод фичу, которую «дописал» LLM. Никто не вычитал.',
      o: [
        { l: 'Ввести обязательное ревью AI-кода', s: 'expertise', e: { expertise: 7, conflict: 2, trust: 3 }, out: 'Скорость чуть упала, доверие к коду выросло.' },
        { l: 'Откатить и отчитать', s: 'fire', e: { conflict: 7, morale: -5, expertise: 2 }, out: 'Урок усвоен через стресс.' },
        { l: 'Разобрать на ретро без виноватых', s: 'harmony', e: { conflict: -6, trust: 6, expertise: 3, xp: 3 }, out: 'Сделали чек-лист вместо поиска виноватого.' }
      ] },
    { id: 'promo-politics', need: 'team', q: 'Карьера',
      t: 'Грейд только один. {name} и ещё один сеньор оба ждут повышения.',
      o: [
        { l: 'Повысить по факту вклада', s: 'expertise', e: { expertise: 4, conflict: 5, trust: 2 }, out: 'По делу. Второй обиделся.' },
        { l: 'Честно объяснить обоим план', s: 'people', e: { trust: 8, morale: 4, conflict: -3 }, out: 'Прозрачность сняла напряжение. Оба остались.' },
        { l: 'Оттянуть решение', s: 'harmony', e: { conflict: 6, trust: -4 }, out: 'Неопределённость хуже отказа.' }
      ] },
    { id: 'on-call-revolt', need: 'team', q: 'Мотивация',
      t: 'Команда бунтует против ночных дежурств: «так не нанимались».',
      o: [
        { l: 'Платить за on-call', s: 'deliver', e: { morale: 6, trust: 4, conflict: -4 }, out: 'Деньги решили. Бюджет напрягся.' },
        { l: 'Сократить алерты инженерно', s: 'expertise', e: { expertise: 8, morale: 5, conflict: -5, xp: 4 }, out: 'Убрали шум – дежурить стало незазорно.' },
        { l: 'Приказать терпеть', s: 'fire', e: { morale: -10, conflict: 8, trust: -6 }, out: 'Двое обновили резюме.' }
      ] }
  ];
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
      metrics: { trust: 50, expertise: 35, conflict: 20, morale: 60 },
      team: [], style: {}, pending: null, hire: null, asleep: false, over: false, overWhy: '', won: false
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
      revealStyle();
      print('  поделись результатом: team share', 'hint');
    }
  }
  function reportOver() {
    if (!st.over) return false;
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
    apply(d);
    tallyStyle(style);
    st.day += 1;
    drift(0.6);                 // время идёт – лёгкий дневной дрейф
    print(msg + '  (' + deltaStr(d) + ')', 'accent');
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
    st.asleep = false; st.day += 1; drift(1);
    print('🗓 стендап: новый день, команда синкнулась.', 'accent');
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
    var y = Math.max(1, Math.round((m.expertise * 0.5 + m.morale * 0.3 + (100 - m.conflict) * 0.2) / 20));
    st.asleep = false;
    apply({ shipped: y, morale: -15, trust: 4, conflict: -3, xp: 20 + y * 5 });
    tallyStyle('deliver'); if (m.morale < 30) tallyStyle('fire');   // релиз через выгорание = пожарный стиль
    st.day += 1; drift(0.6);
    print('🚀 релиз выкачен: +' + y + ' (всего ' + st.shipped + '/' + GOAL_SHIP + '). Крауч стоит сил.', 'ok');
    if (st.metrics.morale < 12 && st.team.length) {
      var lost = st.team.pop();
      apply({ conflict: 10, trust: -4 });
      print('  ⚠ выгорание после крауча: ' + lost.name + ' ушёл. Береги людей.', 'err');
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
    print('  глубже про тимлидство: principles · discuss · team share – похвастаться стилем', 'hint');
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
    apply(op.e); tallyStyle(op.s);
    print('→ ' + op.out.replace('{name}', name) + '  (' + deltaStr(op.e) + ')', harsh ? 'err' : 'accent');
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
    used[name] = 1;
    return { name: name, role: pick(ROLES), trait: pick(TRAIT_KEYS), skill: rnd(7) + 3, asked: [] };
  }
  function candBlurb(c) { return c.role + ', ' + (c.skill >= 8 ? 'сильное резюме' : c.skill >= 5 ? 'ровное резюме' : 'скромное резюме'); }
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
    st.team.push({ name: c.name, trait: c.trait });
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
  // Формат кода: tl1-<стадия>-<релизы>-<день>-<доверие>-<экспертиза>-<настрой>-<конфликт>-<команда>-<флаг>-<арх>
  function archCode(a) { return a === 'frontender' ? 'f' : a === 'teamlead' ? 't' : 'c'; }
  function archFromCode(c) { return c === 'f' ? 'frontender' : c === 't' ? 'teamlead' : 'coder'; }
  function flagOf(s) { return s.over ? 'x' : s.won ? 'w' : 'p'; }
  function encode() {
    var m = st.metrics, a = archetype();
    // tl2 добавляет 12-й токен – букву архетипа лидерства (tl1 без неё всё ещё читается)
    return ['tl2', st.stage, st.shipped, st.day, Math.round(m.trust), Math.round(m.expertise),
      Math.round(m.morale), Math.round(m.conflict), st.team.length, flagOf(st), archCode(st.arch),
      (ARCH_LETTER[a.k] || 'n')].join('-');
  }
  function decode(code) {
    var p = String(code || '').toLowerCase().split('-');
    if ((p[0] !== 'tl1' && p[0] !== 'tl2') || p.length < 11) return null;
    var n = function (i) { var v = parseInt(p[i], 10); return isNaN(v) ? 0 : Math.max(0, Math.min(999, v)); };
    return { stage: Math.min(5, n(1)), shipped: n(2), day: n(3), trust: Math.min(100, n(4)),
      expertise: Math.min(100, n(5)), morale: Math.min(100, n(6)), conflict: Math.min(100, n(7)),
      team: Math.min(20, n(8)), flag: (p[9] || 'p'), arch: archFromCode(p[10]),
      style: (p[0] === 'tl2' && ARCH_BY_LETTER[p[11]]) ? ARCH_BY_LETTER[p[11]] : null };
  }
  function isWin(s) { return s.flag === 'w' || s.stage >= 5 || (s.stage >= WIN_STAGE && s.shipped >= GOAL_SHIP); }
  function resultTitle(s) {
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
      (s.style ? '. Мой стиль: ' + s.style.icon + ' ' + s.style.name : '') + '. Обгонишь? ' + url;
  }
  function share() {
    if (!ensure()) return;
    var code = encode(), s = decode(code), url = shareUrl(s, code), txt = shareText(s, url);
    // адресная строка = ссылка-результат (как и остальной шеринг сайта)
    try { if (w.history && w.history.replaceState) w.history.replaceState(null, '', url); } catch (e) {}
    print('🔗 Результат готов к шарингу:', 'accent');
    print('  ' + resultTitle(s) + ' · «' + STAGES[s.stage] + '» · релизы ' + s.shipped + '/' + GOAL_SHIP + ' · день ' + s.day, null);
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
    print('  команда: ' + s.team + ' чел.', 'dim');
    print('────────────────────────────', 'dim');
    print('Обгонишь? team new – начни свою игру.', 'hint');
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
    print('  действия (через team): team 1on1 · team mentor · team cr · team pair · team delegate · team retro · team hire · team fire <имя> · team ship · team standup', 'hint');
    print('  стиль и шеринг: team style · team share', 'hint');
  }
  function teamHelp() {
    print('Тимагочи «Тимлид» – вырасти разработчика и команду в консоли.', 'accent');
    print('Старт:   team new [coder|frontender|teamlead]', null);
    print('Метрики: доверие · экспертиза · настрой растим, конфликт держим низким.', null);
    print('Цель:    дорасти до уровня «тимлид» и выкатить ' + GOAL_SHIP + ' релизов (team ship).', null);
    print('Забота:  без регулярных действий метрики со временем проседают – заглядывай (team standup).', 'dim');
    print('Действия – через team <действие> (напр. team ship, team 1on1 Маша):', 'dim');
    print('  1on1 [имя]   +доверие, -конфликт      mentor [имя] +экспертиза, +опыт', null);
    print('  cr           код-ревью: +экспертиза   pair         +экспертиза, +настрой', null);
    print('  delegate     +настрой, +доверие       retro        -конфликт', null);
    print('  hire         нанять человека          fire <имя>   уволить', null);
    print('  ship         выкатить релиз (цель)    standup      прожить день', null);
    print('Найм:    team hire – интервью: позови (team hire 1), спроси (team a/b/c), реши (team yes/no).', null);
    print('Жизнь:   команда подкидывает инциденты – решай team a/b/c. Стиль решений → team style.', null);
    print('Поделиться: team share – ссылка-результат + карточка для чата (обгонят?).', null);
    print('Управление: team (дашборд) · team new <архетип> · team reset', 'hint');
  }
  function startGame(arch) {
    arch = (arch || 'coder').toLowerCase();
    if (!ARCHES[arch]) { print('team new: архетип – coder, frontender или teamlead.', 'err'); return; }
    st = defaults(arch);
    // стартовый напарник в команде – чтобы мир сразу был живым (cold open)
    st.team.push({ name: pick(NAMES), trait: pick(['надёжный', 'тихий', 'звезда']) });
    save(); paint(); startTick();
    print('Создан напарник: ' + ARCHES[arch].label + ' (стажёр). Бонус архетипа: +' + LABELS[ARCHES[arch].boost] + '.', 'ok');
    print('В команде уже есть ' + st.team[0].name + ' (' + st.team[0].trait + ').', 'dim');
    // стартовый бонус архетипа
    var b = {}; b[ARCHES[arch].boost] = 12; apply(b); save(); paint();
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
    st = saved; decay(); save(); paint(); startTick();
  }

  return {
    resume: resume,
    isActive: function () { return !!st; },
    // Действия НЕ регистрируются как самостоятельные команды – только через team <действие>
    // (см. ACTIONS в team()), чтобы не пересекаться с остальными командами шелла (cr, ship, fire …).
    commands: { team: team }
  };
}
