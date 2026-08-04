# Testing locally

Everything here runs on your machine with no credentials and no connection to
teamleads.kz. Every command below was run before it was written down.

The two suites CI gates merges on:

```bash
dotnet test backend.Tests/TeamleadsBackend.Tests.csproj          # 56 tests
cd landing-main && hugo --minify && node scripts/validate-scenarios.mjs && npm test
```

Green on both means the `backend` and `landing` checks in
[`.github/workflows/test.yml`](.github/workflows/test.yml) will be green too. Merging
into `master` is blocked until they are – see [`.github/MERGE_POLICY.md`](.github/MERGE_POLICY.md).

---

## Backend suite

```bash
dotnet test backend.Tests/TeamleadsBackend.Tests.csproj
```

No database and no secrets: EF Core's in-memory provider plus a stub
`HttpMessageHandler` standing in for the Telegram Bot API. Runs in about a third of a
second, so there is no reason not to run it before every push.

To reproduce CI byte for byte – same SDK image the `Dockerfile` builds the shipped
artifact with, no host .NET required:

```bash
docker run --rm --user "$(id -u):$(id -g)" \
  -e HOME=/tmp -e NUGET_PACKAGES=/src/.nuget \
  -v "$PWD":/src -w /src \
  mcr.microsoft.com/dotnet/sdk:10.0 \
  dotnet test backend.Tests/TeamleadsBackend.Tests.csproj --nologo -v minimal
```

Useful filters:

```bash
dotnet test backend.Tests/TeamleadsBackend.Tests.csproj --filter OutboxTests
dotnet test backend.Tests/TeamleadsBackend.Tests.csproj --filter FullyQualifiedName~Outbox_messages_go_out
```

What is covered, and why it is shaped that way, is in
[`backend/README.md`](backend/README.md#tests). The short version: `OutboxTests` covers
the delivery loop (retries, backoff, expiry, late chat resolution), and
`TelegramClientWireTests` asserts on the **bytes** each Bot API method puts on the wire,
because that is the part a replacement client library has to reproduce.

## Landing checks

```bash
cd landing-main
hugo --minify                        # the build is itself a test
node scripts/validate-scenarios.mjs  # reads public/, so it must follow the build
npm test                             # 18 tests, node --test, no install needed
```

**The Hugo build is the most valuable of the three.** Insights pages are hand-authored
YAML written weekly, and Hugo fails hard on a malformed front matter block –
`week-2026-07-27` failed to build twice on nested double quotes inside a `quotes:`
string. Run it after touching anything under `content/` or `data/`.

`validate-scenarios.mjs` reads `public/shell/index.html` rather than the YAML source, so
it proves Hugo actually ingested `scenarios.yaml` and that every scenario's `link`
resolves to a page the shell can `cat`. It only works **after** a build.

## Running the whole thing

```bash
docker compose up --build      # from the repo root
```

| Service | URL | What it is |
|---------|-----|------------|
| `api` | <http://127.0.0.1:5080> | the backend, built from `backend/Dockerfile` |
| `landing` | <http://127.0.0.1:1313> | `hugo server`, live reload |
| `db` | `127.0.0.1:55433` | throwaway Postgres 17 |
| `tg-stub` | <http://127.0.0.1:8081> | fake Bot API, `dev/telegram-stub.py` |

Compose is a **dev tool only** and is never part of a deploy – production stays
`docker run`. It exists because the only other way to run the backend was to point
`backend.env` at the remote production database.

### Smoke test

```bash
curl -s localhost:5080/api/health            # {"status":"ok"}
curl -so /dev/null -w '%{http_code}\n' localhost:5080/api/health/ready   # 200 = migrations applied
curl -so /dev/null -w '%{http_code}\n' localhost:1313/                   # 200 = site rendering
```

### End to end, through the bot pipeline

Nothing reaches Telegram: `TG_API_BASE` points at the stub, so the anon flow, the outbox
dispatcher and the weekly scheduler all run with no BotFather token.

```bash
# 1. Point the bot at an admin chat (any id – the stub does not check).
curl -X PUT localhost:5080/api/settings/tg.admin_chat_id \
  -H 'X-Api-Key: localdev-admin-key' -H 'Content-Type: application/json' \
  -d '{"value":"-100123"}'

# 2. Submit an anonymous question. Returns {"publicId":"XXXXXX"}.
curl -X POST localhost:5080/api/anon \
  -H 'Content-Type: application/json' \
  -d '{"text":"проверка локального окружения","source":"form"}'

# 3. Within one 30s dispatcher tick the moderation card shows up here.
docker compose logs -f tg-stub
#   → sendMessage  chat=-100123 🕵️ Анонимный запрос XXXXXX ⏎ источник: сайт …
```

Confirm the queue drained rather than trusting the log:

```bash
docker compose exec db psql -U teamleads -d teamleads \
  -c 'SELECT "Kind", "Status", "Attempts", "LastError" FROM "Outbox";'
#   anon_card | sent | 1 |
```

`Status` stays `pending` with `Attempts = 0` when `tg.admin_chat_id` is unset – that is
the intended "no destination yet" behaviour, not a failure. Set it and the backlog
flushes on the next tick.

### Staging variant

```bash
docker compose -f compose.yaml -f compose.stg.yaml up --build
```

Production-shaped, still local: `ASPNETCORE_ENVIRONMENT=Production`, the site **built**
with `--minify` and served by nginx rather than rendered in memory, and the backend
reading `bot-data.json` off disk via `BOT_DATA_PATH` the way the host does. Worth a run
before anything touching startup config, rendering, or the archive feed – minification
is its own rendering pass and can fail on markup that serves fine unminified.

Same URLs as dev. The `landing` container builds once and exits (`Exited (0)` is
success, not a crash); `site-web` serves the result.

## Troubleshooting

**`address already in use` on startup.** Something else holds one of the four host
ports. `db` is deliberately on 55433 rather than 5432 because a stray local Postgres on
the default port is common. Find the culprit with:

```bash
lsof -nP -iTCP:5080 -sTCP:LISTEN
docker ps --format '{{.Names}}\t{{.Ports}}'
```

**`api` exits immediately on first boot.** It waits on the database healthcheck, so this
is usually a migration failure rather than a race. `docker compose logs api` has the
reason.

**Stale schema after changing an entity.** Migrations only ever go forward. Wipe and
rebuild:

```bash
docker compose down -v && docker compose up --build
```

**Backend code changes do nothing.** There is no hot reload for the API – it runs from
the built image. Re-run `docker compose up --build`. Hugo does live-reload.

## What this does not cover

- **No browser or end-to-end UI tests.** The shell, the games and the chat overlays are
  exercised by hand.
- **No test touches a real Telegram chat.** That is deliberate, and it means bot
  behaviour against the live Bot API is only ever verified in production. The stub
  reproduces the response shapes the client reads, not Telegram's full semantics.
- **`landing-main/tests/` covers the tamagotchi economy only**, not the rest of the
  shell's JavaScript.
