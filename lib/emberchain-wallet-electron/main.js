'use strict';
const { app, BrowserWindow, ipcMain, Menu, dialog, shell } = require('electron');
const path   = require('path');
const fs     = require('fs');
const https  = require('https');
const http   = require('http');
const { Worker } = require('worker_threads');

// ── ethers (CommonJS compat shim) ──────────────────────────────────────────
let ethers;
(async () => { ethers = await import('ethers'); })();

// ── Paths ──────────────────────────────────────────────────────────────────
const KEYSTORE_PATH = path.join(app.getPath('userData'), 'keystore.json');
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');
const DATA_DIR      = path.join(app.getPath('userData'), 'emberchain-data');

// ── Embedded node ──────────────────────────────────────────────────────────
const EMBEDDED_PORT = 17545;
const EMBEDDED_URL  = `http://127.0.0.1:${EMBEDDED_PORT}/api`;
let nodeEngine = null;   // loaded lazily inside whenReady()
let nodeRunning = false;
let statusTimer = null;

// ── Paths (ASAR-aware) ─────────────────────────────────────────────────────
// In a packaged app, Worker threads and large CJS bundles must live outside
// the ASAR archive (app.asar.unpacked). __dirname inside ASAR is a virtual
// path that Windows cannot open as a real file.
const UNPACKED_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'app.asar.unpacked')
  : __dirname;

// ── Mining worker ──────────────────────────────────────────────────────────
const WORKER_PATH = path.join(UNPACKED_DIR, 'mining-worker.js');
let miningWorker = null;

// ── Fallback remote nodes (used when embedded node is not running) ──────────
// These are all probed in parallel on startup; the one with the highest block
// height wins (latency used as tiebreaker when heights match).
// Add DuckDNS / local nodes here — they will be discovered automatically.
const FALLBACK_NODES = [
  'https://emberchain.org/api',
  'https://emberchain.duckdns.org/api',
  'https://po-w-chain.replit.app/api',  // last-resort fallback
];

// ── Settings helpers ───────────────────────────────────────────────────────
function loadSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')); }
  catch { return {}; }
}
function saveSettings(s) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(s, null, 2));
}

// ── Active node cache ──────────────────────────────────────────────────────
let _activeNode = null;
let _selectInFlight = null;   // deduplicate concurrent startup probes

function getActiveNode() {
  if (nodeRunning) return EMBEDDED_URL;
  return _activeNode || loadSettings().nodeUrl || FALLBACK_NODES[0];
}

// ── JSON fetch helper (http + https) ──────────────────────────────────────
function nodeRequest(url, method = 'GET', body = null, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const opts = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method,
      headers:  { 'Content-Type': 'application/json' },
      timeout:  timeoutMs,
    };
    const req = lib.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * Probe a single node: returns { base, height, latencyMs } or null if unreachable.
 * Uses /chain/status so we get block height + liveness in one round-trip.
 */
async function probeNodeHeight(base) {
  const t0 = Date.now();
  try {
    const r = await nodeRequest(`${base}/chain/status`, 'GET', null, 4000);
    if (r.status !== 200 || typeof r.body?.height !== 'number') return null;
    return { base, height: r.body.height, latencyMs: Date.now() - t0 };
  } catch {
    return null;
  }
}

/**
 * Probe all remote fallback nodes in parallel and cache the one with the highest
 * block height (latency as tiebreaker). Called once on startup or on failover.
 */
async function selectBestNode() {
  if (_selectInFlight) return _selectInFlight;
  _selectInFlight = (async () => {
    try {
      const settings = loadSettings();
      const saved = settings.nodeUrl?.replace(/\/$/, '') || null;
      // Always probe ALL candidates in parallel — saved + fallbacks — and pick
      // the one with the highest block height. Never short-circuit on the saved
      // node alone: it may be behind or stale even if it responds.
      const candidates = [...new Set([
        ...(saved ? [saved] : []),
        ...FALLBACK_NODES.map(u => u.replace(/\/$/, '')),
      ])];
      const probes = await Promise.all(candidates.map(probeNodeHeight));
      const live = probes
        .filter(Boolean)
        .sort((a, b) => b.height - a.height || a.latencyMs - b.latencyMs);
      if (!live.length) return null;
      _activeNode = live[0].base;
      return _activeNode;
    } finally {
      _selectInFlight = null;
    }
  })();
  return _selectInFlight;
}

/**
 * Smart request: embedded node first (if running), then best remote node by block height.
 */
async function smartRequest(reqPath, method = 'GET', body = null) {
  // Embedded node always wins when running
  if (nodeRunning) {
    try {
      return await nodeRequest(`${EMBEDDED_URL}${reqPath}`, method, body);
    } catch { /* fall through to remote */ }
  }

  // Ensure we've selected the best remote node
  if (!_activeNode) await selectBestNode();

  const settings = loadSettings();
  const seen = new Set();
  // Try best node first, then all fallbacks in case it went down
  const candidates = [
    _activeNode,
    settings.nodeUrl ? settings.nodeUrl.replace(/\/$/, '') : null,
    ...FALLBACK_NODES.map(u => u.replace(/\/$/, '')),
  ].filter(Boolean);

  for (const base of candidates) {
    if (seen.has(base)) continue;
    seen.add(base);
    try {
      const r = await nodeRequest(`${base}${reqPath}`, method, body);
      if (base !== _activeNode) {
        _activeNode = base;
        mainWindow?.webContents?.send('node:switched', base);
      }
      return r;
    } catch { /* try next */ }
  }

  // All nodes failed — force re-probe next call
  _activeNode = null;
  throw new Error('All nodes unreachable.');
}

// ── Main window ────────────────────────────────────────────────────────────
let mainWindow;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960, height: 660, minWidth: 800, minHeight: 540,
    title: 'EmberChain Desktop',
    backgroundColor: '#1a1a1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, 'build',
      process.platform === 'win32' ? 'icon.ico'
      : process.platform === 'darwin' ? 'icon.icns' : 'icon.png'),
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Push an initial "starting" status the moment the renderer DOM is ready so
  // the UI never sits in a blank/misleading state while the node boots.
  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow.webContents.send('node:status', {
      running: false, downloading: false, starting: true,
      height: 0, peerCount: 0, synced: false, syncProgress: 0, bestPeerHeight: 0,
      downloadError: null, port: EMBEDDED_PORT,
    });
  });

  const menuTemplate = [
    { label: 'File', submenu: [
        { label: 'Lock Wallet', accelerator: 'CmdOrCtrl+L', click: () => {
            unlockedWallet = null; mainWindow.webContents.send('wallet:locked');
          }
        },
        { type: 'separator' },
        { label: 'Backup Keystore…', click: async () => {
            if (!fs.existsSync(KEYSTORE_PATH)) {
              dialog.showMessageBox(mainWindow, { message: 'No keystore found.' }); return;
            }
            const { filePath } = await dialog.showSaveDialog(mainWindow, {
              defaultPath: 'emberchain-keystore.json',
              filters: [{ name: 'JSON', extensions: ['json'] }],
            });
            if (filePath) fs.copyFileSync(KEYSTORE_PATH, filePath);
          }
        },
        { type: 'separator' },
        { role: 'quit' },
      ]
    },
    { label: 'Help', submenu: [
        { label: 'EmberChain Website', click: () => shell.openExternal('https://emberchain.org') },
        { label: 'GitHub', click: () => shell.openExternal('https://github.com/RedPillPhil/Emberchain') },
        { type: 'separator' },
        { label: `About EmberChain Desktop v${app.getVersion()}`,
          click: () => dialog.showMessageBox(mainWindow, {
            title: 'EmberChain Desktop',
            message: `EmberChain Desktop\nVersion ${app.getVersion()}\n\nChain ID: 7773 · Currency: EMBR\nEmbedded node port: ${EMBEDDED_PORT}`,
            icon: path.join(__dirname, 'build', 'icon.png'),
          })
        },
      ]
    },
  ];
  if (process.platform === 'darwin') {
    menuTemplate.unshift({ label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }] });
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
}

// ── App startup ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  // Set env vars BEFORE requiring the node engine bundle so module-level code
  // in chain.ts and peers.ts picks them up correctly on first eval.
  fs.mkdirSync(DATA_DIR, { recursive: true });
  process.env.CHAIN_DATA_FILE = path.join(DATA_DIR, 'chain.json');
  process.env.PEER_LIST_FILE  = path.join(DATA_DIR, 'peers.json');
  process.env.SEED_PEERS      = 'https://emberchain.org';
  process.env.DATABASE_URL    = '';
  process.env.NODE_ENV        = 'production';
  process.env.NODE_URL        = (loadSettings().publicUrl || '').trim();
  process.env.PORT            = String(EMBEDDED_PORT);

  // ── Bundled snapshot preload ──────────────────────────────────────────────
  // If this is a fresh install (no chain.json yet) and the installer shipped
  // a chain-snapshot.json, copy it into place so the node engine boots
  // pre-synced instead of starting from genesis and downloading everything.
  const chainDataFile   = path.join(DATA_DIR, 'chain.json');
  const bundledSnapshot = path.join(UNPACKED_DIR, 'chain-snapshot.json');
  if (!fs.existsSync(chainDataFile) && fs.existsSync(bundledSnapshot)) {
    try {
      fs.copyFileSync(bundledSnapshot, chainDataFile);
      console.log('[main] Pre-loaded bundled chain snapshot → chain.json');
    } catch (err) {
      console.warn('[main] Could not copy bundled snapshot:', err.message);
    }
  }

  // Load the bundled node engine (must come from unpacked dir on Windows)
  const bundlePath = path.join(UNPACKED_DIR, 'node-engine-bundle.cjs');
  try {
    nodeEngine = require(bundlePath);
  } catch (err) {
    console.error('[main] node-engine-bundle.cjs failed to load:', err.message, '\nPath:', bundlePath);
  }

  // Create UI immediately — node starts in background
  createWindow();

  // Embedded node is opt-in — user starts it from Settings.
  // Auto-starting it causes the node to run full sync which saturates
  // the user's internet connection on slow/metered links.
  // (nodeEngine is still loaded so the user can start it on demand.)
});

app.on('window-all-closed', async () => {
  stopMining();
  if (nodeEngine && nodeRunning) await nodeEngine.stopEmbeddedNode().catch(() => {});
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ── Embedded node lifecycle ────────────────────────────────────────────────
function startEmbeddedNode() {
  if (!nodeEngine || nodeRunning) return;
  console.log('[main] Starting embedded node…');
  nodeEngine.startEmbeddedNode({ port: EMBEDDED_PORT, dataDir: DATA_DIR })
    .then(() => {
      nodeRunning = true;
      _activeNode = EMBEDDED_URL;
      console.log(`[main] Embedded node running on port ${EMBEDDED_PORT}`);
      pushNodeStatus();
    })
    .catch(err => {
      console.error('[main] Embedded node failed:', err.message);
      pushNodeStatus();
    });

  // Push live status every 3 seconds
  if (statusTimer) clearInterval(statusTimer);
  statusTimer = setInterval(pushNodeStatus, 3000);
}

function pushNodeStatus() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const status = nodeEngine ? nodeEngine.getNodeStatus() : { running: false, downloading: false };
    // Tell the renderer whether the wallet is using the local embedded node or
    // falling back to a remote — used to show "Local Node" vs "Remote" in UI.
    status.usingLocalNode = nodeRunning;
    mainWindow.webContents.send('node:status', status);
  } catch { /* window not ready yet */ }
}

// ── IPC: QR code ──────────────────────────────────────────────────────────
ipcMain.handle('wallet:qrcode', async (_e, text) => {
  const QRCode = require('qrcode');
  return QRCode.toDataURL(text, { width: 220, margin: 2, color: { dark: '#000000', light: '#ffffff' } });
});

// ── IPC: Settings ─────────────────────────────────────────────────────────
ipcMain.handle('settings:get', () => loadSettings());
ipcMain.handle('settings:set', (_e, patch) => {
  const s = { ...loadSettings(), ...patch };
  saveSettings(s);
  _activeNode = null;
  return s;
});

// Live-update the public URL without restarting the node
ipcMain.handle('node:apply-public-url', (_e, url) => {
  process.env.NODE_URL = (url || '').trim();
  pushNodeStatus();
  return { ok: true };
});

// ── IPC: Keystore / Wallet ────────────────────────────────────────────────
let unlockedWallet = null;

ipcMain.handle('wallet:exists',     () => fs.existsSync(KEYSTORE_PATH));
ipcMain.handle('wallet:is-unlocked', () => !!unlockedWallet);
ipcMain.handle('wallet:address',    () => unlockedWallet?.address ?? null);
ipcMain.handle('wallet:lock',       () => { unlockedWallet = null; });

ipcMain.handle('wallet:create', async (_e, password) => {
  await waitEthers();
  const wallet = ethers.Wallet.createRandom();
  fs.writeFileSync(KEYSTORE_PATH, await wallet.encrypt(password));
  unlockedWallet = wallet;
  return { address: wallet.address, mnemonic: wallet.mnemonic?.phrase || null };
});

ipcMain.handle('wallet:import-key', async (_e, keyOrMnemonic, password) => {
  await waitEthers();
  const trimmed = keyOrMnemonic.trim();
  const wallet = trimmed.split(' ').length >= 12
    ? ethers.Wallet.fromPhrase(trimmed)
    : new ethers.Wallet(trimmed.startsWith('0x') ? trimmed : '0x' + trimmed);
  fs.writeFileSync(KEYSTORE_PATH, await wallet.encrypt(password));
  unlockedWallet = wallet;
  return { address: wallet.address };
});

ipcMain.handle('wallet:import-keystore', async (_e, json, password) => {
  await waitEthers();
  const wallet = await ethers.Wallet.fromEncryptedJson(json, password);
  fs.writeFileSync(KEYSTORE_PATH, await wallet.encrypt(password));
  unlockedWallet = wallet;
  return { address: wallet.address };
});

ipcMain.handle('wallet:unlock', async (_e, password) => {
  await waitEthers();
  const ks = fs.readFileSync(KEYSTORE_PATH, 'utf8');
  try {
    unlockedWallet = await ethers.Wallet.fromEncryptedJson(ks, password);
    return { ok: true, address: unlockedWallet.address };
  } catch { return { ok: false, error: 'Wrong password' }; }
});

// ── IPC: Node ─────────────────────────────────────────────────────────────
ipcMain.handle('node:active-url',   () => getActiveNode());
ipcMain.handle('node:embedded-url', () => EMBEDDED_URL);
ipcMain.handle('node:status',       () => nodeEngine?.getNodeStatus() ?? { running: false, downloading: false });

ipcMain.handle('node:start', async () => {
  if (!nodeEngine) return { ok: false, error: 'Node engine not loaded' };
  startEmbeddedNode();
  return { ok: true };
});

ipcMain.handle('node:stop', async () => {
  stopMining();
  if (statusTimer) { clearInterval(statusTimer); statusTimer = null; }
  if (nodeEngine && nodeRunning) {
    await nodeEngine.stopEmbeddedNode().catch(() => {});
    nodeRunning = false;
    _activeNode = null;
  }
  pushNodeStatus();
  return { ok: true };
});

ipcMain.handle('node:test-url', async (_e, url) => {
  let base = (url || '').trim().replace(/\/$/, '');
  if (!base) return { ok: false, error: 'No URL entered.' };
  if (base.endsWith('/rpc')) {
    const corrected = base.slice(0, -4);
    try {
      const r = await nodeRequest(`${corrected}/sync/status`);
      if (r.status === 200 && r.body?.chainId)
        return { ok: false, error: `That's the MetaMask RPC URL — for the wallet use: ${corrected}` };
    } catch { /* fall through */ }
  }
  if (!base.endsWith('/api')) {
    try {
      const r2 = await nodeRequest(`${base}/api/sync/status`);
      if (r2.status === 200 && r2.body?.chainId)
        return { ok: false, error: `Almost! Use ${base}/api (add /api at the end)` };
    } catch { /* fall through */ }
  }
  try {
    const r = await nodeRequest(`${base}/sync/status`);
    if (r.status === 200 && r.body?.chainId)
      return { ok: true, height: r.body.latestBlock, chainId: r.body.chainId };
    return { ok: false, error: `Reached a server but it's not an Emberchain node. URL should end in /api.` };
  } catch (err) {
    return { ok: false, error: err.message?.includes('timeout') ? 'Connection timed out' : (err.message || 'Could not reach node.') };
  }
});

// ── IPC: Mining ────────────────────────────────────────────────────────────
ipcMain.on('mining:start', (_e, settings) => startMining(settings));
ipcMain.on('mining:stop',  () => stopMining());

function startMining(settings) {
  if (miningWorker) return;
  if (!fs.existsSync(WORKER_PATH)) {
    mainWindow?.webContents.send('mining:event', { type: 'error', msg: 'mining-worker.js not found' });
    return;
  }
  // Always mine against the best remote node — pool-miner style:
  //   fetch template → hash → submit share/block
  // Never use the local embedded node for mining, even if it's running.
  // This completely decouples mining traffic (tiny template + share requests)
  // from the embedded node's block-sync traffic (potentially hundreds of MB).
  const nodeUrl = _activeNode || settings.nodeUrl || 'https://po-w-chain.replit.app';
  miningWorker = new Worker(WORKER_PATH, {
    workerData: { nodeUrl, address: settings.address, intensity: settings.intensity },
  });
  miningWorker.on('message', msg => mainWindow?.webContents.send('mining:event', msg));
  miningWorker.on('error',   err => {
    mainWindow?.webContents.send('mining:event', { type: 'error', msg: err.message });
    miningWorker = null;
  });
  miningWorker.on('exit', () => {
    miningWorker = null;
    mainWindow?.webContents.send('mining:event', { type: 'stopped' });
  });
}

function stopMining() {
  const w = miningWorker;
  miningWorker = null;           // null immediately so restart works right away
  if (w) {
    try { w.postMessage('stop'); } catch { /* already gone */ }
    setTimeout(() => { try { w.terminate(); } catch { /* already gone */ } }, 3000);
  }
}

// ── IPC: Chain queries ────────────────────────────────────────────────────
ipcMain.handle('chain:balance', async (_e, address) => {
  const r = await smartRequest(`/wallets/${address}`);
  const body = r.body;
  if (body?.balance != null) {
    try { body.balance = Number(BigInt(String(body.balance).trim())) / 1e18; } catch { /* leave as-is */ }
  }
  return body;
});

ipcMain.handle('chain:transactions', async (_e, address) => {
  const r = await smartRequest(`/transactions?address=${address}&limit=50`);
  return r.body;
});

ipcMain.handle('chain:block-height', async () => {
  const r = await smartRequest('/rpc', 'POST', { jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 });
  const hex = r.body?.result;
  return hex ? parseInt(hex, 16) : null;
});

ipcMain.handle('chain:gas-price', async () => {
  const r = await smartRequest('/rpc', 'POST', { jsonrpc: '2.0', method: 'eth_gasPrice', params: [], id: 1 });
  const hex = r.body?.result;
  return hex ? BigInt(hex).toString() : '1000000000';
});

ipcMain.handle('chain:nonce', async (_e, address) => {
  const r = await smartRequest('/rpc', 'POST',
    { jsonrpc: '2.0', method: 'eth_getTransactionCount', params: [address, 'pending'], id: 1 });
  const hex = r.body?.result;
  return hex ? parseInt(hex, 16) : 0;
});

// ── IPC: Send ─────────────────────────────────────────────────────────────
ipcMain.handle('chain:send', async (_e, { to, amountEmbr, gasLimit }) => {
  await waitEthers();
  if (!unlockedWallet) return { ok: false, error: 'Wallet locked' };
  const [nonceRes, gpRes] = await Promise.all([
    smartRequest('/rpc', 'POST', { jsonrpc: '2.0', method: 'eth_getTransactionCount', params: [unlockedWallet.address, 'pending'], id: 1 }),
    smartRequest('/rpc', 'POST', { jsonrpc: '2.0', method: 'eth_gasPrice', params: [], id: 1 }),
  ]);
  const nonce    = parseInt(nonceRes.body?.result ?? '0x0', 16);
  const gasPrice = gpRes.body?.result ?? '0x3B9ACA00';
  const tx = { to, value: ethers.parseEther(String(amountEmbr)),
    gasLimit: BigInt(gasLimit ?? 21000), gasPrice: BigInt(gasPrice),
    nonce, chainId: 7773n };
  const signed    = await unlockedWallet.signTransaction(tx);
  const broadcast = await smartRequest('/rpc', 'POST',
    { jsonrpc: '2.0', method: 'eth_sendRawTransaction', params: [signed], id: 1 });
  if (broadcast.body?.error) return { ok: false, error: broadcast.body.error.message };
  return { ok: true, hash: broadcast.body?.result };
});

// ── IPC: Privacy / Shielded ───────────────────────────────────────────────
ipcMain.handle('privacy:balance', async () => {
  if (!unlockedWallet) return { ok: false, error: 'Wallet locked' };
  const r = await smartRequest('/privacy/balance', 'POST', { privateKey: unlockedWallet.privateKey });
  const body = r.body;
  // Convert wei → EMBR for any balance fields the API returns
  if (body) {
    for (const key of ['totalBalance', 'balance', 'shieldedBalance']) {
      if (body[key] != null) {
        try { body[key] = Number(BigInt(String(body[key]).trim())) / 1e18; } catch { /* leave as-is */ }
      }
    }
  }
  return body;
});
ipcMain.handle('privacy:shield', async (_e, { amountEmbr }) => {
  if (!unlockedWallet) return { ok: false, error: 'Wallet locked' };
  const r = await smartRequest('/privacy/shield', 'POST',
    { senderPrivateKey: unlockedWallet.privateKey, amount: Number(amountEmbr) });
  return r.body;
});
ipcMain.handle('privacy:send', async (_e, { recipientAddress, amountEmbr }) => {
  if (!unlockedWallet) return { ok: false, error: 'Wallet locked' };
  const r = await smartRequest('/privacy/send', 'POST',
    { senderPrivateKey: unlockedWallet.privateKey, recipientAddress, amount: Number(amountEmbr) });
  return r.body;
});
ipcMain.handle('privacy:unshield', async (_e, { amountEmbr }) => {
  if (!unlockedWallet) return { ok: false, error: 'Wallet locked' };
  const r = await smartRequest('/privacy/unshield', 'POST',
    { senderPrivateKey: unlockedWallet.privateKey, amount: Number(amountEmbr) });
  return r.body;
});
ipcMain.handle('privacy:transactions', async () => {
  const r = await smartRequest('/privacy/transactions');
  return r.body;
});

// ── Helpers ───────────────────────────────────────────────────────────────
function waitEthers(ms = 5000) {
  const deadline = Date.now() + ms;
  return new Promise((resolve, reject) => {
    const check = () => {
      if (ethers) return resolve();
      if (Date.now() > deadline) return reject(new Error('ethers failed to load'));
      setTimeout(check, 50);
    };
    check();
  });
}
