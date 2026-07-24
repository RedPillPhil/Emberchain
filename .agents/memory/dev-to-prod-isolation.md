---
name: Dev-to-production network isolation
description: Replit dev containers cannot reach the same Replit project's production deployment — all requests time out (STATUS:000) or are firewalled. This gives false negatives when testing production from inside the dev environment.
---

## Rule
Never curl or fetch the project's own production URL (*.replit.app or custom domain) from inside the Replit dev container or CodeExecution sandbox. All requests will silently time out regardless of whether the production site is actually working.

**Why:** Replit's network topology isolates dev containers from production VMs. This is an anti-loop / security measure. It is NOT a sign the site is down.

## How to apply
- Use `webSearch({ query: "site:yourdomain.com" })` in CodeExecution to get external HTTP responses — this routes outside the Replit network and gives accurate results.
- Use `fetchDeploymentLogs()` to confirm the production server is handling traffic.
- Use `getDeploymentInfo()` to check `hasSuccessfulBuild` and `isDeployed`.
- Never diagnose "site is down" based on curl timeouts from inside the dev container.

## Example false positives caught
- `curl https://emberchain.org/api/healthz` → STATUS:000 even though external miners were submitting 66 req/s successfully
- `fetch("https://emberchain.org/")` in CodeExecution → aborted, even though webSearch confirmed the wallet HTML was being served correctly
