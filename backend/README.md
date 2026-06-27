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
  Data/                   AppDbContext, Feedback + Submission entities, design-time factory
  Endpoints/              Health / Feedback / Submission endpoints, validation, policies
  Security/               ApiKey filter, ClientFingerprint (IP from X-Forwarded-For + salted hash)
  Migrations/             EF Core migrations (committed)
  Dockerfile, run.sh, backend.env.example
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

¹ Public POSTs are rate-limited (5/min/IP), validated, and honeypot-guarded (a `website`
field that must stay empty). The caller IP comes from `X-Forwarded-For` (set by nginx) and
is stored only as a salted hash.

## Configuration (env vars)

Double-underscore maps to nested keys. See `backend.env.example`.

| Var | Required | Purpose |
|-----|----------|---------|
| `ConnectionStrings__Default` | yes | remote PostgreSQL connection string |
| `ADMIN_API_KEY`              | yes | shared secret for the moderation `GET`s |
| `IP_HASH_SALT`               | no  | salt for IP hashing; empty → store no IP hash |
| `ASPNETCORE_ENVIRONMENT`     | no  | `Production` (default image) or `Development` |

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
dotnet ef migrations add <Name>   # committed under Migrations/
```

## Deploy (CI/CD)

`.github/workflows/deploy-backend.yml` runs on the **self-hosted runner on the server**
(same pattern as the Hugo deploys). On a push to `master` touching `backend/**` it:

1. builds the image locally (`teamleads-backend:<sha>` + `:latest`),
2. writes `/opt/teamleads-backend/backend.env` (mode 700) from GitHub secrets,
3. swaps the container (`docker run … --restart unless-stopped -p 127.0.0.1:5080:8080`),
   which auto-applies migrations on boot,
4. polls `/api/health` as a gate, then prunes dangling images.

Required GitHub Actions secrets: `BACKEND_CONNECTION_STRING`, `BACKEND_ADMIN_API_KEY`,
`BACKEND_IP_HASH_SALT`.

nginx routing lives in `landing-main/infra/teamleads.kz.conf` – `location /api/` proxies
to `127.0.0.1:5080`, while the more-specific `location /api/salaries/` still proxies to the
external techinterview API.

> Note: the container swap has a brief (sub-second) gap between `rm` and `run`. A blue-green
> two-port swap is a noted future improvement.
