/**
 * Canonical API base URL for the api-server.
 *
 * All api-server routes (/api/dex/*, /api/wallets/*, /api/bridge/*, …) are
 * served from the Replit root path. In dev, the Replit proxy routes /api/*
 * directly to the api-server workflow, so an empty prefix works. In
 * production the api-server is reachable at po-w-chain.replit.app.
 *
 * Do NOT use /api-server/api/* — the Replit proxy does not forward that
 * prefix to the api-server from the browser (it hits the Vite SPA fallback).
 */
export const API = import.meta.env.PROD ? 'https://emberchain.org' : '';
