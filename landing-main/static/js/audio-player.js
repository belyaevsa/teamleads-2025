/* Audio player + synced transcript for event pages.
   Progressive enhancement: keyed off [data-audio-player]; no-op if absent.
   Transcript schema (/audio/<base>.transcript.json):
     { "duration": <seconds>, "segments": [ { "t": <sec>, "text": "…", "speaker"?: "…" } ] } */
(function () {
  'use strict';

  var root = document.querySelector('[data-audio-player]');
  if (!root) return;

  var audio = root.querySelector('[data-ap-audio]');
  if (!audio) return;

  var RATES = [1, 1.25, 1.5, 2];
  var rateIdx = 0;

  var els = {
    play: root.querySelector('[data-ap-play]'),
    icPlay: root.querySelector('.ap-ic-play'),
    icPause: root.querySelector('.ap-ic-pause'),
    bar: root.querySelector('[data-ap-bar]'),
    fill: root.querySelector('[data-ap-fill]'),
    buffer: root.querySelector('[data-ap-buffer]'),
    cur: root.querySelector('[data-ap-cur]'),
    dur: root.querySelector('[data-ap-dur]'),
    rate: root.querySelector('[data-ap-rate]'),
    transcript: root.querySelector('[data-ap-transcript]'),
    lines: root.querySelector('[data-ap-lines]'),
    search: root.querySelector('[data-ap-search]'),
    empty: root.querySelector('[data-ap-empty]'),
    loading: root.querySelector('[data-ap-loading]'),
    chapters: root.querySelector('[data-ap-chapters]'),
    expand: root.querySelector('[data-ap-expand]'),
    expandLabel: root.querySelector('[data-ap-expand-label]')
  };

  /* ---- helpers ---------------------------------------------------------- */

  function fmt(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    sec = Math.floor(sec);
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    var mm = h ? (m < 10 ? '0' + m : m) : m;
    var ss = s < 10 ? '0' + s : s;
    return (h ? h + ':' : '') + mm + ':' + ss;
  }

  // Accepts a number (seconds) or "M:SS" / "H:MM:SS" string.
  function parseTime(v) {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    v = String(v).trim();
    if (/^\d+(\.\d+)?$/.test(v)) return parseFloat(v);
    var parts = v.split(':').map(Number);
    if (parts.some(isNaN)) return 0;
    return parts.reduce(function (acc, n) { return acc * 60 + n; }, 0);
  }

  // Yandex.Metrika goal (same counter the rest of the site uses), guarded so the
  // player still works if Metrika is blocked or absent.
  var METRIKA_ID = 106055675;
  function track(goal, params) {
    try {
      if (typeof window.ym === 'function') window.ym(METRIKA_ID, 'reachGoal', goal, params);
    } catch (e) { /* never let analytics break playback */ }
  }

  /* ---- transport -------------------------------------------------------- */

  // play() returns a promise that rejects with AbortError when a seek (setting
  // currentTime) or a pause interrupts it before it resolves. That's benign here –
  // swallow it so it doesn't surface as an "uncaught (in promise)" error.
  function safePlay() {
    var p = audio.play();
    if (p && typeof p.catch === 'function') p.catch(function () {});
  }

  function togglePlay() {
    if (audio.paused) safePlay(); else audio.pause();
  }

  function seekTo(sec, andPlay) {
    if (isFinite(audio.duration)) sec = Math.min(sec, audio.duration - 0.05);
    audio.currentTime = Math.max(0, sec);
    if (andPlay && audio.paused) safePlay();
  }

  els.play.addEventListener('click', togglePlay);

  var slug = (location.pathname.split('/').filter(Boolean).pop()) || 'event';
  var playedOnce = false;
  audio.addEventListener('play', function () {
    els.icPlay.hidden = true;
    els.icPause.hidden = false;
    els.play.setAttribute('aria-label', 'Пауза');
    if (!playedOnce) { playedOnce = true; track('audio_play', { event: slug }); }
  });
  audio.addEventListener('pause', function () {
    els.icPlay.hidden = false;
    els.icPause.hidden = true;
    els.play.setAttribute('aria-label', 'Слушать');
  });

  audio.addEventListener('loadedmetadata', function () {
    els.dur.textContent = fmt(audio.duration);
    els.bar.setAttribute('aria-valuemax', Math.floor(audio.duration || 0));
    buildTimeline(audio.duration);
  });

  audio.addEventListener('timeupdate', function () {
    var pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
    els.fill.style.width = pct + '%';
    els.cur.textContent = fmt(audio.currentTime);
    els.bar.setAttribute('aria-valuenow', Math.floor(audio.currentTime));
    highlight(audio.currentTime);
  });

  audio.addEventListener('progress', function () {
    if (!audio.buffered.length || !audio.duration) return;
    var end = audio.buffered.end(audio.buffered.length - 1);
    els.buffer.style.width = (end / audio.duration) * 100 + '%';
  });

  // Scrub bar: click + drag.
  function barSeek(clientX) {
    var rect = els.bar.getBoundingClientRect();
    var ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    if (audio.duration) seekTo(ratio * audio.duration);
  }
  var dragging = false;
  els.bar.addEventListener('pointerdown', function (e) {
    dragging = true; els.bar.setPointerCapture(e.pointerId); barSeek(e.clientX);
  });
  els.bar.addEventListener('pointermove', function (e) { if (dragging) barSeek(e.clientX); });
  els.bar.addEventListener('pointerup', function () { dragging = false; });
  els.bar.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') { seekTo(audio.currentTime + 10); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { seekTo(audio.currentTime - 10); e.preventDefault(); }
    else if (e.key === ' ' || e.key === 'Enter') { togglePlay(); e.preventDefault(); }
  });

  els.rate.addEventListener('click', function () {
    rateIdx = (rateIdx + 1) % RATES.length;
    audio.playbackRate = RATES[rateIdx];
    els.rate.textContent = RATES[rateIdx] + '×';
  });

  /* ---- chapters + colour-coded timeline --------------------------------- */

  // One light colour per topic, reused for the chapter list accent and the
  // matching zone on the scrubber so the two read as the same thing.
  var PALETTE = ['#00AFCA', '#FEC50C', '#8B5CF6', '#F59E0B', '#10B981',
                 '#EF4444', '#EC4899', '#14B8A6'];

  // Chapters in editorial (DOM) order — each keeps its colour even if the audio
  // discusses topics out of order.
  var chapters = Array.prototype.slice.call(root.querySelectorAll('.ap-chapter'))
    .map(function (btn, i) {
      var c = PALETTE[i % PALETTE.length];
      btn.style.setProperty('--ap-c', c);
      var titleEl = btn.querySelector('.ap-chapter-title');
      return { start: parseTime(btn.getAttribute('data-ap-seek')), color: c,
               title: titleEl ? titleEl.textContent : '' };
    });

  // Seek triggers live both inside the player (chapters) and out in the page
  // body (per-topic "jump" links), so bind document-wide.
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

  // Paint one coloured zone per topic on the scrubber, spanning [start, nextStart]
  // in TIME order (chapters may be non-chronological). Built once we know duration.
  var timelineBuilt = false;
  var timelineZones = [];        // [{ start, end, title, color }] for the hover tooltip
  var tip = null;
  function buildTimeline(duration) {
    if (timelineBuilt || !duration || !isFinite(duration) || chapters.length < 2 || !els.bar) return;
    timelineBuilt = true;
    var ordered = chapters.slice().sort(function (a, b) { return a.start - b.start; });
    var zones = document.createElement('div');
    zones.className = 'ap-bar-zones';
    zones.setAttribute('aria-hidden', 'true');   // decorative; the bar handles seeking
    ordered.forEach(function (ch, i) {
      var end = (i + 1 < ordered.length) ? ordered[i + 1].start : duration;
      timelineZones.push({ start: ch.start, end: end, title: ch.title, color: ch.color });
      var seg = document.createElement('div');
      seg.className = 'ap-zone';
      seg.style.left = (ch.start / duration * 100) + '%';
      seg.style.width = ((end - ch.start) / duration * 100) + '%';
      seg.style.setProperty('--ap-c', ch.color);
      zones.appendChild(seg);
    });
    els.bar.insertBefore(zones, els.bar.firstChild);

    // Tooltip naming the topic under the cursor (works while scrubbing too).
    tip = document.createElement('div');
    tip.className = 'ap-bar-tip';
    tip.hidden = true;
    els.bar.appendChild(tip);
  }
  if (audio.readyState >= 1 && audio.duration) buildTimeline(audio.duration);

  function zoneAt(t) {
    for (var i = 0; i < timelineZones.length; i++) {
      if (t >= timelineZones[i].start && t < timelineZones[i].end) return timelineZones[i];
    }
    return null;
  }
  function showTip(clientX) {
    if (!tip || !audio.duration) return;
    var rect = els.bar.getBoundingClientRect();
    var ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    var z = zoneAt(ratio * audio.duration);
    if (!z) { tip.hidden = true; return; }
    tip.textContent = z.title;
    tip.style.setProperty('--ap-c', z.color);
    tip.style.left = (ratio * 100) + '%';
    // Flip alignment near the ends so the label isn't clipped by the shell.
    tip.style.transform = ratio < 0.15 ? 'translateX(-14px)'
                        : ratio > 0.85 ? 'translateX(calc(-100% + 14px))'
                        : 'translateX(-50%)';
    tip.hidden = false;
  }
  els.bar.addEventListener('pointermove', function (e) { showTip(e.clientX); });
  els.bar.addEventListener('pointerleave', function () { if (tip) tip.hidden = true; });

  /* ---- transcript ------------------------------------------------------- */

  var segments = [];   // [{ t, text, speaker, el }]
  var loaded = false;
  var activeIdx = -1;

  function ensureTranscript() {
    if (loaded) return;
    loaded = true;
    var src = root.getAttribute('data-transcript-src');
    if (!src) return;
    fetch(src).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(renderTranscript).catch(function (err) {
      loaded = false; // allow a retry on next play
      console.warn('[audio-player] transcript load failed:', err);
    });
  }

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
      time.type = 'button';
      time.className = 'ap-line-time';
      time.textContent = fmt(t);
      time.addEventListener('click', function () { seekTo(t, true); });
      var span = document.createElement('span');
      span.className = 'ap-line-text';
      span.textContent = (s.speaker ? s.speaker + ': ' : '') + s.text;
      li.appendChild(time);
      li.appendChild(span);
      frag.appendChild(li);
      return { t: t, text: (s.text || '').toLowerCase(), el: li };
    }).sort(function (a, b) { return a.t - b.t; });

    els.lines.appendChild(frag);
    if (els.loading) els.loading.hidden = true;
    if (els.search) els.search.addEventListener('input', onSearch);
    highlight(audio.currentTime);
  }

  // Last segment whose start <= time (binary search).
  function indexAt(time) {
    var lo = 0, hi = segments.length - 1, res = -1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (segments[mid].t <= time) { res = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
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
    // Keep the active line in view *within* the transcript box, not the page.
    if (!audio.paused) {
      var box = els.lines;
      var top = seg.el.offsetTop - box.offsetTop;
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
      seg.el.hidden = !match;
      if (match) shown++;
    });
    if (els.empty) els.empty.hidden = shown !== 0;
  }

  /* ---- progressive disclosure -----------------------------------------------
     Levels: 0 = audio only, 1 = + topics, 2 = + transcript. The expand button
     steps through the available tiers and wraps back to collapsed. With no
     chapters, level 1 is skipped (audio → transcript → collapsed). */
  if (els.expand) {
    var hasChapters = !!els.chapters;
    var sequence = hasChapters ? [0, 1, 2] : [0, 2];

    // Label describes what the NEXT click will do (reveal topics / transcript, or collapse).
    function labelFor(nextLevel) {
      if (nextLevel === 0) return 'Свернуть';
      if (nextLevel === 1) return 'Подтемы';
      return 'Транскрипт';                          // nextLevel === 2
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
})();
