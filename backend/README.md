# teamleads.kz backend

A small, general-purpose **ASP.NET Core (.NET 10)** service for teamleads.kz. It runs
as a Docker container on the same host as nginx, which reverse-proxies `/api/` to it,
and it talks to a **remote PostgreSQL**.

First scope: health/readiness, OpenAPI, and two real features – community **feedback**
and **submissions** persisted to pgsql with admin-only moderation lists.

## Stack

- ASP.NET Core Minimal APIs, all routes under `/api`.
- EF Core + Npgsql; migrations **auto-applied on startup** (with retry).
- Built-in structured logging (simple console; JSON console when `LOG_FORMAT=json`).
- Built-in rate limiter on the public POSTs; admin endpoints behind an `X-Api-Key`.
- Packaged with a multi-stage `Dockerfile` and deployed via `docker run` – **never compose**.
  Compose exists only as a local dev environment (`compose.yaml`), never in the deploy path.

## Layout

```
backend/
  Program.cs              host, logging standard, middleware, /api group, startup migration
  appsettings*.json       log levels; empty ConnectionStrings:Default (supplied via env)
  Data/                   AppDbContext, Feedback / Submission / AnonRequest / BotPost / Setting, factory
  Endpoints/              Health / Feedback / Submission / Anon / Settings / Telegram webhook, validation
  Telegram/               Bot API client, AnonService, DilemmaService, BotScheduler, options
  BotData/                archive feed client (/bot-data.json) + Telegram poll-text limits
  Settings/               runtime settings: closed catalog + 5-minute cached service
  Security/               ApiKey filter, ClientFingerprint (IP from X-Forwarded-For + salted hash)
  Migrations/             EF Core migrations (committed)
  Dockerfile, run.sh, set-webhook.sh, backend.env.example

backend.Tests/            xUnit suite (sibling project, not shipped in the image)
  Support/StubBotApi      fake Bot API socket – captures the request body sent to Telegram
  Support/TestHost        in-memory AppDbContext + real SettingsService + wired TelegramClient
  Support/FakeChatSender  IChatSender that records instead of sending
  OutboxTests             the drain loop, against the port – names no client at all
  ChatSenderContractTests what every IChatSender adapter must do; subclass per adapter
  TelegramClientWireTests the JSON each Bot API method puts on the wire

compose.yaml              local dev stack (repo root) – db + api + hugo + stub Bot API
compose.stg.yaml          staging overlay: Production env, built site, feed read off disk
dev/telegram-stub.py      fake Bot API; logs what the bot tried to send
```

## Tests

```bash
dotnet test backend.Tests/TeamleadsBackend.Tests.csproj
```

No database and no secrets: the suite runs against EF Core's in-memory provider and a
stub `HttpMessageHandler`. For the landing checks, the full local stack and
troubleshooting, see **[TESTING.md](../TESTING.md)**.

In CI it runs from two workflows, split by branch and never overlapping:

| Workflow | Fires on | Does |
|----------|----------|------|
| `test.yml` | **every pull request**, and pushes to any branch but master | tests only, reports the `backend` check |
| `deploy-backend.yml` | push to **master** | tests, then swaps the container (`deploy` has `needs: test`) |

Both run the suite inside `mcr.microsoft.com/dotnet/sdk:10.0` – the image the
`Dockerfile` builds with – so nothing assumes a .NET SDK on the runner. The pull-request
job runs on a GitHub-hosted runner rather than the self-hosted one, because fork code
must not execute on the production host.

**Merging is gated on that `test` check** – see [`.github/MERGE_POLICY.md`](../.github/MERGE_POLICY.md).

### Swapping the Telegram client

The outbox talks to **`IChatSender`** (`Telegram/IChatSender.cs`), a port this project
owns – `SendMessageAsync(ChatMessage, ct)` returning a `SendOutcome`. `Outbox` and
`OutboxTests` name no Bot API library, so replacing the client cannot break either.
Before the port existed, a PR swapping the client failed the test project's **compile**,
because the vendor type was the seam.

To introduce a client:

1. Write an adapter implementing `IChatSender` (see `Telegram/BotApiChatSender.cs`).
2. Change one line in `Program.cs`: `AddScoped<IChatSender, YourAdapter>()`.
3. Subclass `ChatSenderContractTests`, returning your adapter from `CreateSender`.

Step 3 is the point. The contract suite is what every adapter must satisfy –
outcome mapping, an API refusal keeping its reason, a dead socket and a **client timeout**
both becoming failed outcomes rather than escaping exceptions, keyboards passed as JSON
objects, and preview suppression honoured. If a case cannot be expressed against your
client, that is a behaviour change: override it with a comment saying so, don't delete it.

`TelegramClientWireTests` stays client-specific on purpose. It asserts the exact bytes
the current client puts on the wire, which is the spec a replacement has to reproduce –
a swap that keeps the C# signatures but changes the payload compiles, deploys, and breaks
in production.

## Local environment

Compose is a **dev tool only** – it is never part of a deploy, which stays `docker run`
(`run.sh` locally, `deploy-backend.yml` on the host). It exists because the only other
way to run the backend was to point `backend.env` at the **remote production Postgres**.

```bash
docker compose up --build          # from the repo root
docker compose logs -f tg-stub     # transcript of what the bot tried to send
docker compose down -v             # stop, and wipe the database volume
```

| Service | Host port | What it is |
|---------|-----------|------------|
| `api` | `127.0.0.1:5080` | this project, built from `backend/Dockerfile`; same port as `run.sh` |
| `db` | `127.0.0.1:55433` | throwaway Postgres 17. **Not** 5432 – that collides with an existing local server |
| `landing` | `127.0.0.1:1313` | `hugo server`, live reload |
| `tg-stub` | `127.0.0.1:8081` | fake Bot API (`dev/telegram-stub.py`) |

Migrations auto-apply on startup, so the schema builds itself on first boot; `api` waits
on the database healthcheck so it doesn't race `initdb` and burn the retry budget.

Every credential in `compose.yaml` is a local throwaway and is committed on purpose.
Nothing reaches teamleads.kz: the database is a container and `TG_API_BASE` points at the
stub, so the anon pipeline, the outbox dispatcher and the weekly scheduler all run
end to end with no BotFather token and no risk of a stray message reaching the community.

To exercise the full anon flow:

```bash
curl -X PUT localhost:5080/api/settings/tg.admin_chat_id \
  -H 'X-Api-Key: localdev-admin-key' -H 'Content-Type: application/json' -d '{"value":"-100123"}'
curl -X POST localhost:5080/api/anon \
  -H 'Content-Type: application/json' -d '{"text":"проверка","source":"form"}'
docker compose logs -f tg-stub     # card appears within one 30s dispatcher tick
```

### Staging variant

```bash
docker compose -f compose.yaml -f compose.stg.yaml up --build
```

Production-shaped, still local. `ASPNETCORE_ENVIRONMENT=Production`, the site is **built**
with `--minify` and served by nginx instead of rendered in memory, and the backend reads
`bot-data.json` off disk via `BOT_DATA_PATH` the way the host does. Catches the class of
break that only appears in a real build – minification is its own rendering pass.

## Endpoints

| Method | Path                 | Auth        | Notes |
|--------|----------------------|-------------|-------|
| GET    | `/api/health`        | public      | liveness `{ "status": "ok" }` |
| GET    | `/api/health/ready`  | public      | pings pgsql; 503 if down |
| POST   | `/api/feedback`      | public¹     | `{ message, page?, contact? }` → 201 |
| GET    | `/api/feedback`      | `X-Api-Key` | moderation list (`?handled=&take=`) |
| POST   | `/api/submissions`   | public¹     | `{ title, type?, url?, author?, notes? }` → 201 |
| GET    | `/api/submissions`   | `X-Api-Key` | moderation list (`?status=&take=`) |
| POST   | `/api/anon`          | public²     | `{ text, source? }` → 201 `{ publicId }` – anonymous question |
| GET    | `/api/anon`          | `X-Api-Key` | audit list (`?status=&take=`); never returns author data |
| POST   | `/api/tg/webhook/{secret}` | secret³ | Telegram updates: DM submissions + admin moderation buttons |
| GET    | `/api/settings`      | `X-Api-Key` | runtime tunables with their effective value and source |
| PUT    | `/api/settings/{key}`| `X-Api-Key` | change one (validated against the catalog) |

¹ Public POSTs are rate-limited (5/min/IP), validated, and honeypot-guarded (a `website`
field that must stay empty). The caller IP comes from `X-Forwarded-For` (set by nginx) and
is stored only as a salted hash.

² `/api/anon` uses a stricter limiter (3/hour/IP): every accepted request costs an admin a
moderation decision.

³ The webhook is not rate-limited – Telegram retries hard on non-2xx and a 429 would make it
back off. It is gated by the unguessable path segment **and** the
`X-Telegram-Bot-Api-Secret-Token` header, both constant-time compared, both equal to
`TG_WEBHOOK_SECRET`.

## Anonymous requests

The problem: people don't post real problems in the community chat, because their managers
and colleagues are in it. The pipeline: submit (site form, shell, or DM to
**@temlead_helper_bot**) → moderation card with inline buttons in a private admin chat →
one tap publishes it to the community chat as a message from the bot.

**Anonymity is a storage property, not a promise.** `AnonRequest` holds no telegram id, no
username, no raw IP – only `AuthorHash`, a salted SHA-256 used for flood control
(`anon.max_pending_per_author`, default 5). `GET /api/anon` projects a subset that excludes even that. Publishing
is a fresh `sendMessage`, never a forward (a forward carries `forward_from`), and the text
goes out with `parse_mode` unset so a submitter can't smuggle in a hidden `tg://user?id=`
mention.

The consequence: **we cannot notify an author when their question is published.** They get a
`publicId` instead and check `/status A7F3K2` in the bot.

Code: `Telegram/` (client, `AnonService`, options), `Endpoints/AnonEndpoints.cs`,
`Endpoints/TelegramWebhookEndpoints.cs`, `Data/AnonRequest.cs`.

## How the bot reads the archive

The bot never keeps its own copy of the content. The site publishes a machine-readable
feed – `landing-main/layouts/index.botdata.json` → **`/bot-data.json`** (simulator
dilemmas, quizzes, the open questions backlog, latest materials) – and `BotData/BotDataClient.cs`
reads it. Hugo already knows how `articles/slug` resolves to a URL and which questions
are still unanswered; duplicating that here would rot on the first content move. It also
keeps landing and backend deploys independent.

Two transports, one code path:

- **`BOT_DATA_PATH`** – read the file off disk. Both services run on this host, so
  `/opt/teamleads.kz/latest/bot-data.json` is a local read: no network, fresh the instant
  a landing deploy lands. This is the default in the deploy workflow.
- **`BOT_DATA_URL`** – HTTP with ETag revalidation, 15-minute TTL. Works if the two ever
  split hosts. nginx serves `.json` under the server-level `max-age=0, must-revalidate`
  (no asset location block matches it), so an unchanged feed costs a 304, not a download.

A failed refresh never takes the feature down – the last good snapshot keeps serving.

Poll texts are shortened by `BotData/PollText.cs`: Telegram caps a question at 300 chars
and an option at 100, which 3 of 87 simulator options and 19 of 53 backlog questions
exceed. It prefers the clause before a colon (in this backlog that is almost always the
topic name) and falls back to a word-boundary cut. The full text always goes into the
message body, so the shortening only ever affects the button.

## Runtime settings

`Settings/` holds the tunables that must change without a deploy – the scheduler's
master switch, the dilemma slot, the anon flood limit. **The table is the only source.**
Rows are seeded by a migration (`…_SeedSettings`) with `ON CONFLICT DO NOTHING`, so it
runs once, in order, and never overwrites an operator's edit – nor fails on a key that
somebody already created through the API. Adding a catalog key later means adding it to
a migration; forget one and `SettingsService` still resolves it to the catalog default,
so nothing breaks, the row is just missing from `/set` until you add it.

The two chat ids live here too – `tg.admin_chat_id` and `tg.community_chat_id`. Moving
the moderation group or migrating the community to a new supergroup is a settings change,
not a redeploy. `0` means "not configured", and since no real chat id is 0, every admin
path is simply inert until it is set.

These are deliberately *not* env vars. Two places to set the same thing is how you end
up with a deploy that silently undoes a change made from a phone – so `TG_SCHEDULER_ENABLED`
`TG_DILEMMA_*`, `TG_ADMIN_CHAT_ID` and
`TG_COMMUNITY_CHAT_ID` no longer exist. Nothing posts to the chat until `tg.scheduler.enabled`
is `true` **in the table**.

The catalog default still backs every read, so a key not seeded yet – or a database
briefly unreachable – resolves to the same value the seed would have written. Settings
can never be the reason the bot stops working.

`SettingsService` is a singleton with a **5-minute cache**, refreshed lazily on read and
invalidated immediately on write – a change from the admin chat lands at once locally and
within one cache window everywhere. `BotScheduler` re-reads on every tick rather than at
startup, which is the point: turning the bot off is a message, not a redeploy.

`Settings/SettingsCatalog.cs` is a **closed list**. Only keys declared there can be stored
or read, values are type- and range-checked on write, and an unknown key is a 400 rather
than a setting that silently does nothing.

> **Secrets stay in env, deliberately.** `TG_BOT_TOKEN`, `ADMIN_API_KEY` and especially
> `IP_HASH_SALT` are not in the catalog and must never be added. Storing the salt in the
> same database as the `AuthorHash` column it salts would make one dump enough to
> brute-force telegram ids back out of the hashes – the exact property the anonymous
> requests promise. The env file is a different blast radius from the database.

| Where | How |
|---|---|
| HTTP | `GET /api/settings` (effective value + source), `PUT /api/settings/{key}` – both `X-Api-Key` |
| Admin chat | `/set` lists everything, `/set <key> <value>` changes one |

`source` in the GET response is `db` once a key is seeded, `default` if it is not in the
table yet – useful for spotting a seed that did not run.

## Weekly dilemma

`Telegram/DilemmaService.cs` posts one simulator scenario as an anonymous poll and reveals
the consequences 24h later (final chat tally from `stopPoll`, the site's own vote split,
the lesson, and the link to the related material).

`Telegram/BotScheduler.cs` ticks every five minutes and asks "is it time yet" instead of
sleeping to the next slot, so a deploy mid-window can't skip it. Idempotency lives in the
`BotPosts` table, not in the loop: repeated ticks and container swaps still produce exactly
one post. Rotation is round-robin over the feed order – every dilemma runs before any repeats.

Off by default: nothing posts until `tg.scheduler.enabled` is `true` in the settings
table. The slot is `tg.dilemma.dow` (0=Sunday) + `tg.dilemma.hour`, Almaty time, seeded
to Tuesday 11:00. In the admin chat, `/dilemma` and `/reveal` run the same code paths
by hand, and `/set` changes the schedule.

### Telegram setup (one time, manual)

1. BotFather → `/setprivacy` → **Enable** (the bot must not read community chat messages).
   Avatar: `/setuserpic` with `landing-main/static/images/bot/padawan-avatar-512.png`
   (source SVG next to it; artwork sits inside the inscribed circle because Telegram
   crops avatars round).
2. Add the bot to the community chat with permission to send messages.
3. Add the bot to the private admin chat.
4. Chat ids are seeded by the `SeedSettings` migration. To change either:
   `/set tg.community_chat_id -100…` in the admin chat, or PUT /api/settings/<key>.
   Verify an id before trusting it:
   `curl "https://api.telegram.org/bot$TG_BOT_TOKEN/getChat?chat_id=-100…"`
5. Register the webhook: `./set-webhook.sh` (reads `backend.env`, defaults to
   `https://teamleads.kz`). Re-run after rotating `TG_WEBHOOK_SECRET`.

## Configuration (env vars)

Double-underscore maps to nested keys. See `backend.env.example`.

| Var | Required | Purpose |
|-----|----------|---------|
| `ConnectionStrings__Default` | yes | remote PostgreSQL connection string |
| `ADMIN_API_KEY`              | yes | shared secret for the moderation `GET`s |
| `IP_HASH_SALT`               | no  | salt for IP + telegram-id hashing; empty → store no hash |
| `ASPNETCORE_ENVIRONMENT`     | no  | `Production` (default image) or `Development` |
| `TG_BOT_TOKEN`               | no¹ | @temlead_helper_bot token from BotFather |
| `TG_WEBHOOK_SECRET`          | no¹ | webhook path suffix + secret-token header |
| `TG_ADMIN_CHAT_ID`           | no¹ | private admin chat that receives moderation cards |
| `TG_COMMUNITY_CHAT_ID`       | no¹ | main chat where approved questions are published |

¹ Required together for anonymous requests. With any of them missing the feature degrades
quietly: the webhook 404s, `/api/anon` still accepts and stores requests, the rest of the
API is unaffected.

## Run locally

```bash
cp backend.env.example backend.env   # fill in the connection string + secrets
./run.sh                              # builds the image, (re)runs on 127.0.0.1:5080
curl http://127.0.0.1:5080/api/health
```

For hot iteration without Docker: `dotnet run` (Development enables OpenAPI at
`/openapi/v1.json` and CORS for the Hugo dev server on `localhost:1313`).

Migrations during development:

```bash
dotnet tool restore               # EF tools pinned in .config/dotnet-tools.json
dotnet dotnet-ef migrations add <Name>   # committed under Migrations/
```

> The tool version is pinned on purpose. A globally installed `dotnet-ef` from an older
> major (e.g. 9.x against this EF 10 project) writes a model snapshot that doesn't match
> the model, and the app then fails every startup migration with `PendingModelChangesWarning`
> – a crash loop that only shows up on deploy.

## Deploy (CI/CD)

Host prerequisites, one time (the runner user cannot write to `/opt`, and the runner
needs the Docker socket):

```bash
sudo install -d -m 700 -o <runner-user> -g <runner-user> /opt/teamleads-backend
sudo usermod -aG docker <runner-user>
sudo systemctl restart actions.runner.belyaevsa-teamleads-2025.<id>.service
```

`.github/workflows/deploy-backend.yml` runs on the **self-hosted runner on the server**
(same pattern as the Hugo deploys). On a push to `master` touching `backend/**` it:

1. builds the image locally (`teamleads-backend:<sha>` + `:latest`),
2. writes `/opt/teamleads-backend/backend.env` (mode 700) from GitHub secrets,
3. swaps the container (`docker run … --restart unless-stopped -p 127.0.0.1:5080:8080`),
   which auto-applies migrations on boot,
4. polls `/api/health` as a gate, then prunes dangling images.

Required GitHub Actions secrets: `BACKEND_CONNECTION_STRING`, `BACKEND_ADMIN_API_KEY`,
`BACKEND_IP_HASH_SALT`, `BACKEND_TG_BOT_TOKEN`, `BACKEND_TG_WEBHOOK_SECRET`,
`BACKEND_TG_ADMIN_CHAT_ID`, `BACKEND_TG_COMMUNITY_CHAT_ID`.

nginx routing lives in `landing-main/infra/teamleads.kz.conf` – `location /api/` proxies
to `127.0.0.1:5080`, while the more-specific `location /api/salaries/` still proxies to the
external techinterview API.

> Note: the container swap has a brief (sub-second) gap between `rm` and `run`. A blue-green
> two-port swap is a noted future improvement.
