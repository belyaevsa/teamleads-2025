/*!
 * nano: a modal editor for the user filesystem. Like the simulator, it OWNS the
 * keyboard while open – the prompt's keydown is gated on isActive(). ^O writes back
 * to localStorage, ^X saves+exits, Esc discards. The module installs its own
 * keydown/click handlers on the editor panel and returns the `nano` command.
 */
export function makeEditor(S) {
  var edPanel = S.edPanel, edArea = S.edArea, edName = S.edName, edMeta = S.edMeta, input = S.input, print = S.print;
  var ufs = S.ufs, ufsNow = S.ufsNow, ufsUser = S.ufsUser, ufsSave = S.ufsSave;
  var parentOf = S.parentOf, isDir = S.isDir, ensureDir = S.ensureDir, normPath = S.normPath, bakedAt = S.bakedAt;

  var editorSt = null;   // { path, dirty }

  function nanoStart(path) {
    if (!edPanel || !edArea) { print('nano: редактор недоступен на этой странице. Откройте /shell/.', 'err'); return; }
    var existing = ufs.nodes[path];
    if (existing && existing.type === 'dir') { print('nano: /' + path + ' – это каталог', 'err'); return; }
    var content = existing ? (existing.content || '') : '';
    // seed from a baked page? no – nano edits the user FS only; baked stays read-only.
    editorSt = { path: path, dirty: false };
    edName.textContent = '  GNU nano · /' + path + (existing ? '' : '  (новый)');
    edArea.value = content;
    edPanel.hidden = false;
    nanoMeta();
    try { edArea.focus({ preventScroll: true }); } catch (e) { edArea.focus(); }
    edArea.setSelectionRange(content.length, content.length);
  }
  function nanoMeta() {
    if (!editorSt || !edMeta) return;
    var v = edArea.value;
    edMeta.textContent = (editorSt.dirty ? '● ' : '') + v.length + ' Б · ' + (v ? v.split('\n').length : 0) + ' строк  ^O Сохранить · ^U Ссылка · ^X Выход';
  }

  // ── share: буфер (или сохраненный файл) уезжает в pastebin, обратно короткая ссылка ──
  var MIN_PASTE = 10, MAX_PASTE = 64000;

  function share(text, label) {
    text = (text || '').trim();
    if (text.length < MIN_PASTE) { print('share: слишком мало текста – нужно хотя бы ' + MIN_PASTE + ' символов.', 'err'); return; }
    if (text.length > MAX_PASTE) { print('share: слишком много – максимум ' + MAX_PASTE + ' символов.', 'err'); return; }
    if (!window.fetch) { print('share: браузер не умеет fetch.', 'err'); return; }

    var loading = print('share: выкладываю ' + label + '…', 'dim');
    function drop() { if (loading && loading.parentNode) loading.parentNode.removeChild(loading); }

    window.fetch('/api/pastes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text, source: 'shell', website: '' })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (b) { return { ok: r.ok, body: b }; });
    }).then(function (r) {
      drop();
      if (!r.ok || !r.body.url) { print('share: ' + (r.body && r.body.detail || 'не получилось создать ссылку'), 'err'); return; }
      print('share: ' + label + ' → ' + r.body.url, 'ok');
      print('       живет 30 дней · raw: ' + r.body.raw_url, 'dim');
    }).catch(function () { drop(); print('share: сеть недоступна.', 'err'); });
  }
  function nanoSave() {
    if (!editorSt) return;
    var now = ufsNow(), node = ufs.nodes[editorSt.path];
    if (node && node.type === 'file') { node.content = edArea.value; node.mtime = now; }
    else {
      var parent = parentOf(editorSt.path);
      if (parent !== '' && !isDir(parent)) { /* create missing parents so save never fails */ ensureDir(parent, ufsUser(), now); }
      ufs.nodes[editorSt.path] = { type: 'file', content: edArea.value, ctime: now, mtime: now, author: ufsUser() };
      delete ufs.tombs[editorSt.path];
    }
    ufsSave();
    editorSt.dirty = false; nanoMeta();
  }
  function nanoExit() {
    var path = editorSt && editorSt.path, wasDirty = editorSt && editorSt.dirty;
    editorSt = null;
    if (edPanel) { edPanel.hidden = true; }
    if (edArea) edArea.value = '';
    input.focus();
    print('nano: ' + (wasDirty ? 'выход без сохранения · ' : '') + '/' + path + ' закрыт. cat ' + (path || '') + ' – посмотреть.', 'dim');
  }

  // ── keyboard + buttons: ^O save, ^X save+exit, Esc discard+exit, Tab inserts spaces ──
  if (edArea) {
    edArea.addEventListener('input', function () { if (editorSt) { editorSt.dirty = true; nanoMeta(); } });
    edArea.addEventListener('keydown', function (e) {
      if (!editorSt) return;
      var k = (e.key || '').toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'o') { e.preventDefault(); nanoSave(); print('nano: сохранено /' + editorSt.path, 'ok'); return; }
      if ((e.ctrlKey || e.metaKey) && k === 'u') { e.preventDefault(); nanoSave(); share(edArea.value, '/' + editorSt.path); return; }
      if ((e.ctrlKey || e.metaKey) && k === 'x') { e.preventDefault(); if (editorSt.dirty) nanoSave(); nanoExit(); return; }
      if (k === 'escape') { e.preventDefault(); nanoExit(); return; }
      if (e.key === 'Tab') {
        e.preventDefault();
        var s = edArea.selectionStart, en = edArea.selectionEnd;
        edArea.value = edArea.value.slice(0, s) + '  ' + edArea.value.slice(en);
        edArea.selectionStart = edArea.selectionEnd = s + 2;
        editorSt.dirty = true; nanoMeta();
      }
    });
  }
  if (edPanel) edPanel.addEventListener('click', function (e) {
    var k = e.target && e.target.getAttribute ? e.target.getAttribute('data-ek') : null;
    if (!k || !editorSt) return;
    if (k === 'save') { nanoSave(); print('nano: сохранено /' + editorSt.path, 'ok'); try { edArea.focus(); } catch (_) {} }
    else if (k === 'share') { nanoSave(); share(edArea.value, '/' + editorSt.path); }
    else if (k === 'exit') { if (editorSt.dirty) nanoSave(); nanoExit(); }
  });

  // The `nano <file>` command: refuses baked pages (read-only), else opens the editor.
  // `--share` skips the editor and puts the file straight into the pastebin – the
  // editor is modal, so once it is open there is no prompt left to type a command at.
  function nano(a) {
    a = a || [];
    var wantsShare = a.some(function (x) { return x === '--share' || x === '-s'; });
    var arg = a.filter(function (x) { return x && x.charAt(0) !== '-'; })[0];

    if (wantsShare) {
      if (!arg) { print('nano --share <файл> – выложить сохраненный файл. Из редактора то же самое делает ^U.', 'dim'); return; }
      var sp = normPath(arg);
      var node = sp && ufs.nodes[sp];
      if (!node || node.type !== 'file') { print('nano --share: /' + sp + ' – нет такого файла. ls – посмотреть.', 'err'); return; }
      share(node.content, '/' + sp);
      return;
    }

    if (!arg) { print('nano <файл> – создать или редактировать файл. Напр.: nano notes.md · nano --share <файл> – выложить ссылкой', 'dim'); return; }
    var path = normPath(arg);
    if (path === '') { print('nano: неверный путь', 'err'); return; }
    var b = bakedAt(path);
    if (b && b.type === 'file' && !ufs.nodes[path]) { print('nano: /' + path + ' – материал сайта (только чтение). cp ' + arg + ' <имя> сделает редактируемую копию.', 'err'); return; }
    nanoStart(path);
  }

  return { nano: nano, nanoStart: nanoStart, isActive: function () { return !!editorSt; } };
}
