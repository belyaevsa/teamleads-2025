# Teamleads Shell – developer guide

A tiny, dependency-free in-browser terminal that turns the site into a navigable
filesystem with a writable overlay, a git-as-content metaphor, a simulator, a
salary explorer, and an offline assistant. It mounts on every `[data-term]` node
(the `/shell/` page, the homepage embed, and the 404 page).

This document is the guide for working on the shell: the structure, the
principles, and step-by-step recipes (add a command, add a module, test).

---

## 1. Structure

Source lives in `assets/js/shell/` as ES modules and is bundled by **Hugo's
`js.Build` (esbuild)** into a single fingerprinted IIFE. There is no separate
build step or package.json – Hugo does it during `hugo`/`hugo server`.

```
assets/js/shell/
  main.js              entry + scaffolding: mount(), the `S` context, helper
                       bindings, input/keyboard wiring, boot sequence, aliases
  dom.js               el · print · link · pad · paginate · pageNav · go · fmtDate · fmtTs
  markdown.js          cat's markdown→DOM renderer (mdLine, mdTable, mdInline)
  fs.js                user filesystem engine + path resolution (the overlay)
  git.js               `git` subcommands (log/status/diff/blame/…) + easter eggs
  editor.js            `nano` modal editor (owns editorSt, installs its keyboard)
  sim.js               simulator + quiz + mini-arcade (owns simSt, its keyboard)
  tama.js              тимагочи: grow-a-developer game. Animated HUD buddy +
                       team metrics (trust/expertise/conflict/morale), persisted
                       in localStorage with real-time decay. Command-driven (NOT
                       a modal): team · 1on1 · mentor · cr · pair · delegate ·
                       retro · hire · fire · ship · standup
  man.js               MANPAGES data block + manSummary
  salary.js            live/offline salary data + the `salary` command
  commands-fs.js       ls cd open cat pwd tree find grep latest random
                       head tail wc stat mkdir touch rm rmdir mv cp
  commands-content.js  discuss toolkit voices companies company addreview tools
                       friends claude codex join telegram contribute submit
                       showcase whoami principles fun
  commands-meta.js     help man whatis apropos which alias theme share feedback
                       neofetch date echo history clear fortune vim top sudo
                       coffee 42 home exit
  README.md            this file
```

How it loads (`layouts/partials/shell.html`):

```go-html-template
{{ $shell := resources.Get "js/shell/main.js"
   | js.Build (dict "minify" hugo.IsProduction "target" "es2017" "format" "iife") | fingerprint }}
<script src="{{ $shell.RelPermalink }}" defer></script>
```

`hugo server` (development) serves the bundle unminified; `hugo` (production)
minifies it. The output is one `<script>`, same as before the split.

---

## 2. Principles

**1. One factory per module.** Every module exports a single
`makeX(S)` (or `makeXCommands(S)`) function that receives the shell context `S`
and returns either a set of helpers or a partial command map. Nothing runs at
import time; everything is created per mount.

**2. Per-instance isolation.** A page can have several `[data-term]` nodes, so
state must NOT be module-global. `mount(root)` builds a fresh `S` for each
terminal and passes it to every factory. Never put mutable terminal state at
module top level.

**3. `S` is the context object.** It carries DOM refs, parsed config
(`sections`, `SAL`, `SHARE`, …), and every shared helper (`print`, `el`,
`normPath`, `statPath`, `listDir`, `fetchPageText`, …). Inside a module you
destructure what you need once at the top:

```js
export function makeFooCommands(S) {
  var print = S.print, el = S.el, normPath = S.normPath;
  return { foo: function (a) { print('hi'); } };
}
```

**4. Stable helpers by destructure, mutable state by accessor.** Functions and
config never get reassigned, so destructuring them is safe. The five mutable
primitives that cross module boundaries stay as locals in `main.js` and are
reached through accessors on `S`:

| State      | Read            | Write              |
|------------|-----------------|--------------------|
| `cwd`      | `S.getCwd()`    | `S.setCwd(v)`      |
| `prevCwd`  | `S.getPrevCwd()`| `S.setPrevCwd(v)`  |
| `vimMode`  | `S.getVimMode()`| `S.setVimMode(v)`  |
| `hist`     | `S.getHist()`   | (push in main.js)  |

Why: destructuring a primitive copies its value, so `var cwd = S.cwd` would
freeze it. The `ufs` object is shared by reference (mutating `ufs.nodes` works
from any module), so it does NOT need an accessor.

**5. Cross-command calls go through `S.commands`.** A command that calls another
command uses `S.commands.cat(...)`, never a captured local. `S.commands` is
wired AFTER the registry is assembled, so capturing it early would get `null` –
always reference `S.commands.x` at call time.

**6. Modal subsystems own their keyboard.** `sim.js` and `editor.js` install
their own `keydown` handlers and expose `isActive()`. The prompt's keydown in
`main.js` is gated: `if (_sim.isActive() || _editor.isActive()) return;`. Only
one modal is active at a time.

**7. Single source of docs.** Every command has a one-paragraph entry in
`man.js` (MANPAGES). `man`, `whatis`, and `apropos` read from it.

---

## 3. Recipe: add a new command

Say you want a `weather` command.

1. **Pick a group module** and add the function. Most commands go in
   `commands-content.js` (community/content) or `commands-meta.js`
   (utilities/eggs); filesystem/navigation commands go in `commands-fs.js`.

   ```js
   // in makeContentCommands(S)'s returned object:
   weather: function (a) {
     print('☀️ В Астане сегодня тимлид не кодит.', 'accent');
   },
   ```

   Make sure any helper you use (`print`, `el`, `link`, …) is in the
   destructure list at the top of the module – add it if missing. If your
   command calls another command, use `S.commands.x(...)`.

2. **Add a man page** in `man.js`:

   ```js
   weather: 'weather – погода в Астане (и напоминание, что тимлид не кодит).',
   ```

   This powers `man weather`, `whatis weather`, `apropos погода`, and the
   `help`/completion listings.

3. **Add aliases** (optional) in `main.js`'s alias table (the big array passed
   to `alias()`), e.g. `['погода', 'weather']`.

4. **Add a share card** (per project convention) in
   `data/shell_commands.toml` so `/s/weather/` mints an OG card and a deep link:

   ```toml
   [[commands]]
   id = "weather"
   cmd = "weather"
   run = "weather"
   desc = "Погода в Астане – пасхалка терминала сообщества."
   out = ["☀️ В Астане сегодня тимлид не кодит.", ""]
   ```

5. **Tab completion** works automatically for the command name. For custom
   argument completion (like `salary`/`git`/`company` have), add a branch in
   `complete()` in `main.js`.

That's it – the command is dispatched by `run()` in `main.js` via the assembled
`commands` registry. No wiring in `main.js` is needed for a plain command in an
existing group module.

A command that is its own subsystem (its own state, panel, or keyboard) should
be a module instead – see below.

---

## 4. Recipe: add a new module / subsystem

For something bigger (a new panel, a stateful tool):

1. Create `assets/js/shell/foo.js`:

   ```js
   export function makeFoo(S) {
     var print = S.print, el = S.el;       // destructure what you need
     var state = null;                     // module-private mutable state is OK
     function fooCmd(a) { /* … */ }
     return { foo: fooCmd, isActive: function () { return !!state; } };
   }
   ```

2. In `main.js`: `import { makeFoo } from './foo.js';`

3. Build it where the other subsystems are built (after `S` is constructed):
   `var _foo = makeFoo(S);`

4. Add its command(s) to the assembled registry:
   `git: _git.git, nano: _editor.nano, foo: _foo.foo`

5. If it needs a helper not yet on `S`, add it to the `S` literal (stable
   helpers/config) or as an accessor (mutable state kept in `main.js`).

6. If it's a modal that grabs the keyboard, expose `isActive()` and add it to
   the prompt keydown gate in `main.js`.

---

## 5. Build, run, test

- **Dev:** `hugo server` then open `http://localhost:1313/shell/`. Live-reload
  rebuilds the bundle on save (unminified in dev).
- **Production build:** `hugo` (minifies + fingerprints the bundle).
- **Syntax:** `node --check assets/js/shell/<file>.js` on any module.
- **Pure-logic unit tests:** modules with no DOM (e.g. `fs.js`, `markdown.js`)
  can be imported directly in a Node `.mjs` harness with stub deps – see the FS
  and markdown harnesses used during the split.
- **End-to-end:** load the built bundle into `jsdom`, mount a terminal, and run
  commands against it – this is the strongest check because esbuild does NOT
  flag a missing dependency (an un-destructured helper) at build time; it only
  fails at runtime. Pattern:

  ```js
  import { JSDOM } from 'jsdom';
  const page = await (await fetch('http://localhost:1313/shell/')).text();
  const bundle = await (await fetch('http://localhost:1313' +
    page.match(/\/js\/shell\/main[^"]*\.js/)[0])).text();
  const dom = new JSDOM(page, { url: 'http://localhost:1313/shell/', runScripts: 'outside-only' });
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {} });
  dom.window.eval(bundle);
  dom.window.TeamleadsShell.mount(dom.window.document.querySelector('[data-term]'));
  dom.window.TeamleadsShell.run('ls');   // then assert on [data-term-out].textContent
  ```

  (jsdom doesn't fire `DOMContentLoaded`, so call `mount()` explicitly.)

---

## 6. Window controls (title-bar buttons)

The three macOS-style dots in `.term-bar` are functional window controls, wired
in `mount()` (`main.js`) via a single delegated click handler on `.term-bar`.
The markup lives in `layouts/partials/shell.html`; the visual states are CSS
classes toggled on the `[data-term]` root.

| Dot        | `data-term-btn` | Action |
|------------|-----------------|--------|
| 🔴 red     | –               | decorative (`aria-hidden`); no behavior |
| 🟡 yellow  | `min`           | **Roll up** – toggles `term--rolled`, shrinking the window to a compact box (≈340px, the homepage-embed size). Click again, or click anywhere on the bar, to restore. |
| 🟢 green   | `max`           | **Expand** – on an embed (homepage/404) opens `/shell/` carrying the current command as `#<cmd>`; on the `/shell/` page itself (where there's no bigger page) toggles `term--max` fullscreen instead. |

Details that matter:

- **"Current command"** = the live input value if non-empty, else the last
  history entry, else nothing (just open `/shell/`). It rides along as
  `/shell/#<encoded cmd>`, the same deep-link `urlCommand()` already replays on
  boot – so assistant verbs (`claude`/`codex`) land pre-typed, everything else
  auto-runs.
- **Context switch is by `URLSYNC`** (the `data-urlsync="1"` only the standalone
  `/shell/` page sets): green navigates from embeds, fullscreens on `/shell/`.
- **CSS specificity:** `term--rolled`/`term--max` are written as
  `.term.term--rolled` (doubled class) so they beat the per-context height rules
  (`.shell-wrap .term`, the media queries) without `!important`.
- The two states are mutually exclusive – toggling one clears the other.

---

## 7. Gotchas

- **esbuild won't catch missing deps.** If you use `print` in a module but
  forget to destructure it from `S`, the build passes and the command throws a
  `ReferenceError` only when run. Test commands you touch (the jsdom oracle).
- **`*/` inside a block comment closes it early.** Avoid sequences like
  `**bold**/*em*/` in `/* … */` comments – they terminate the comment and break
  the parse. (Bit us once during the split.)
- **No `Date.now()`-free constraints here.** This is browser runtime, so
  `Date`, `Math.random`, `localStorage`, `window.open` are all fine.
- **House style:** use en-dashes (–), never the longer em-dash, in any string,
  comment, or doc – including this codebase's content and code.
- **localStorage keys:** `tnk_shell_fs` (user filesystem), `tnk_shell_history`
  (command history), `tnk_shell_theme` (bash/powershell skin), `tnk_shell_user`
  (author name for file metadata), `tnk_shell_tama` (тимагочи save: metrics, team,
  `ts` timestamp for decay).
- **The тимагочи (`tama.js`) is command-driven, not a modal.** Unlike `sim.js`/
  `editor.js` it does NOT grab the keyboard, so it is absent from the prompt
  keydown gate. Its only non-command surface is the `[data-term-hud]` strip and a
  `setInterval` blink loop (paused when `document.hidden`). It auto-resumes on
  mount via `_tama.resume()` (full mode only) when a save exists. Real-time decay
  is computed from `Date.now() - state.ts` on load (18h ≈ one drift "day", capped
  at 7), so leaving the tab erodes trust/morale and grows conflict.
- **The user filesystem is a full overlay:** user nodes can shadow baked content
  at the same path, and `rm` on a baked page writes a tombstone (whiteout) that
  hides it locally without touching the source. See `fs.js` for the model.
