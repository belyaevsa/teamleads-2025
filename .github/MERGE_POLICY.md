# Merge policy

**Nothing reaches `master` without a green test run.**

Not "tests run after the merge" – before. A push to `master` deploys: the container
swaps on the production host and EF migrations apply on startup. By the time a
post-merge test run goes red, the broken code is already serving traffic. The gate has
to sit in front of the merge button.

## How it is enforced

| Layer | Where | What it does |
|-------|-------|--------------|
| Ruleset on `master` | repo settings, defined in [`rulesets/master-requires-tests.json`](rulesets/master-requires-tests.json) | blocks the merge until `backend` **and** `landing` pass |
| `test.yml` | every pull request, and every branch push | runs both suites, reports both checks |
| `deploy-backend.yml` | push to `master` | runs the backend suite again; `deploy` has `needs: test` |

The two required checks are the job ids in `test.yml`:

- **`backend`** – the xUnit suite (`backend.Tests`), in the same SDK container the
  `Dockerfile` builds with.
- **`landing`** – `hugo --minify`, then `validate-scenarios.mjs`, then `npm test`.
  The Hugo build is itself a test: the insights pages are hand-authored YAML written
  weekly, and Hugo fails hard on a malformed front matter block. `week-2026-07-27`
  failed to build twice on nested double quotes inside a `quotes:` string. Without this
  job that class of break only surfaces during the deploy – which is after the merge.
  The validator runs after the build because it reads `public/shell/index.html`, which
  also proves Hugo actually ingested `scenarios.yaml`.

The ruleset is the part that actually enforces the policy. The workflows only report;
without the ruleset a red check is a suggestion, and a merge goes through anyway.

Two details in the ruleset worth knowing:

- **`strict_required_status_checks_policy: true`** – a branch must be up to date with
  `master` before it can merge. Without it, two PRs that each pass alone can merge in
  sequence and break `master` together. This is why PR #12 got `master` merged into it
  rather than being left on its original base.
- **`required_approving_review_count: 0`** – the `pull_request` rule is present because
  a required status check only has meaning if direct pushes are barred. It does not
  demand a reviewer, so solo work still flows; raise it to 1 if you want a second pair
  of eyes on top.

## Applying it

Not applied yet – it needs an authenticated admin. From the repo root:

```bash
gh auth login   # once, if `gh auth status` is empty
gh api --method POST /repos/belyaevsa/teamleads-2025/rulesets \
  --input .github/rulesets/master-requires-tests.json
```

Verify:

```bash
gh api /repos/belyaevsa/teamleads-2025/rulesets --jq '.[] | "\(.id)  \(.name)  \(.enforcement)"'
```

To change the policy later, edit the JSON and `PUT` it back to
`/repos/belyaevsa/teamleads-2025/rulesets/{id}` so the file stays the source of truth
rather than drifting from what the settings page says.

## The rule that makes this work

`test.yml` has **no `paths` filter on `pull_request`**. That looks wasteful – a
backend-only PR still builds the site, and a content-only PR still runs xUnit. It is
deliberate: a filtered-out check never reports, and GitHub reads "never reported" as
"not passed", so a `paths` filter on a gating check leaves every unrelated PR
permanently unmergeable. If the jobs ever grow slow enough that this hurts, the fix is a
path-filter job that reports the same check names with a skip result – not adding the
filter back.
