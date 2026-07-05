import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, '../assets/js/shell/tama.js'), 'utf8');
const tamaModuleUrl = 'data:text/javascript;charset=utf-8,' + encodeURIComponent(source);
const { makeTama } = await import(tamaModuleUrl);

const KEY = 'tnk_shell_tama';

function createStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    }
  };
}

function createEl(tag, className, text) {
  return {
    tag,
    className: className || '',
    textContent: text == null ? '' : String(text),
    href: '',
    title: '',
    children: [],
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    addEventListener() {}
  };
}

function baseState(overrides = {}) {
  const base = {
    arch: 'coder',
    ts: Date.now(),
    day: 1,
    xp: 0,
    stage: 0,
    shipped: 0,
    finance: { budget: 100, releaseProgress: 0, releaseSize: 100 },
    metrics: { trust: 50, expertise: 35, conflict: 20, morale: 60 },
    team: [],
    style: {},
    pending: null,
    hire: null,
    history: [],
    prevMetrics: null,
    asleep: false,
    over: false,
    overWhy: '',
    overLogged: false,
    won: false
  };

  return {
    ...base,
    ...overrides,
    finance: overrides.finance === undefined ? base.finance : { ...base.finance, ...overrides.finance },
    metrics: overrides.metrics === undefined ? base.metrics : { ...base.metrics, ...overrides.metrics },
    team: overrides.team === undefined ? base.team : overrides.team
  };
}

function createHarness(savedState, options = {}) {
  const printed = [];
  const copied = [];
  const historyUrls = [];
  const storage = createStorage(savedState ? { [KEY]: JSON.stringify(savedState) } : {});
  const win = {
    document: { hidden: false },
    history: {
      replaceState(_state, _title, url) {
        historyUrls.push(url);
      }
    },
    localStorage: storage,
    location: { origin: 'https://example.test' },
    navigator: {},
    setInterval() { return 1; },
    clearInterval() {}
  };
  const ufs = { nodes: {} };
  const S = {
    w: win,
    el: createEl,
    print(text, cls) {
      printed.push({ text: String(text), cls: cls || null });
    },
    printNode(node) {
      printed.push({ node });
    },
    link(href, text) {
      const a = createEl('a', null, text);
      a.href = href;
      return a;
    },
    copyText(text) {
      copied.push(text);
      return Promise.resolve();
    },
    hud: null,
    run() {},
    ufs,
    ufsSave() {},
    ufsNow() { return 0; },
    ufsUser() { return 'test'; },
    ensureDir() {},
    pool: [],
    INCIDENTS: options.incidents || [],
    QUESTIONS: options.questions || [],
    VOICES: options.voices || []
  };
  const tama = makeTama(S);

  return {
    printed,
    copied,
    historyUrls,
    storage,
    tama,
    team(args) {
      tama.commands.team(args);
      return this.state();
    },
    resume() {
      tama.resume();
      return this.state();
    },
    state() {
      return JSON.parse(storage.getItem(KEY));
    }
  };
}

function withRandom(value, fn) {
  const original = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

function withDateNow(value, fn) {
  const original = Date.now;
  Date.now = () => value;
  try {
    return fn();
  } finally {
    Date.now = original;
  }
}

test('resume migrates saves without finance fields', () => {
  const legacy = baseState();
  delete legacy.finance;

  const h = createHarness(legacy);
  const state = h.resume();

  assert.deepEqual(state.finance, {
    budget: 100,
    releaseProgress: 0,
    releaseSize: 100
  });
});

test('standup applies local daily cash flow', () => withRandom(0.99, () => {
  const h = createHarness();

  h.team(['new', 'coder']);
  assert.equal(h.state().finance.budget, 100);

  const state = h.team(['standup']);

  assert.equal(state.day, 2);
  assert.equal(state.finance.budget, 97);
  assert.equal(state.over, false);
}));

test('ship adds release progress before counting a release', () => withRandom(0.99, () => {
  const h = createHarness();

  h.team(['new', 'coder']);
  const state = h.team(['ship']);

  assert.equal(state.shipped, 0);
  assert.equal(state.finance.releaseProgress, 41);
  assert.equal(state.finance.budget, 97);
}));

test('ship wraps release progress into shipped releases', () => withRandom(0.99, () => {
  const h = createHarness(baseState({
    finance: { budget: 100, releaseProgress: 90, releaseSize: 100 },
    metrics: { trust: 100, expertise: 100, morale: 100, conflict: 0 }
  }));

  h.resume();
  const state = h.team(['ship']);

  assert.equal(state.shipped, 1);
  assert.equal(state.finance.releaseProgress, 37);
  assert.equal(state.finance.budget, 104);
}));

test('budget exhaustion ends the game', () => withRandom(0.99, () => {
  const h = createHarness(baseState({
    finance: { budget: 1 },
    team: [
      { name: 'A', trait: 'тихий' },
      { name: 'B', trait: 'тихий' },
      { name: 'C', trait: 'тихий' },
      { name: 'D', trait: 'тихий' },
      { name: 'E', trait: 'тихий' },
      { name: 'F', trait: 'тихий' }
    ]
  }));

  h.resume();
  const state = h.team(['standup']);

  assert.equal(state.over, true);
  assert.equal(state.overWhy, 'деньги закончились');
  assert.equal(state.finance.budget <= 0, true);
}));

test('daily budget burn accounts for grade salary', () => withRandom(0.99, () => {
  const junior = createHarness(baseState({
    team: [{ name: 'Джун', trait: 'тихий', grade: 'junior' }]
  }));
  const senior = createHarness(baseState({
    team: [{ name: 'Сеньор', trait: 'тихий', grade: 'senior' }]
  }));

  junior.resume();
  senior.resume();
  const juniorState = junior.team(['standup']);
  const seniorState = senior.team(['standup']);

  assert.equal(juniorState.team.length, seniorState.team.length);
  assert.ok(
    seniorState.finance.budget < juniorState.finance.budget,
    `expected senior salary to burn more budget than junior salary: senior=${seniorState.finance.budget}, junior=${juniorState.finance.budget}`
  );
}));

test('ship is blocked when morale is too low', () => withRandom(0.99, () => {
  const h = createHarness(baseState({
    finance: { budget: 88, releaseProgress: 23 },
    metrics: { morale: 14 }
  }));

  h.resume();
  const state = h.team(['ship']);

  assert.equal(state.day, 1);
  assert.equal(state.finance.budget, 88);
  assert.equal(state.finance.releaseProgress, 23);
  assert.equal(state.shipped, 0);
  assert.equal(h.printed.some((p) => p.text && p.text.includes('команда на грани выгорания')), true);
}));

test('ship speed accounts for grade seniority', () => withRandom(0.99, () => {
  const junior = createHarness(baseState({
    team: [{ name: 'Джун', trait: 'тихий', grade: 'junior' }]
  }));
  const senior = createHarness(baseState({
    team: [{ name: 'Сеньор', trait: 'тихий', grade: 'senior' }]
  }));

  junior.resume();
  senior.resume();
  const juniorState = junior.team(['ship']);
  const seniorState = senior.team(['ship']);

  assert.equal(juniorState.team.length, seniorState.team.length);
  assert.ok(
    seniorState.finance.releaseProgress > juniorState.finance.releaseProgress,
    `expected senior grade to ship faster than junior grade: senior=${seniorState.finance.releaseProgress}, junior=${juniorState.finance.releaseProgress}`
  );
}));

test('incident options can consume release capacity and elapsed days', () => withRandom(0.99, () => {
  const incident = {
    id: 'capacity-choice',
    t: '{name} просит день на техдолг.',
    o: [
      {
        l: 'Дать время',
        s: 'harmony',
        e: { trust: 5, releaseProgress: -10, days: 2, xp: 1 },
        out: 'Команда выдохнула.'
      }
    ]
  };
  const h = createHarness(baseState({
    pending: { id: 'capacity-choice', name: 'Маша' },
    finance: { budget: 100, releaseProgress: 50 },
    team: [{ name: 'Маша', trait: 'тихий' }]
  }), { incidents: [incident] });

  h.resume();
  const state = h.team(['a']);

  assert.equal(state.pending, null);
  assert.equal(state.day, 3);
  assert.equal(state.finance.releaseProgress, 40);
  assert.equal(state.finance.budget, 94);
  assert.equal(state.style.harmony, 1);
}));

test('careful hiring softens toxic onboarding', () => withRandom(0.99, () => {
  const candidate = { name: 'Олег', role: 'сеньор', trait: 'токсичный', skill: 8 };
  const blind = createHarness(baseState({
    hire: { cands: [{ ...candidate, asked: [] }], phase: 'interview', sel: 0, budget: 2 }
  }));
  const vetted = createHarness(baseState({
    hire: { cands: [{ ...candidate, asked: ['conflict', 'tech'] }], phase: 'interview', sel: 0, budget: 0 }
  }));

  blind.resume();
  vetted.resume();
  const blindState = blind.team(['yes']);
  const vettedState = vetted.team(['yes']);

  assert.equal(blindState.team.length, 1);
  assert.equal(vettedState.team.length, 1);
  assert.equal(blindState.team[0].trait, 'токсичный');
  assert.equal(vettedState.team[0].trait, 'токсичный');
  assert.equal(vettedState.metrics.conflict < blindState.metrics.conflict, true);
  assert.equal(vettedState.metrics.trust > blindState.metrics.trust, true);
  assert.equal(vettedState.finance.budget > blindState.finance.budget, true);
}));

test('hiring persists candidate grade fields for economy tracking', () => withRandom(0.99, () => {
  const candidate = { name: 'Лера', role: 'сеньор', grade: 'senior', trait: 'надёжный', skill: 9 };
  const h = createHarness(baseState({
    hire: { cands: [{ ...candidate, asked: ['conflict', 'tech'] }], phase: 'interview', sel: 0, budget: 0 }
  }));

  h.resume();
  const state = h.team(['yes']);

  assert.equal(state.team.length, 1);
  assert.equal(state.team[0].name, 'Лера');
  assert.equal(state.team[0].trait, 'надёжный');
  assert.equal(state.team[0].role, 'сеньор');
  assert.equal(state.team[0].grade, 'senior');
  assert.equal(state.team[0].skill, 9);
}));

test('resume decay marks stale games asleep and degrades metrics', () => {
  const now = 1_800_000_000_000;
  const h = createHarness(baseState({ ts: now - 36 * 60 * 60 * 1000 }));

  const state = withDateNow(now, () => h.resume());

  assert.equal(state.asleep, true);
  assert.equal(state.ts, now);
  assert.ok(Math.abs(state.metrics.trust - 47.6) < 1e-9);
  assert.ok(Math.abs(state.metrics.morale - 58) < 1e-9);
  assert.ok(Math.abs(state.metrics.conflict - 22.6) < 1e-9);
  assert.ok(Math.abs(state.metrics.expertise - 34) < 1e-9);
});

test('share codes include budget and release progress', async () => {
  const h = createHarness(baseState({
    day: 7,
    shipped: 2,
    finance: { budget: 77, releaseProgress: 42 },
    metrics: { trust: 61, expertise: 62, morale: 63, conflict: 21 },
    team: [{ name: 'Айгуль', trait: 'надёжный' }],
    style: { people: 4 }
  }));

  h.resume();
  h.team(['share']);
  await Promise.resolve();

  assert.equal(h.historyUrls.length, 1);
  assert.match(h.historyUrls[0], /\/s\/team-result\/\?cmd=tl3-/);
  assert.match(decodeURIComponent(h.historyUrls[0]), /tl3-0-2-7-61-62-63-21-1-p-c-p-77-42/);
  assert.equal(h.copied.length, 1);
  assert.match(h.copied[0], /деньги 77/);
  assert.match(h.copied[0], /прогресс релиза 42%/);
});

test('result command renders tl3 finance fields', () => {
  const h = createHarness();

  h.team(['result', 'tl3-4-5-12-80-70-65-20-3-w-t-d-123-64']);

  assert.equal(h.printed.some((p) => p.text === '  деньги: 123   прогресс релиза: 64%'), true);
  assert.equal(h.printed.some((p) => p.text && p.text.includes('стиль лидерства: 🚢 Капитан')), true);
});
