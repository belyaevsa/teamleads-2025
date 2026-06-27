/* Ambient terminal dock: corner handle ⇄ expanding drawer.
   Open/closed + height persist in localStorage; default-open on first visit.
   Toggle: handle, the drawer ✕, the backtick (`) hotkey (open), or Esc (close inside). */
(function () {
  'use strict';
  var dock = document.querySelector('[data-term-dock]');
  if (!dock) return;
  dock.hidden = false;

  var OPEN_KEY = 'tnk_shell_dock_open', H_KEY = 'tnk_shell_dock_h';

  function firstVisitOpen() {
    try { var v = localStorage.getItem(OPEN_KEY); return v === null ? true : v === '1'; }
    catch (e) { return true; }
  }
  function setOpen(open) {
    dock.classList.toggle('is-open', open);
    var t = dock.querySelectorAll('[data-term-dock-toggle]');
    for (var i = 0; i < t.length; i++) t[i].setAttribute('aria-expanded', open ? 'true' : 'false');
    try { localStorage.setItem(OPEN_KEY, open ? '1' : '0'); } catch (e) {}
    if (open) { var inp = dock.querySelector('[data-term-input]'); if (inp) setTimeout(function () { inp.focus(); }, 60); }
  }

  // restore a previously dragged height
  try { var h = parseInt(localStorage.getItem(H_KEY), 10); if (h > 220 && h < window.innerHeight) dock.style.setProperty('--dock-h', h + 'px'); } catch (e) {}

  setOpen(firstVisitOpen());

  dock.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-term-dock-toggle]');
    if (t) { e.preventDefault(); setOpen(!dock.classList.contains('is-open')); }
  });

  document.addEventListener('keydown', function (e) {
    var a = document.activeElement, inDock = a && dock.contains(a);
    if (e.key === 'Escape' && inDock && dock.classList.contains('is-open')) { setOpen(false); return; }
    if (e.key === '`' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      var tag = a && a.tagName, typing = tag === 'INPUT' || tag === 'TEXTAREA' || (a && a.isContentEditable);
      if (typing) return;                 // let people type a backtick (incl. in the shell input)
      e.preventDefault(); setOpen(!dock.classList.contains('is-open'));
    }
  });

  // drag the top grip to resize the drawer height
  var grip = dock.querySelector('[data-term-dock-grip]');
  if (grip) {
    var dragging = false;
    grip.addEventListener('pointerdown', function (e) { dragging = true; grip.setPointerCapture(e.pointerId); e.preventDefault(); });
    grip.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var hgt = Math.min(window.innerHeight - 56, Math.max(240, window.innerHeight - e.clientY));
      dock.style.setProperty('--dock-h', hgt + 'px');
    });
    grip.addEventListener('pointerup', function () {
      if (!dragging) return; dragging = false;
      try { localStorage.setItem(H_KEY, parseInt(getComputedStyle(dock).getPropertyValue('--dock-h'), 10)); } catch (e) {}
    });
  }
})();
