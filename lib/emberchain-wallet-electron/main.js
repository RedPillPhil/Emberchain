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

// ── ASAR-aware path for mining worker ─────────────────────────────────────
// Worker threads must live outside the ASAR archive on Windows.
const UNPACKED_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'app.asar.unpacked')
  : __dirname;
const WORKER_PATH = path.join(UNPACKED_DIR, 'mining-worker.js');
let miningWorker = null;

// ── Remote nodes ──────────────────────────────────────────────────────────
// Probed in parallel on startup; the one with the highest block height wins.
const FALLBACK_NODES = [
  'https://emberchain.org/api',
  'https://emberchain.duckdns.org/api',
  'https://po-w-chain.replit.app/api',
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
let _selectInFlight = null;

function getActiveNode() {
  return _activeNode || loadSettings().cachedNode || loadSettings().nodeUrl || FALLBACK_NODES[0];
}

function saveCachedNode(base) {
  try {
    const s = loadSettings();
    if (s.cachedNode !== base) saveSettings({ ...s, cachedNode: base });
  } catch { /* non-fatal */ }
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

async function selectBestNode() {
  if (_selectInFlight) return _selectInFlight;
  _selectInFlight = (async () => {
    try {
      const settings = loadSettings();
      const saved    = settings.nodeUrl?.replace(/\/$/, '')    || null;
      const cached   = settings.cachedNode?.replace(/\/$/, '') || null;

      if (cached) {
        const result = await probeNodeHeight(cached);
        if (result) { _activeNode = cached; return _activeNode; }
        saveCachedNode(null);
      }

      const candidates = [...new Set([
        ...(saved  ? [saved]  : []),
        ...FALLBACK_NODES.map(u => u.replace(/\/$/, '')),
      ])];
      const probes = await Promise.all(candidates.map(probeNodeHeight));
      const live = probes
        .filter(Boolean)
        .sort((a, b) => b.height - a.height || a.latencyMs - b.latencyMs);
      if (!live.length) return null;
      _activeNode = live[0].base;
      saveCachedNode(_activeNode);
      return _activeNode;
    } finally {
      _selectInFlight = null;
    }
  })();
  return _selectInFlight;
}

async function smartRequest(reqPath, method = 'GET', body = null) {
  if (!_activeNode) await selectBestNode();

  const settings = loadSettings();
  const seen = new Set();
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
        saveCachedNode(base);
        mainWindow?.webContents?.send('node:switched', base);
      }
      return r;
    } catch { /* try next */ }
  }

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
            message: `EmberChain Desktop\nVersion ${app.getVersion()}\n\nChain ID: 7773 · Currency: EMBR`,
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
app.whenReady().then(() => {
  createWindow();
});

app.on('window-all-closed', () => {
  stopMining();
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ── IPC: QR code ──────────────────────────────────────────────────────────
ipcMain.handle('wallet:qrcode', async (_e, text) => {
  const QRCode = require('qrcode');
  return QRCode.toDataURL(text, { width: 220, margin: 2, color: { dark: '#000000', light: '#ffffff' } });
});

// ── IPC: Settings ─────────────────────────────────────────────────────────
ipcMain.handle('settings:get', () => loadSettings());
ipcMain.handle('settings:set', (_e, patch) => {
  const prev = loadSettings();
  const s = { ...prev, ...patch };
  saveSettings(s);
  if (patch.nodeUrl !== undefined && patch.nodeUrl !== prev.nodeUrl) {
    _activeNode = null;
    s.cachedNode = null;
    saveSettings(s);
  }
  return s;
});

// ── IPC: Keystore / Wallet ────────────────────────────────────────────────
let unlockedWallet = null;

ipcMain.handle('wallet:exists',      () => fs.existsSync(KEYSTORE_PATH));
ipcMain.handle('wallet:is-unlocked', () => !!unlockedWallet);
ipcMain.handle('wallet:address',     () => unlockedWallet?.address ?? null);
ipcMain.handle('wallet:lock',        () => { unlockedWallet = null; });

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

// ── IPC: Node connection ───────────────────────────────────────────────────
ipcMain.handle('node:active-url', () => getActiveNode());

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
  const nodeUrl = _activeNode || settings.nodeUrl || 'https://emberchain.org/api';
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
  miningWorker = null;
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
