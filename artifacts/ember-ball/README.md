# Ember Ball

Crypto basketball GM built on the [ZenGM](https://github.com/zengm-games/zengm) engine, rebranded for Emberchain with wallet login, live EMBR supply fees, and league creation tied to chain height.

## Deploy

Built and staged by the main Emberchain static deploy:

```bash
node scripts/build-vercel.mjs
# or on the seed server:
bash scripts/deploy-vm/deploy-static-from-git.sh
```

The production bundle is served at **https://emberchain.org/ember-ball/**.

## Local dev (Crypto League — Draft Day GM UI)

```bash
cd artifacts/ember-ball
pnpm install
pnpm run crypto:web
```

Open `http://localhost:PORT/` (crypto league boots automatically). For production build:

```bash
node scripts/build-ember-ball.mjs
```
