import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Root landing page — shown when someone visits http://localhost:8545 in a browser
app.get("/", (_req, res) => {
  const host = _req.headers.host ?? "localhost:8545";
  const rpcUrl = `http://${host}/api/rpc`;
  const explorerUrl = `http://${host}`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Emberchain Node</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0d0d0d;color:#e5e5e5;font-family:'Courier New',monospace;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
  .card{background:#161616;border:1px solid #f97316;border-radius:4px;padding:36px 40px;max-width:540px;width:100%}
  h1{color:#f97316;font-size:1.4rem;letter-spacing:.15em;text-transform:uppercase;margin-bottom:6px}
  .subtitle{color:#6b7280;font-size:.75rem;letter-spacing:.1em;text-transform:uppercase;margin-bottom:28px}
  .status{display:flex;align-items:center;gap:8px;margin-bottom:24px;font-size:.85rem}
  .dot{width:8px;height:8px;background:#22c55e;border-radius:50%;animation:pulse 2s infinite}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
  table{width:100%;border-collapse:collapse;font-size:.82rem;margin-bottom:24px}
  td{padding:6px 0;vertical-align:top}
  td:first-child{color:#9ca3af;width:140px;text-transform:uppercase;font-size:.72rem;letter-spacing:.08em;padding-top:8px}
  td:last-child{color:#f3f4f6;font-family:'Courier New',monospace;word-break:break-all}
  .val{background:#0d0d0d;border:1px solid #374151;border-radius:2px;padding:4px 8px;display:inline-block}
  .section{color:#9ca3af;font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;margin-bottom:10px;border-bottom:1px solid #1f2937;padding-bottom:4px}
  a{color:#f97316;text-decoration:none}a:hover{text-decoration:underline}
  .footer{margin-top:20px;font-size:.72rem;color:#4b5563;text-align:center}
</style>
</head>
<body>
<div class="card">
  <h1>🔥 Emberchain Node</h1>
  <div class="subtitle">Full node · Chain ID 7773</div>
  <div class="status"><span class="dot"></span> Node is running</div>

  <div class="section">Add to MetaMask</div>
  <table>
    <tr><td>Network</td><td><span class="val">Emberchain</span></td></tr>
    <tr><td>RPC URL</td><td><span class="val">${rpcUrl}</span></td></tr>
    <tr><td>Chain ID</td><td><span class="val">7773</span></td></tr>
    <tr><td>Currency</td><td><span class="val">EMBR</span></td></tr>
    <tr><td>Explorer</td><td><span class="val"><a href="${explorerUrl}">${explorerUrl}</a></span></td></tr>
  </table>

  <div class="section">Quick links</div>
  <table>
    <tr><td>RPC endpoint</td><td><a href="${rpcUrl}">${rpcUrl}</a></td></tr>
    <tr><td>Chain status</td><td><a href="http://${host}/api/chain/status">http://${host}/api/chain/status</a></td></tr>
    <tr><td>Top wallets</td><td><a href="http://${host}/api/wallets">http://${host}/api/wallets</a></td></tr>
    <tr><td>Mining status</td><td><a href="http://${host}/api/mining/status">http://${host}/api/mining/status</a></td></tr>
  </table>

  <div class="footer">Press Ctrl+C in the terminal to stop the node</div>
</div>
</body>
</html>`);
});

export default app;
