# teamleads.kz backend

A small, general-purpose **ASP.NET Core (.NET 10)** service for teamleads.kz. It runs
as a Docker container on the same host as nginx, which reverse-proxies `/api/` to it,
and it talks to a **remote PostgreSQL**.

First scope: health/readiness, OpenAPI, and two real features – community **feedback**
and **submissions** persisted to pgsql with admin-only moderation lists.

## Stack

- ASP.NET Core Minimal APIs, all routes under `/api`.
- EF Core + Npgsql; migrations **auto-applied on startup** (with retry).
- Built-in structured logging (JSON console in Production, readable in Development).
- Built-in rate limiter on the public POSTs; admin endpoints behind an `X-Api-Key`.
- Packaged with a multi-stage `Dockerfile` and run via `docker run` – **no docker-compose**.

## Layout

```
backend/
  Program.cs              host, logging standard, middleware, /api group, startup migration
  appsettings*.json       log levels; empty ConnectionStrings:Default (supplied via env)
  Data/                   AppDbContext, Feedback + Submission + AnonRequest entities, factory
  Endpoints/              Health / Feedback / Submission / Anon / Telegram webhook, validation, policies
  Telegram/               Bot API client, AnonService (moderation pipeline), options
  Security/               ApiKey filter, ClientFingerprint (IP from X-Forwarded-For + salted hash)
  Migrations/             EF Core migrations (committed)
  Dockerfile, run.sh, set-webhook.sh, backend.env.example
```

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
username, no raw IP – only `AuthorHash`, a salted SHA-256 used for flood control (max 5
pending per author). `GET /api/anon` projects a subset that excludes even that. Publishing
is a fresh `sendMessage`, never a forward (a forward carries `forward_from`), and the text
goes out with `parse_mode` unset so a submitter can't smuggle in a hidden `tg://user?id=`
mention.

The consequence: **we cannot notify an author when their question is published.** They get a
`publicId` instead and check `/status A7F3K2` in the bot.

Code: `Telegram/` (client, `AnonService`, options), `Endpoints/AnonEndpoints.cs`,
`Endpoints/TelegramWebhookEndpoints.cs`, `Data/AnonRequest.cs`.

### Telegram setup (one time, manual)

1. BotFather → `/setprivacy` → **Enable** (the bot must not read community chat messages).
2. Add the bot to the community chat with permission to send messages.
3. Add the bot to the private admin chat.
4. Get both chat ids (e.g. temporarily forward a message to `@getidsbot`), put them into
   `TG_ADMIN_CHAT_ID` / `TG_COMMUNITY_CHAT_ID`.
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
