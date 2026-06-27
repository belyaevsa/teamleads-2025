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
    edMeta.textContent = (editorSt.dirty ? '● ' : '') + v.length + ' Б · ' + (v ? v.split('\n').length : 0) + ' строк  ^O Сохранить · ^X Выход';
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
    else if (k === 'exit') { if (editorSt.dirty) nanoSave(); nanoExit(); }
  });

  // The `nano <file>` command: refuses baked pages (read-only), else opens the editor.
  function nano(a) {
    var arg = (a || []).filter(function (x) { return x && x.charAt(0) !== '-'; })[0];
    if (!arg) { print('nano <файл> – создать или редактировать файл. Напр.: nano notes.md', 'dim'); return; }
    var path = normPath(arg);
    if (path === '') { print('nano: неверный путь', 'err'); return; }
    var b = bakedAt(path);
    if (b && b.type === 'file' && !ufs.nodes[path]) { print('nano: /' + path + ' – материал сайта (только чтение). cp ' + arg + ' <имя> сделает редактируемую копию.', 'err'); return; }
    nanoStart(path);
  }

  return { nano: nano, nanoStart: nanoStart, isActive: function () { return !!editorSt; } };
}
