/*!
 * Paste – форма на /paste/. POST /api/pastes, в ответ короткая ссылка.
 * Ничего не делает на страницах без [data-paste-page].
 */
(function (w, d) {
  'use strict';

  var MIN = 10, MAX = 64000;

  function init() {
    var form = d.querySelector('[data-paste-page]');
    if (!form) return;

    var textarea = form.querySelector('[data-paste-textarea]');
    var counter = d.getElementById('paste-counter');
    var status = d.getElementById('paste-status');
    var submit = form.querySelector('[data-paste-submit]');
    var honeypot = d.getElementById('paste-website');

    var done = d.querySelector('[data-paste-result]');
    var urlInput = done.querySelector('[data-paste-url]');
    var copyBtn = done.querySelector('[data-paste-copy]');
    var openLink = done.querySelector('[data-paste-open]');
    var rawLink = done.querySelector('[data-paste-raw]');
    var againBtn = done.querySelector('[data-paste-again]');

    function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }

    function setStatus(text, isError) {
      status.textContent = text || '';
      status.className = 'paste-status' + (isError ? ' is-err' : '');
    }

    function count() {
      var len = textarea.value.length;
      counter.textContent = fmt(len) + ' / ' + fmt(MAX);
      counter.classList.toggle('is-over', len > MAX);
    }

    textarea.addEventListener('input', count);
    count();

    // Ctrl/Cmd+Enter отправляет – привычка любого, кто живет в редакторе.
    textarea.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); form.requestSubmit(); }
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var content = textarea.value.trim();
      if (content.length < MIN) return setStatus('Минимум ' + MIN + ' символов.', true);
      if (content.length > MAX) return setStatus('Максимум ' + fmt(MAX) + ' символов.', true);
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
          setStatus((r.body && r.body.detail) || 'Не получилось создать ссылку. Попробуйте позже.', true);
          return;
        }
        setStatus('');
        urlInput.value = r.body.url;
        openLink.href = r.body.url;
        rawLink.href = r.body.raw_url;
        form.hidden = true;
        done.hidden = false;
        urlInput.focus();
        urlInput.select();
      }).catch(function () {
        submit.disabled = false;
        setStatus('Сетевая ошибка. Попробуйте снова.', true);
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
      setStatus('');
      textarea.focus();
    });
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})(window, document);
