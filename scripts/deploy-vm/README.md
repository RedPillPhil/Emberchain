# Host the website on your seed server (recommended)

Netlify and Vercel free tiers burn through **bandwidth** fast (~1 MB JS bundle × every visitor × auto-deploys).
Your seed server already runs **chain-node** — serve the static wallet from nginx on the same box for **zero extra hosting cost**.

## Why duckdns / seed server (not GitHub Pages)

| | Seed server + nginx | GitHub Pages |
|---|---|---|
| Cost | Already paying for VM | Free |
| API | Same origin `/api` → local chain-node | Cross-origin to duckdns only |
| Bandwidth | Your VM quota (much larger) | 100 GB/mo soft limit |
| Deploy | `git pull && bash deploy-static-from-git.sh` | GitHub Actions + DNS |
| emberchain.org | Point A record to VM IP | CNAME to github.io |

**GitHub Pages works** as a static-only fallback, but the seed server is simpler because API and UI share one domain.

## One-time setup on the seed server

```bash
# 1. Install nginx + certbot (if missing)
apt-get update && apt-get install -y nginx certbot python3-certbot-nginx rsync

# 2. Clone or use existing repo
cd /root/Emberchain/emberchain
git pull origin main

# 3. Build and publish static files + install nginx config
bash scripts/deploy-vm/deploy-static-from-git.sh

# 4. SSL (after DNS points here)
certbot --nginx -d emberchain.org -d www.emberchain.org -d emberchain.duckdns.org \
  --non-interactive --agree-tos -m admin@emberchain.org
```

## DNS — point emberchain.org at the seed server

At your domain registrar, set:

| Type | Name | Value |
|------|------|-------|
| A | `@` | `<seed-server-public-IP>` |
| A | `www` | `<seed-server-public-IP>` |

Remove Netlify/Vercel DNS records (CNAME, ALIAS, etc.) so traffic stops hitting paused hosts.

`emberchain.duckdns.org` already points at this server.

## After every frontend push

```bash
cd /root/Emberchain/emberchain
bash scripts/deploy-vm/deploy-static-from-git.sh
```

Chain-node code changes still need:

```bash
pnpm --filter @workspace/chain-node run build
sudo systemctl restart emberchain-node
```

## Verify

```bash
curl -I https://emberchain.org/
curl -s https://emberchain.org/api/healthz
curl -I https://emberchain.org/ember-delta/
```

## Self-hosted checklist (after leaving Netlify/Vercel)

1. **DNS** — `emberchain.org` A records → seed server IP (not Netlify)
2. **nginx** — `/api/` proxies to `127.0.0.1:8080` (match `PORT` in `emberchain-node.service`)
3. **WebSocket** — nginx config includes `Upgrade` / `Connection` headers (community live chat)
4. **Redeploy static site** after every frontend push — Netlify auto-deploy no longer runs:
   ```bash
   bash scripts/deploy-vm/deploy-static-from-git.sh
   ```
5. **chain-node** — `systemctl status emberchain-node` active; `/api/healthz` returns JSON not 502
6. **Hard refresh** browser (Ctrl+Shift+R) after deploy — old JS may still call duckdns or broken proxies

Frontend detects self-hosted hosts (`emberchain.org`, `emberchain.duckdns.org`) and uses same-origin `/api` automatically — no env vars needed if you redeploy the latest build.

## What caused Netlify/Vercel limits

1. **Large bundles** — wallet + ember-delta JS is ~1 MB gzipped per load
2. **Auto-deploy on every git push** — burns build minutes
3. **Netlify `/api/*` proxy** — doubled bandwidth (even though clients mostly bypass it)
4. **30s polling** on DEX/order book — many API calls per active user

Hosting static files on nginx and proxying `/api` locally removes the CDN middleman entirely.
