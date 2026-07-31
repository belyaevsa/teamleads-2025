/*!
 * Paste – форма на /paste/. POST /api/pastes, в ответ короткая ссылка.
 * Хром страницы повторяет /p/<id>, поэтому и состояния тут те же: черновик → готово.
 * Ничего не делает на страницах без [data-paste-page].
 */
(function (w, d) {
  'use strict';

  var MIN = 10, MAX = 64000;

  function init() {
    var form = d.querySelector('[data-paste-page]');
    if (!form) return;

    var textarea = form.querySelector('[data-paste-textarea]');
    var counter = form.querySelector('[data-paste-counter]');
    var status = form.querySelector('[data-paste-status]');
    var submit = form.querySelector('[data-paste-submit]');
    var meta = form.querySelector('[data-paste-meta]');
    var honeypot = d.getElementById('paste-website');

    var done = d.querySelector('[data-paste-result]');
    var shortId = done.querySelector('[data-paste-shortid]');
    var urlInput = done.querySelector('[data-paste-url]');
    var copyBtn = done.querySelector('[data-paste-copy]');
    var openLink = done.querySelector('[data-paste-open]');
    var rawLink = done.querySelector('[data-paste-raw]');
    var againBtn = done.querySelector('[data-paste-again]');

    var HINT = '⌘/Ctrl+Enter – создать';

    function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }

    function setStatus(text, kind) {
      status.textContent = text || '';
      status.className = 'paste-status' + (kind ? ' is-' + kind : '');
    }

    function count() {
      var len = textarea.value.length;
      counter.textContent = fmt(len) + ' / ' + fmt(MAX);
      counter.classList.toggle('is-over', len > MAX);
      // Шапка живет как в редакторе: строки видно до отправки.
      meta.textContent = len ? (textarea.value.split('\n').length + ' строк') : 'черновик';
    }

    textarea.addEventListener('input', count);
    count();

    // Ctrl/Cmd+Enter отправляет – привычка любого, кто живет в редакторе.
    textarea.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); form.requestSubmit(); }
      if (e.key !== 'Tab') return;
      // Tab внутри кода – это отступ, а не переход к следующей кнопке.
      e.preventDefault();
      var s = textarea.selectionStart, en = textarea.selectionEnd;
      textarea.value = textarea.value.slice(0, s) + '  ' + textarea.value.slice(en);
      textarea.selectionStart = textarea.selectionEnd = s + 2;
      count();
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var content = textarea.value.trim();
      if (content.length < MIN) return setStatus('Минимум ' + MIN + ' символов.', 'err');
      if (content.length > MAX) return setStatus('Максимум ' + fmt(MAX) + ' символов.', 'err');
      if (honeypot.value !== '') return;

      submit.disabled = true;
      setStatus('Создаем ссылку…');

      w.fetch('/api/pastes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content, source: 'web', website: honeypot.value })
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (body) { return { ok: r.ok, body: body }; });
      }).then(function (r) {
        submit.disabled = false;
        if (!r.ok || !r.body.url) {
          setStatus((r.body && r.body.detail) || 'Не получилось создать ссылку. Попробуйте позже.', 'err');
          return;
        }
        setStatus(HINT);
        shortId.textContent = 'p/' + (r.body.public_id || '');
        urlInput.value = r.body.url;
        openLink.href = r.body.url;
        rawLink.href = r.body.raw_url;
        form.hidden = true;
        done.hidden = false;
        urlInput.focus();
        urlInput.select();
      }).catch(function () {
        submit.disabled = false;
        setStatus('Сетевая ошибка. Попробуйте снова.', 'err');
      });
    });

    copyBtn.addEventListener('click', function () {
      var label = copyBtn.textContent;
      function ok() { copyBtn.textContent = 'Скопировано'; setTimeout(function () { copyBtn.textContent = label; }, 1500); }
      // clipboard API живет только на https – на http падаем в select().
      if (w.navigator.clipboard && w.navigator.clipboard.writeText) {
        w.navigator.clipboard.writeText(urlInput.value).then(ok, function () { urlInput.select(); });
      } else {
        urlInput.select();
        try { d.execCommand('copy'); ok(); } catch (_) {}
      }
    });

    againBtn.addEventListener('click', function () {
      done.hidden = true;
      form.hidden = false;
      textarea.value = '';
      count();
      setStatus(HINT);
      textarea.focus();
    });
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})(window, document);
