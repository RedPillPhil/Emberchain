'use strict';

const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');
const net = require('net');

// ── Port: use a high, unique port so it doesn't clash with the standalone node ─
const PORT = 45731;

// ── Loading screen shown while the embedded node boots ─────────────────────────
const LOADING_HTML = `data:text/html;charset=utf-8,${encodeURIComponent(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Emberchain</title><style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0d0d0d;color:#f97316;font-family:'Courier New',monospace;
     display:flex;flex-direction:column;align-items:center;justify-content:center;
     height:100vh;gap:20px;user-select:none;-webkit-app-region:drag}
.flame{font-size:56px;animation:bob 2s ease-in-out infinite}
@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
h1{font-size:1.1rem;letter-spacing:.25em;text-transform:uppercase}
.bar{width:220px;height:2px;background:#1f2937;border-radius:1px;overflow:hidden}
.fill{height:100%;background:linear-gradient(90deg,#f97316,#fb923c);
      animation:prog 2.4s ease-in-out infinite}
@keyframes prog{0%{width:0%;margin-left:0}65%{width:85%;margin-left:0}
               80%{width:85%;margin-left:0}100%{width:0%;margin-left:100%}}
p{font-size:.65rem;color:#4b5563;letter-spacing:.18em;text-transform:uppercase}
</style></head><body>
<div class="flame">🔥</div>
<h1>Emberchain Wallet</h1>
<div class="bar"><div class="fill"></div></div>
<p id="status">Starting node…</p>
</body></html>`)}`;

function errHtml(msg) {
  return `data:text/html;charset=utf-8,${encodeURIComponent(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0d0d0d;color:#ef4444;font-family:'Courier New',monospace;
     display:flex;align-items:center;justify-content:center;height:100vh}
.box{text-align:center;max-width:520px;padding:32px}
h2{font-size:1.2rem;margin-bottom:12px;letter-spacing:.1em}
pre{color:#9ca3af;font-size:.75rem;line-height:1.7;white-space:pre-wrap;word-break:break-all;
    background:#111;padding:12px;border-radius:4px;border:1px solid #1f2937;text-align:left}
button{margin-top:20px;padding:8px 20px;background:#111;color:#f97316;
       border:1px solid #f97316;font-family:inherit;font-size:.8rem;
       letter-spacing:.1em;cursor:pointer;border-radius:2px}
button:hover{background:#1a1a1a}
</style></head><body><div class="box">
<h2>⚠ Failed to Start Node</h2>
<pre>${msg.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>
<button onclick="window.location.reload()">Retry</button>
</div></body></html>`)}`;
}

// ── Server lifecycle ────────────────────────────────────────────────────────────
let serverImported = false;

async function startServer() {
  if (serverImported) return;
  serverImported = true;

  // Paths differ between packaged app and dev mode
  const isPkg = app.isPackaged;
  const resourcesPath = isPkg ? process.resourcesPath : path.join(__dirname, '..', '..', 'artifacts', 'api-server', 'dist');
  const walletUiPath  = isPkg
    ? path.join(process.resourcesPath, 'wallet-ui')
    : path.join(__dirname, '..', '..', 'artifacts', 'wallet', 'dist', 'public');
  const serverEntry   = isPkg
    ? path.join(process.resourcesPath, 'server.mjs')
    : path.join(resourcesPath, 'index.mjs');

  // Set env vars BEFORE importing — the server reads these at module init time
  process.env.PORT             = String(PORT);
  process.env.NODE_ENV         = 'production';
  process.env.WALLET_STATIC_DIR = walletUiPath;
  process.env.CHAIN_DATA_FILE  = path.join(app.getPath('userData'), 'emberchain.json');
  // Disable DB and bridge features that aren't needed in desktop mode
  process.env.DATABASE_URL          = process.env.DATABASE_URL ?? '';
  process.env.BASE_RPC_URL          = process.env.BASE_RPC_URL ?? '';
  process.env.BRIDGE_RELAYER_PRIVATE_KEY = process.env.BRIDGE_RELAYER_PRIVATE_KEY ?? '';

  // Dynamic import — runs in Electron's built-in Node.js, no external Node needed
  await import(`file://${serverEntry.replace(/\\/g, '/')}`);
}

function waitForServer(timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const attempt = () => {
      if (Date.now() > deadline) {
        return reject(new Error(`Node did not start within ${timeoutMs / 1000}s`));
      }
      const sock = net.createConnection(PORT, '127.0.0.1');
      sock.once('connect', () => { sock.destroy(); resolve(); });
      sock.once('error', () => setTimeout(attempt, 350));
    };
    attempt();
  });
}

// ── Window ─────────────────────────────────────────────────────────────────────
let win = null;

async function createWindow() {
  const iconPath = path.join(__dirname, 'build',
    process.platform === 'win32' ? 'icon.ico'
    : process.platform === 'darwin' ? 'icon.icns'
    : 'icon.png');

  win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 620,
    backgroundColor: '#0d0d0d',
    icon: iconPath,
    title: 'Emberchain Wallet',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  // Remove menu bar on Windows / Linux
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);

  // Show loading screen right away so the user sees something immediately
  await win.loadURL(LOADING_HTML);
  win.show();

  try {
    await startServer();
    await waitForServer();
    await win.loadURL(`http://localhost:${PORT}`);
  } catch (err) {
    await win.loadURL(errHtml(String(err?.message ?? err)));
  }

  // Open external links in the system browser, not Electron
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(`http://localhost:${PORT}`)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.on('closed', () => { win = null; });
}

// ── App events ─────────────────────────────────────────────────────────────────
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (!win) createWindow();
});
