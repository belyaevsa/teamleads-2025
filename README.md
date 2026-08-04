# Тимлид не кодит

Monorepo for [teamleads.kz](https://teamleads.kz).

"Тимлид не кодит" is a professional community for tech leads, engineering managers, and CTOs in Kazakhstan. 400+ members from companies like Kaspi, Kolesa, DAR, Chocofamily, InDrive, and others share real-world experience on team management, architecture decisions, hiring, processes, and career growth. The community runs regular online meetups with structured discussions and published reports.

Telegram: [@teamleads_kz](https://t.me/teamleads_kz)

## Structure

```
.
├── landing-main/          # Main site (teamleads.kz) – Hugo
│   ├── content/           # events, articles, insights, showcase, toolkit, fun, shell
│   ├── data/              # salaries, companies, voices, scenarios, shell_commands…
│   ├── layouts/           # Templates, OG image generation, shell page
│   ├── assets/            # CSS, fonts, images
│   ├── static/js/         # shell.js (terminal), claude/codex chat, salary, retrieval
│   ├── static/games/      # sudoku.html (standalone game)
│   ├── deploy.sh          # rsync to production
│   └── Dockerfile         # Minimal Docker build
│
├── 2025/                  # Year-in-review analysis (2025.teamleads.kz)
│   ├── scripts/           # Python analysis scripts
│   ├── data/              # CSV exports, sentiment data
│   └── hugo-claude/       # Hugo site for 2025 review
│
├── backend/               # API + Telegram bot (ASP.NET Core, .NET 10)
├── backend.Tests/         # xUnit suite for the backend
├── dev/                   # local-only helpers (stub Telegram Bot API)
├── compose.yaml           # local dev stack; never used for deploys
│
└── 2026/
    └── events-reports/    # Raw meeting reports (markdown)
```

## Testing

```bash
dotnet test backend.Tests/TeamleadsBackend.Tests.csproj
cd landing-main && hugo --minify && node scripts/validate-scenarios.mjs && npm test
```

Or run the whole stack locally – API, site, throwaway Postgres and a fake Telegram Bot
API – with `docker compose up --build`.

Full guide: **[TESTING.md](TESTING.md)**. Merges into `master` are gated on both suites
passing (see [`.github/MERGE_POLICY.md`](.github/MERGE_POLICY.md)).

## Landing (teamleads.kz)

Hugo 0.153.4 extended. No external theme – custom layouts.

### Local dev

```bash
cd landing-main
hugo server
```

### Build

```bash
hugo --minify
```

### Docker

```bash
docker build -t teamleads-landing .
```

Two-stage build: `hugomods/hugo:exts-0.153.4` + `scratch`. Final image ~5MB, contains only static files in `/public`.

### Deploy

```bash
./deploy.sh
```

Builds and rsyncs to `ps-enter:/opt/teamleads.kz/latest/`.

## Shell (interactive terminal)

The site ships an in-browser terminal that turns the whole site into a navigable
filesystem. It lives at [/shell/](https://teamleads.kz/shell/), and is also embedded
as a sticky dock on the homepage and on the 404 page.

- **Core:** `static/js/shell.js` (dependency-free), mounted via `layouts/partials/shell.html`.
  Config is passed through `data-*` attributes (filesystem, salary data, scenarios, share map…).
- **Commands:**
  - *Navigation / reading:* `ls`, `cd`, `open`, `cat`, `find`, `grep`, `tree`, `head`, `tail`, `wc`, `stat`
  - *Data:* `salary` (live market data from techinterview.space), `companies` / `company` / `addreview` (company reviews)
  - *Interactive:* `sim` (тимлид-симулятор), `games` / `sudoku`, `fun` (engineering puzzles loaded into the assistant)
  - *Assistants:* `claude` / `codex` – offline chat overlays (`static/js/claude-chat.js`, `codex-chat.js`) answering from site content
  - *Meta / utils:* `man`, `apropos`, `whatis`, `which`, `alias`, `theme`, `share`, `feedback`, `submit`
- **Data sources:** `data/*.{yaml,json,toml}` – `salaries`, `companies`, `voices`, `scenarios`, `quizzes`, `shell_commands`.
- **Windows visitors** get a PowerShell skin (blue theme, `PS C:\>` prompt, cmdlet aliases like `dir`/`gci`); `theme ps|bash` toggles it.

### Hugo output formats (for the shell)

Defined in `hugo.toml`:

- `cat` – plain-markdown `index.md` next to each page's HTML; the `cat` command fetches it on demand.
- `shellindex` – one `shell-index.json` full-text index, fetched once for ranked `grep` / `find`.
- `catshare` – per-page "open in shell" share card (`/<section>/<base>/shell.html`) with a terminal-style OG image.

### Shareable command pages

`data/shell_commands.toml` is the single catalog of shareable commands. `content/s/_content.gotmpl`
mints a real page at `/s/<id>/` for each entry, with a terminal OG card
(`layouts/partials/og-shell.html`) and a redirect into `/shell/` that auto-runs the command.
On the `/shell/` page (only), the address bar is rewritten to the matching `/s/<id>/` link as
commands run, so copying the URL shares the exact command.

## Meeting reports

Each community meeting produces:

1. **Raw report** in `2026/events-reports/meetup-YYYY-MM-DD/report.md`
2. **Hugo page** in `landing-main/content/events/meetup-YYYY-MM-DD.md` (HTML with CSS classes)
3. **Homepage card** in `landing-main/layouts/index.html`
4. **OG image** – auto-generated at build time via `layouts/partials/og-image.html`

OG images use Hugo's `images.Text` filter to render topic headers on a light gradient background with Inter TTF fonts.

## 2025 year-in-review

Telegram chat analysis: sentiment, topics, network graphs, activity patterns. Published at [2025.teamleads.kz](https://2025.teamleads.kz). See `2025/README.md` for details.
