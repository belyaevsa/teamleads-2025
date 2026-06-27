/*!
 * Тимлид-симулятор + quiz + mini-arcade. An interactive panel mode: instead of
 * streaming append-only lines, it takes over the terminal body with a card that
 * re-renders in place on each step. Owns simSt/SIM (gates the prompt via isActive)
 * and installs its own keyboard (a/b/c choose, Enter advance, s share, q/Esc quit).
 * Scenarios come from data-scenarios; quizzes from data-quizzes.
 */
export function makeSim(S) {
  var print = S.print, printNode = S.printNode, el = S.el, link = S.link, pad = S.pad, d = S.d, w = S.w,
      body = S.body, simPanel = S.simPanel, titleEl = S.titleEl, input = S.input, setPrompt = S.setPrompt,
      sections = S.sections, pool = S.pool, SCEN = S.SCEN, QUIZZES = S.QUIZZES, TG = S.TG, copyText = S.copyText, run = S.run;
  var keysBar = S.root.querySelector('[data-term-keys]');

  var simSt = null;   // { list, idx, score, phase: 'choice'|'outcome'|'done', chosen }
  var SIM = null;     // active dataset (SCEN for sim, a quiz for `quiz`); set in simStart
  var simToastT = null;

  function simLink(ref) {
    if (!ref) return null;
    var p = ref.split('/'), sec = p[0], name = p[1], hit = null;
    if (sec && sections[sec]) sections[sec].forEach(function (it) { if (it.n === name) hit = it; });
    if (!hit) pool.forEach(function (it) { if (it.n === name) hit = it; });
    return hit;
  }
  function simBtn(label, cls, onclick) { var b = el('button', 'sim-btn' + (cls ? ' ' + cls : ''), label); b.type = 'button'; b.onclick = onclick; return b; }
  function simToast(msg) {
    var t = simPanel && simPanel.querySelector('.sim-toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(simToastT); simToastT = setTimeout(function () { t.classList.remove('show'); }, 2000);
  }
  function simFocus() { if (!simPanel) return; try { simPanel.focus({ preventScroll: true }); } catch (e) { simPanel.focus(); } }
  function simStart(set) {
    if (!simPanel) { print('sim: панель недоступна на этой странице.', 'err'); return; }
    SIM = set || SCEN;
    var list = (SIM.scenarios || []).slice();
    if (!list.length) { print((SIM.slug || 'sim') + ': вопросы не загружены', 'err'); return; }
    if (SIM.shuffle !== false) { for (var i = list.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = list[i]; list[i] = list[j]; list[j] = t; } }
    list = list.slice(0, SIM.limit || 6);
    simSt = { list: list, idx: 0, score: 0, phase: 'choice', chosen: null };
    body.style.display = 'none';
    if (keysBar) keysBar.style.display = 'none';
    simPanel.hidden = false;
    if (titleEl) titleEl.textContent = 'guest@teamleads: ~/' + (SIM.slug || 'sim');
    simRender();
    simPanel.focus();
  }
  function simExit() {
    simSt = null;
    if (simPanel) { simPanel.hidden = true; simPanel.innerHTML = ''; }
    body.style.display = '';
    if (keysBar) keysBar.style.display = '';
    setPrompt();
    input.focus();
  }
  function simPick(i) {
    if (!simSt || simSt.phase !== 'choice') return;
    var o = simSt.list[simSt.idx].options[i]; if (!o) return;
    simSt.chosen = i; if (o.good) simSt.score++;
    simSt.phase = 'outcome'; simRender();
  }
  function simAdvance() {
    if (!simSt) return;
    if (simSt.phase === 'outcome') {
      simSt.idx++;
      if (simSt.idx >= simSt.list.length) simSt.phase = 'done';
      else { simSt.phase = 'choice'; simSt.chosen = null; }
      simRender();
    } else if (simSt.phase === 'done') simStart(SIM);
  }
  function simShareUI() {
    var slug = SIM.slug || 'sim';
    var url = SIM.shareUrl || (w.location.origin + '/shell/#' + slug);
    var label = SIM.shareLabel || 'Тимлид-симулятор';
    var played = simSt.phase === 'done' || simSt.idx > 0 || simSt.phase === 'outcome';
    var txt = played ? (label + ': ' + simSt.score + '/' + simSt.list.length + '. Пройди и ты: ' + url)
      : (label + ': ' + url);
    copyText(txt).then(function () { simToast('Ссылка скопирована'); }, function () { simToast('Не удалось скопировать'); });
  }
  function simHead() {
    var head = el('div', 'sim-head');
    head.appendChild(el('span', 'sim-kicker', SIM.title || 'Тимлид-симулятор'));
    head.appendChild(el('span', 'sim-progress', simSt.phase === 'done' ? 'итог' : (simSt.idx + 1) + ' / ' + simSt.list.length));
    head.appendChild(simBtn('✕', 'sim-x', simExit));
    simPanel.appendChild(head);
    var bar = el('div', 'sim-bar'), fill = el('span');
    var done = simSt.idx + (simSt.phase === 'outcome' || simSt.phase === 'done' ? 1 : 0);
    fill.style.width = Math.round(done / simSt.list.length * 100) + '%';
    bar.appendChild(fill); simPanel.appendChild(bar);
  }
  function simRender() {
    if (!simPanel) return;
    simPanel.innerHTML = '';
    simHead();
    if (simSt.phase === 'done') { simRenderDone(); simPanel.appendChild(el('div', 'sim-toast')); simFocus(); return; }
    var s = simSt.list[simSt.idx];
    var pr = el('div', 'sim-prompt');
    String(s.prompt || '').split('\n').forEach(function (l) { if (l.trim()) pr.appendChild(el('p', null, l.trim())); });
    simPanel.appendChild(pr);
    var opts = el('div', 'sim-opts');
    s.options.forEach(function (o, i) {
      var b = el('button', 'sim-opt'); b.type = 'button';
      b.appendChild(el('span', 'sim-opt-key', String.fromCharCode(97 + i)));
      b.appendChild(el('span', 'sim-opt-label', o.label));
      if (simSt.phase === 'outcome') {
        b.disabled = true;
        if (i === simSt.chosen) b.className += o.good ? ' is-good' : ' is-bad';
        else if (o.good) b.className += ' is-answer';
      } else {
        b.onclick = (function (idx) { return function () { simPick(idx); }; })(i);
      }
      opts.appendChild(b);
    });
    simPanel.appendChild(opts);
    if (simSt.phase === 'choice') {
      simPanel.appendChild(el('p', 'sim-hint', 'Выберите вариант – клик или клавиша a / b / c'));
      simFocus(); return;
    }
    var o = s.options[simSt.chosen];
    var res = el('div', 'sim-result');
    var verdict = el('p', 'sim-outcome ' + (o.good ? 'is-good' : 'is-bad'));
    verdict.appendChild(el('span', 'sim-mark', o.good ? '✓' : '✗'));
    verdict.appendChild(d.createTextNode(' ' + o.outcome));
    res.appendChild(verdict);
    if (s.lesson) { var ls = el('p', 'sim-lesson'); ls.appendChild(d.createTextNode('💡 ' + s.lesson)); res.appendChild(ls); }
    if (o.votes != null) {
      var vr = el('div', 'sim-votes');
      var vbar = el('span', 'sim-votebar'), vf = el('span'); vf.style.width = o.votes + '%'; vbar.appendChild(vf);
      vr.appendChild(vbar); vr.appendChild(el('span', 'sim-votenum', 'так выбрали ' + o.votes + '%'));
      res.appendChild(vr);
    }
    var hit = simLink(s.link);
    if (hit) { var rm = el('div', 'sim-readmore'); rm.appendChild(el('span', 'dim', 'разбор → ')); rm.appendChild(link(hit.u, hit.t)); res.appendChild(rm); }
    simPanel.appendChild(res);
    var last = simSt.idx >= simSt.list.length - 1;
    var acts = el('div', 'sim-actions');
    acts.appendChild(simBtn(last ? 'Итог →' : 'Дальше →', 'primary', simAdvance));
    acts.appendChild(simBtn('Поделиться', '', simShareUI));
    acts.appendChild(simBtn('Выйти', 'ghost', simExit));
    simPanel.appendChild(acts);
    simPanel.appendChild(el('div', 'sim-toast'));
    simFocus();
  }
  function simRenderDone() {
    var n = simSt.list.length, sc = simSt.score;
    var card = el('div', 'sim-done');
    card.appendChild(el('p', 'sim-score', 'ИТОГ: ' + sc + ' / ' + n + ' ' + (SIM.scoreLabel || 'разумных решений')));
    var v = SIM.verdicts || ['Чистый прогон. Тимлид не кодит – тимлид анблокает.', 'Крепко. Но часть развилок стоит обсудить вживую.', 'Есть над чем подумать – как раз тема для встречи.'];
    var vi = sc === n ? 0 : (sc >= Math.ceil(n / 2) ? 1 : 2);
    card.appendChild(el('p', 'sim-verdict', v[vi]));
    var funnel = el('div', 'sim-funnel');
    funnel.appendChild(d.createTextNode('Продолжить вживую: '));
    var j = el('a', null, 'join'); j.href = '/join/'; funnel.appendChild(j);
    funnel.appendChild(d.createTextNode(' · ')); funnel.appendChild(link(TG, 'telegram', true));
    card.appendChild(funnel);
    var acts = el('div', 'sim-actions');
    acts.appendChild(simBtn('Ещё раз', 'primary', simStart));
    acts.appendChild(simBtn('Поделиться', '', simShareUI));
    acts.appendChild(simBtn('Выйти', 'ghost', simExit));
    card.appendChild(acts);
    simPanel.appendChild(card);
  }

  // Simulator keyboard: a/b/c (or 1/2/3) to choose, Enter to advance, s share, q/Esc quit.
  S.root.addEventListener('keydown', function (e) {
    if (!simSt) return;
    var k = (e.key || '');
    if (k === 'Escape' || k.toLowerCase() === 'q') { e.preventDefault(); simExit(); return; }
    if (k.toLowerCase() === 's') { e.preventDefault(); simShareUI(); return; }
    if (simSt.phase === 'choice') {
      var idx = 'abcdefgh'.indexOf(k.toLowerCase());
      if (idx < 0 && /^[1-9]$/.test(k)) idx = parseInt(k, 10) - 1;
      if (idx >= 0 && idx < simSt.list[simSt.idx].options.length) { e.preventDefault(); simPick(idx); }
    } else if (k === 'Enter') {
      if (e.target && e.target.tagName === 'BUTTON') return;  // let the focused button fire its own click
      e.preventDefault(); simAdvance();
    }
  });

  // ── commands ──
  function sim() { simStart(SCEN); }
  function quiz(a) {
    var list = (QUIZZES && QUIZZES.quizzes) ? QUIZZES.quizzes : [];
    if (!list.length) { print('quiz: квизы не загружены', 'err'); return; }
    var id = (a[0] || '').trim(), q = null;
    if (id) { list.forEach(function (x) { if (x.id === id) q = x; }); }
    else { q = list[0]; }
    if (!q) { print('quiz: нет квиза «' + id + '». Доступны: ' + list.map(function (x) { return x.id; }).join(', '), 'dim'); return; }
    simStart(q);
  }
  // Mini-arcade. Each game launches either in the terminal panel (sim) or a
  // popup window (sudoku). New games: add a row to GAMES and a launch branch.
  function games(a) {
    var GAMES = [
      ['sim', 'тимлид-симулятор: развилки и решения', 'в терминале'],
      ['team', 'тимагочи: вырасти разработчика и команду', 'в терминале'],
      ['sudoku', 'классическое судоку 9×9', 'в окне']
    ];
    var pick = (a[0] || '').toLowerCase();
    if (!pick) {
      print('Игры сообщества:', 'accent');
      GAMES.forEach(function (g) {
        var n = el('span'); n.appendChild(el('span', 'accent', '• '));
        var a2 = el('a', null, pad(g[0], 10)); a2.href = 'javascript:void(0)';
        a2.addEventListener('click', (function (name) { return function (e) { e.preventDefault(); run('games ' + name); }; })(g[0]));
        n.appendChild(a2); n.appendChild(d.createTextNode(g[1] + ' ')); n.appendChild(el('span', 'dim', '· ' + g[2])); printNode(n);
      });
      print('Запуск: games <имя>. Напр.: games sudoku', 'hint');
      return;
    }
    if (pick === 'sim' || pick === 'simulator') { simStart(); return; }
    if (pick === 'team' || pick === 'tamagotchi') { run('team'); return; }
    if (pick === 'sudoku') {
      try { if (w.ym) w.ym(106055675, 'reachGoal', 'game_open', { source: 'shell', game: 'sudoku' }); } catch (e) {}
      var url = (w.location.origin || '') + '/games/sudoku.html';
      print('открываю судоку в новом окне…', 'cy');
      printNode(link(url, url, true));
      var win = w.open(url, 'tnk_sudoku', 'width=540,height=760,menubar=no,toolbar=no,location=no');
      if (!win) print('окно заблокировано браузером – кликните по ссылке выше.', 'dim');
      return;
    }
    print('games: нет такой игры: ' + pick, 'err');
    print('доступно: sim, sudoku. Список – games.', 'dim');
  }
  function sudoku() { games(['sudoku']); }

  return {
    sim: sim, quiz: quiz, games: games, sudoku: sudoku,
    start: simStart, exit: simExit, isActive: function () { return !!simSt; }
  };
}
