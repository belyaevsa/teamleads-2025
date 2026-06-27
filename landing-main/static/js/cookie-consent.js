/*!
 * Teamleads cookie consent – a Codex/Claude-styled terminal window.
 * One-way consent: the only action is "accept". There is no reject button –
 * a visitor who disagrees simply closes the tab. Yandex.Metrika is loaded
 * ONLY after consent (window.teamleadsLoadMetrika, defined in baseof.html).
 * Consent is remembered in localStorage so the window shows once.
 */
(function (w, d) {
  'use strict';

  var KEY = 'tl_cookie_consent';
  var root = null;

  function consented() {
    try { return w.localStorage.getItem(KEY) === '1'; } catch (e) { return false; }
  }

  function enableMetrika() {
    if (typeof w.teamleadsLoadMetrika === 'function') w.teamleadsLoadMetrika();
  }

  function accept() {
    try { w.localStorage.setItem(KEY, '1'); } catch (e) {}
    enableMetrika();
    if (root && root.parentNode) {
      root.classList.add('cc-out-anim');
      var node = root;
      setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 240);
      root = null;
    }
  }

  function build() {
    if (root || consented()) return;
    root = d.createElement('div');
    root.className = 'cc-win';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-live', 'polite');
    root.setAttribute('aria-label', 'Согласие на использование cookie');
    root.innerHTML =
      '<div class="cc-bar">' +
        '<span class="cc-dot red"></span>' +
        '<span class="cc-dot yellow"></span>' +
        '<span class="cc-dot green"></span>' +
        '<span class="cc-title">tl@teamleads: ~/privacy</span>' +
      '</div>' +
      '<div class="cc-body">' +
        '<p class="cc-line"><span class="cc-prompt">$</span><span class="cc-cmd">cat cookies.txt</span></p>' +
        '<p class="cc-out">Мы храним cookie и используем <b>Яндекс.Метрику</b>, чтобы понимать, ' +
          'как вы пользуетесь сайтом, и делать его лучше.</p>' +
        '<p class="cc-out cc-dim">Продолжая пользоваться сайтом, вы даёте согласие на обработку ' +
          'данных. Не согласны – просто закройте вкладку.</p>' +
        '<p class="cc-line"><span class="cc-prompt">$</span><span class="cc-cmd cc-blink">_</span></p>' +
        '<button class="cc-accept" type="button" data-cc-accept>' +
          '<span class="cc-accent">▸</span> Принять и продолжить' +
        '</button>' +
      '</div>';
    d.body.appendChild(root);
    root.querySelector('[data-cc-accept]').addEventListener('click', accept);
  }

  if (consented()) {
    enableMetrika();
    return;
  }

  if (d.readyState === 'loading') {
    d.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})(window, document);
