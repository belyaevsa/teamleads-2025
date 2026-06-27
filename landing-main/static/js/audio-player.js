/* Audio player + synced transcript for event pages.
   Progressive enhancement: keyed off [data-audio-player]; no-op if absent.
   Data files (same-origin, under /audio/):
     <base>.transcript.json  { duration, segments:[{t,end,text,speaker?}] }  (lazy)
     <base>.peaks.json       { length, peaks:[0..1] }                       (waveform)
   Features: colour-coded waveform scrubber, ±10s skips, animated play/pause,
   current-chapter readout, resume, ?t= deep links, buffering/error states,
   sticky mini-player. */
(function () {
  'use strict';

  var root = document.querySelector('[data-audio-player]');
  if (!root) return;
  var audio = root.querySelector('[data-ap-audio]');
  if (!audio) return;

  var els = {
    play: root.querySelector('[data-ap-play]'),
    bar: root.querySelector('[data-ap-bar]'),
    wave: root.querySelector('[data-ap-wave]'),
    playhead: root.querySelector('[data-ap-playhead]'),
    cur: root.querySelector('[data-ap-cur]'),
    dur: root.querySelector('[data-ap-dur]'),
    rate: root.querySelector('[data-ap-rate]'),
    now: root.querySelector('[data-ap-now]'),
    resume: root.querySelector('[data-ap-resume]'),
    error: root.querySelector('[data-ap-error]'),
    transcript: root.querySelector('[data-ap-transcript]'),
    lines: root.querySelector('[data-ap-lines]'),
    search: root.querySelector('[data-ap-search]'),
    empty: root.querySelector('[data-ap-empty]'),
    loading: root.querySelector('[data-ap-loading]'),
    chapters: root.querySelector('[data-ap-chapters]'),
    expand: root.querySelector('[data-ap-expand]'),
    expandLabel: root.querySelector('[data-ap-expand-label]')
  };

  var RATES = [1, 1.25, 1.5, 2];
  var rateIdx = 0;
  var slug = (location.pathname.split('/').filter(Boolean).pop()) || 'event';

  /* ---- helpers ---------------------------------------------------------- */

  function fmt(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    sec = Math.floor(sec);
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return (h ? h + ':' : '') + (h && m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
  }
  function parseTime(v) {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    v = String(v).trim();
    if (/^\d+(\.\d+)?$/.test(v)) return parseFloat(v);
    var parts = v.split(':').map(Number);
    if (parts.some(isNaN)) return 0;
    return parts.reduce(function (acc, n) { return acc * 60 + n; }, 0);
  }
  function hexToRgba(hex, a) {
    hex = String(hex).replace('#', '');
    if (hex.length === 3) hex = hex.replace(/./g, '$&$&');
    var n = parseInt(hex, 16) || 0;
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  var METRIKA_ID = 106055675;
  function track(goal, params) {
    try { if (typeof window.ym === 'function') window.ym(METRIKA_ID, 'reachGoal', goal, params); }
    catch (e) { /* never let analytics break playback */ }
  }

  /* ---- transport -------------------------------------------------------- */

  function safePlay() {
    var p = audio.play();
    if (p && typeof p.catch === 'function') p.catch(function () {});
  }
  function togglePlay() { if (audio.paused) safePlay(); else audio.pause(); }
  function seekTo(sec, andPlay) {
    if (isFinite(audio.duration)) sec = Math.min(sec, audio.duration - 0.05);
    audio.currentTime = Math.max(0, sec);
    render();
    if (andPlay && audio.paused) safePlay();
  }

  els.play.addEventListener('click', togglePlay);

  root.querySelectorAll('[data-ap-skip]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var d = parseFloat(btn.getAttribute('data-ap-skip')) || 0;
      seekTo(audio.currentTime + d, false);
      btn.classList.remove('is-bumped'); void btn.offsetWidth; btn.classList.add('is-bumped');
      track('audio_skip', { event: slug, dir: d < 0 ? 'back' : 'fwd' });
    });
  });

  var playedOnce = false, raf = null;
  audio.addEventListener('play', function () {
    els.play.classList.add('is-playing');
    els.play.setAttribute('aria-label', 'Пауза');
    if (mini) mini.classList.add('is-playing');
    if (els.resume) els.resume.hidden = true;
    if (!playedOnce) { playedOnce = true; track('audio_play', { event: slug }); }
    loop();
  });
  audio.addEventListener('pause', function () {
    els.play.classList.remove('is-playing');
    els.play.setAttribute('aria-label', 'Слушать');
    if (mini) mini.classList.remove('is-playing');
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    render();
  });
  function loop() { render(); if (!audio.paused) raf = requestAnimationFrame(loop); }

  // Buffering + error feedback.
  audio.addEventListener('waiting', function () { els.play.classList.add('is-buffering'); });
  audio.addEventListener('playing', function () { els.play.classList.remove('is-buffering'); });
  audio.addEventListener('canplay', function () { els.play.classList.remove('is-buffering'); });
  function showError() {
    els.play.classList.remove('is-buffering');
    if (els.error) {
      els.error.hidden = false;
      els.error.textContent = 'Не удалось загрузить аудио. Обновите страницу или попробуйте позже.';
    }
  }
  audio.addEventListener('error', showError);
  var srcEl = audio.querySelector('source');
  if (srcEl) srcEl.addEventListener('error', showError);

  audio.addEventListener('loadedmetadata', function () {
    els.dur.textContent = fmt(audio.duration);
    els.bar.setAttribute('aria-valuemax', Math.floor(audio.duration || 0));
    buildTimeline(audio.duration);
    render();
    restorePosition();
  });

  audio.addEventListener('timeupdate', function () {
    els.cur.textContent = fmt(audio.currentTime);
    els.bar.setAttribute('aria-valuenow', Math.floor(audio.currentTime));
    els.bar.setAttribute('aria-valuetext', fmt(audio.currentTime) + ' из ' + fmt(audio.duration));
    updateNow(audio.currentTime);
    highlight(audio.currentTime);
    if (audio.paused) render();   // while playing, the rAF loop handles it
    savePosition();
  });
  audio.addEventListener('seeked', render);
  audio.addEventListener('ended', function () { clearPosition(); });

  // Scrub: click + drag anywhere on the bar.
  function barSeek(clientX) {
    var rect = els.bar.getBoundingClientRect();
    var ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    if (audio.duration) seekTo(ratio * audio.duration, false);
  }
  var dragging = false;
  els.bar.addEventListener('pointerdown', function (e) {
    dragging = true; els.bar.setPointerCapture(e.pointerId); barSeek(e.clientX);
  });
  els.bar.addEventListener('pointermove', function (e) { if (dragging) barSeek(e.clientX); showTip(e.clientX); });
  els.bar.addEventListener('pointerup', function () { dragging = false; });
  els.bar.addEventListener('pointerleave', function () { if (tip) tip.hidden = true; });
  els.bar.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') { seekTo(audio.currentTime + 10, false); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { seekTo(audio.currentTime - 10, false); e.preventDefault(); }
    else if (e.key === ' ' || e.key === 'Enter') { togglePlay(); e.preventDefault(); }
  });

  els.rate.addEventListener('click', function () {
    rateIdx = (rateIdx + 1) % RATES.length;
    audio.playbackRate = RATES[rateIdx];
    els.rate.textContent = RATES[rateIdx] + '×';
  });

  /* ---- chapters + colour model ------------------------------------------ */

  var PALETTE = ['#00AFCA', '#FEC50C', '#8B5CF6', '#F59E0B', '#10B981',
                 '#EF4444', '#EC4899', '#14B8A6'];

  var chapters = Array.prototype.slice.call(root.querySelectorAll('.ap-chapter'))
    .map(function (btn, i) {
      var c = PALETTE[i % PALETTE.length];
      btn.style.setProperty('--ap-c', c);
      var titleEl = btn.querySelector('.ap-chapter-title');
      return { start: parseTime(btn.getAttribute('data-ap-seek')), color: c,
               title: titleEl ? titleEl.textContent : '', el: btn };
    });

  document.querySelectorAll('[data-ap-seek]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var t = parseTime(btn.getAttribute('data-ap-seek'));
      seekTo(t, true);
      track('audio_chapter', { event: slug, at: Math.round(t) });
      root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
  document.querySelectorAll('[data-ap-fmt]').forEach(function (el) {
    el.textContent = fmt(parseTime(el.getAttribute('data-ap-fmt')));
  });

  var timelineBuilt = false;
  var zones = [];   // [{ start, end, title, color, el }] in TIME order
  var tip = null;
  function buildTimeline(duration) {
    if (timelineBuilt || !duration || !isFinite(duration) || chapters.length < 1 || !els.bar) return;
    timelineBuilt = true;
    var ordered = chapters.slice().sort(function (a, b) { return a.start - b.start; });
    ordered.forEach(function (ch, i) {
      zones.push({ start: ch.start, end: (i + 1 < ordered.length) ? ordered[i + 1].start : duration,
                   title: ch.title, color: ch.color, el: ch.el });
    });
    tip = document.createElement('div');
    tip.className = 'ap-bar-tip'; tip.hidden = true;
    els.bar.appendChild(tip);
    buildMiniZones(duration);
  }
  function zoneAt(t) {
    for (var i = 0; i < zones.length; i++) if (t >= zones[i].start && t < zones[i].end) return zones[i];
    return zones.length && t >= zones[zones.length - 1].start ? zones[zones.length - 1] : null;
  }

  /* ---- waveform (canvas) ------------------------------------------------ */

  var ctx = els.wave ? els.wave.getContext('2d') : null;
  var peaks = null;
  (function loadPeaks() {
    var src = root.getAttribute('data-peaks-src');
    if (!src || !ctx) return;
    fetch(src).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.peaks) { peaks = d.peaks; render(); } })
      .catch(function () { /* flat waveform fallback */ });
  })();

  function roundRect(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r);
    c.closePath(); c.fill();
  }
  function drawWave() {
    if (!ctx) return;
    var w = els.bar.clientWidth, h = els.bar.clientHeight;
    if (!w || !h) return;
    var dpr = window.devicePixelRatio || 1;
    if (els.wave.width !== Math.round(w * dpr) || els.wave.height !== Math.round(h * dpr)) {
      els.wave.width = Math.round(w * dpr); els.wave.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    var unit = 4, barW = 3;                         // 3px bar + 1px gap
    var nbars = Math.max(1, Math.floor(w / unit));
    var dur = isFinite(audio.duration) && audio.duration ? audio.duration : 0;
    var cur = audio.currentTime || 0;
    for (var i = 0; i < nbars; i++) {
      var frac = (i + 0.5) / nbars;
      var amp = 0.62;
      if (peaks) amp = peaks[Math.min(peaks.length - 1, Math.floor(frac * peaks.length))];
      var bh = Math.max(2, amp * (h - 2));
      var t = dur ? frac * dur : 0;
      var z = dur ? zoneAt(t) : null;
      ctx.fillStyle = hexToRgba(z ? z.color : '#9CA3AF', dur && t <= cur ? 0.95 : 0.30);
      roundRect(ctx, i * unit, (h - bh) / 2, barW, bh, 1.2);
    }
  }
  function updatePlayhead() {
    if (!els.playhead) return;
    var dur = isFinite(audio.duration) && audio.duration ? audio.duration : 0;
    els.playhead.style.left = (dur ? (audio.currentTime / dur) * 100 : 0) + '%';
  }
  function render() { drawWave(); updatePlayhead(); updateMini(); }

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer); resizeTimer = setTimeout(render, 120);
  });
  if (els.expand) els.expand.addEventListener('click', function () { setTimeout(render, 0); });

  /* ---- hover tooltip: time · topic -------------------------------------- */

  function showTip(clientX) {
    if (!tip || !audio.duration) return;
    var rect = els.bar.getBoundingClientRect();
    var ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    var t = ratio * audio.duration, z = zoneAt(t);
    tip.innerHTML = '<span class="ap-tip-time">' + fmt(t) + '</span>' +
                    (z ? ' · ' + escapeHtml(z.title) : '');
    tip.style.setProperty('--ap-c', z ? z.color : 'var(--primary)');
    tip.style.left = (ratio * 100) + '%';
    tip.style.transform = ratio < 0.15 ? 'translateX(-14px)'
                        : ratio > 0.85 ? 'translateX(calc(-100% + 14px))' : 'translateX(-50%)';
    tip.hidden = false;
  }
  els.bar.addEventListener('pointermove', function (e) { if (!dragging) showTip(e.clientX); });
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---- current-chapter readout ------------------------------------------ */

  var curZone = null;
  function updateNow(t) {
    var z = zoneAt(t);
    if (z === curZone) return;
    if (curZone && curZone.el) curZone.el.classList.remove('is-current');
    curZone = z;
    if (z) {
      if (z.el) z.el.classList.add('is-current');
      if (els.now) { els.now.hidden = false; els.now.textContent = 'Сейчас: ' + z.title; }
    } else if (els.now) { els.now.hidden = true; }
    updateMini();
  }

  /* ---- resume + deep links ---------------------------------------------- */

  var RKEY = 'ap:' + slug, saveTick = 0;
  function savePosition() {
    // timeupdate fires ~4×/s; persist roughly every 5s to limit writes.
    if (audio.currentTime > 15 && audio.duration && audio.currentTime < audio.duration - 15) {
      if ((++saveTick) % 20 === 0) { try { localStorage.setItem(RKEY, Math.floor(audio.currentTime)); } catch (e) {} }
    }
  }
  function clearPosition() { try { localStorage.removeItem(RKEY); } catch (e) {} }
  function deepLinkTime() {
    try {
      var p = new URLSearchParams(location.search).get('t');
      if (p == null) return null;
      var s = parseTime(p);
      return isFinite(s) && s > 0 ? s : null;
    } catch (e) { return null; }
  }
  function restorePosition() {
    var dl = deepLinkTime();
    if (dl != null) {
      seekTo(dl, false);
      root.scrollIntoView({ behavior: 'smooth', block: 'start' });
      track('audio_deeplink', { event: slug, at: Math.round(dl) });
      return;
    }
    if (!els.resume) return;
    try {
      var v = parseInt(localStorage.getItem(RKEY), 10);
      if (v > 15 && audio.duration && v < audio.duration - 15) {
        els.resume.hidden = false;
        els.resume.textContent = '▶ Продолжить с ' + fmt(v);
        els.resume.addEventListener('click', function () {
          seekTo(v, true); els.resume.hidden = true;
          track('audio_resume', { event: slug, at: v });
        });
      }
    } catch (e) {}
  }

  /* ---- transcript ------------------------------------------------------- */

  var segments = [], loaded = false, activeIdx = -1;
  function ensureTranscript() {
    if (loaded) return;
    loaded = true;
    var src = root.getAttribute('data-transcript-src');
    if (!src) return;
    fetch(src).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(renderTranscript)
      .catch(function (err) { loaded = false; console.warn('[audio-player] transcript load failed:', err); });
  }
  var LINK_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>';
  function renderTranscript(data) {
    var segs = (data && data.segments) || [];
    if (!segs.length) return;
    if (!isFinite(audio.duration) && data.duration) els.dur.textContent = fmt(data.duration);
    var frag = document.createDocumentFragment();
    segments = segs.map(function (s) {
      var li = document.createElement('li');
      li.className = 'ap-line';
      var t = parseTime(s.t);
      var time = document.createElement('button');
      time.type = 'button'; time.className = 'ap-line-time'; time.textContent = fmt(t);
      time.addEventListener('click', function () { seekTo(t, true); });
      var span = document.createElement('span');
      span.className = 'ap-line-text';
      span.textContent = (s.speaker ? s.speaker + ': ' : '') + s.text;
      var link = document.createElement('button');
      link.type = 'button'; link.className = 'ap-line-link'; link.innerHTML = LINK_SVG;
      link.title = 'Ссылка на этот момент'; link.setAttribute('aria-label', 'Скопировать ссылку на этот момент');
      link.addEventListener('click', function (e) { e.stopPropagation(); copyLink(t, link); });
      li.appendChild(time); li.appendChild(span); li.appendChild(link);
      frag.appendChild(li);
      return { t: t, text: (s.text || '').toLowerCase(), el: li };
    }).sort(function (a, b) { return a.t - b.t; });
    els.lines.appendChild(frag);
    if (els.loading) els.loading.hidden = true;
    if (els.search) els.search.addEventListener('input', onSearch);
    highlight(audio.currentTime);
  }
  function copyLink(t, btn) {
    var url = location.origin + location.pathname + '?t=' + Math.floor(t);
    var done = function () { btn.classList.add('is-copied'); setTimeout(function () { btn.classList.remove('is-copied'); }, 1200); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, done);
    else { try { var ta = document.createElement('textarea'); ta.value = url; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); done(); } catch (e) {} }
    track('audio_share_line', { event: slug, at: Math.floor(t) });
  }
  function indexAt(time) {
    var lo = 0, hi = segments.length - 1, res = -1;
    while (lo <= hi) { var mid = (lo + hi) >> 1; if (segments[mid].t <= time) { res = mid; lo = mid + 1; } else hi = mid - 1; }
    return res;
  }
  function highlight(time) {
    if (!segments.length) return;
    var idx = indexAt(time);
    if (idx === activeIdx) return;
    if (segments[activeIdx]) segments[activeIdx].el.classList.remove('is-active');
    activeIdx = idx;
    var seg = segments[idx];
    if (!seg) return;
    seg.el.classList.add('is-active');
    if (!audio.paused) {
      var box = els.lines, top = seg.el.offsetTop - box.offsetTop;
      if (top < box.scrollTop || top > box.scrollTop + box.clientHeight - seg.el.offsetHeight) {
        box.scrollTop = top - box.clientHeight / 2;
      }
    }
  }
  var searchTracked = false;
  function onSearch() {
    var q = els.search.value.trim().toLowerCase();
    if (q && !searchTracked) { searchTracked = true; track('audio_search', { event: slug }); }
    var shown = 0;
    segments.forEach(function (seg) {
      var match = !q || seg.text.indexOf(q) !== -1;
      seg.el.hidden = !match; if (match) shown++;
    });
    if (els.empty) els.empty.hidden = shown !== 0;
  }

  /* ---- progressive disclosure ------------------------------------------- */

  if (els.expand) {
    var hasChapters = !!els.chapters;
    var sequence = hasChapters ? [0, 1, 2] : [0, 2];
    function labelFor(nextLevel) {
      if (nextLevel === 0) return 'Свернуть';
      if (nextLevel === 1) return 'Подтемы';
      return 'Транскрипт';
    }
    function setLevel(level) {
      root.setAttribute('data-ap-level', level);
      els.expand.setAttribute('aria-expanded', level > 0 ? 'true' : 'false');
      var nextLevel = sequence[(sequence.indexOf(level) + 1) % sequence.length];
      if (els.expandLabel) els.expandLabel.textContent = labelFor(nextLevel);
      if (level >= 2) ensureTranscript();
    }
    els.expand.addEventListener('click', function () {
      var cur = parseInt(root.getAttribute('data-ap-level'), 10) || 0;
      var next = sequence[(sequence.indexOf(cur) + 1) % sequence.length];
      setLevel(next);
      if (next > 0) track('audio_expand', { event: slug, view: next === 2 ? 'transcript' : 'topics' });
    });
  }

  /* ---- sticky mini-player ----------------------------------------------- */

  var mini = null;
  function buildMini() {
    mini = document.createElement('div');
    mini.className = 'ap-mini';
    mini.innerHTML =
      '<button type="button" class="ap-mini-play" aria-label="Слушать">' +
        '<svg class="ap-ic-play" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>' +
        '<svg class="ap-ic-pause" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>' +
      '</button>' +
      '<button type="button" class="ap-mini-info" aria-label="К плееру">' +
        '<span class="ap-mini-now">Слушать встречу</span>' +
        '<span class="ap-mini-bar"><span class="ap-mini-fill"></span></span>' +
      '</button>';
    document.body.appendChild(mini);
    mini.querySelector('.ap-mini-play').addEventListener('click', togglePlay);
    mini.querySelector('.ap-mini-info').addEventListener('click', function () {
      root.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    if (!audio.paused) mini.classList.add('is-playing');
  }
  // Mirror the colour-coded topic zones onto the mini progress bar.
  function buildMiniZones(duration) {
    if (!mini || !zones.length || !duration) return;
    var bar = mini.querySelector('.ap-mini-bar');
    if (!bar || bar.querySelector('.ap-mini-zone')) return;
    var frag = document.createDocumentFragment();
    zones.forEach(function (z) {
      var seg = document.createElement('span');
      seg.className = 'ap-mini-zone';
      seg.style.left = (z.start / duration * 100) + '%';
      seg.style.width = ((z.end - z.start) / duration * 100) + '%';
      seg.style.setProperty('--ap-c', z.color);
      frag.appendChild(seg);
    });
    bar.insertBefore(frag, bar.firstChild);
  }
  function updateMini() {
    if (!mini || !mini.classList.contains('is-visible')) return;
    var dur = isFinite(audio.duration) && audio.duration ? audio.duration : 0;
    var fill = mini.querySelector('.ap-mini-fill');
    if (fill) fill.style.width = (dur ? (audio.currentTime / dur) * 100 : 0) + '%';
    var now = mini.querySelector('.ap-mini-now');
    if (now) now.textContent = curZone ? curZone.title : 'Слушать встречу';
  }
  if ('IntersectionObserver' in window) {
    buildMini();
    var io = new IntersectionObserver(function (entries) {
      var visible = entries[0] && entries[0].isIntersecting;
      // Show the mini-bar only once the player has been used and scrolled away.
      mini.classList.toggle('is-visible', !visible && playedOnce);
      updateMini();
    }, { threshold: 0 });
    io.observe(els.bar);
  }

  // First paint (covers cached audio whose metadata is already available).
  if (audio.readyState >= 1 && audio.duration) { buildTimeline(audio.duration); render(); restorePosition(); }
})();
