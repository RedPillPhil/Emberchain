const { app, BrowserWindow, ipcMain, Menu, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

// ── ethers (CommonJS compat shim) ─────────────────────────────────────────
let ethers;
(async () => { ethers = await import('ethers'); })();

// ── Paths ─────────────────────────────────────────────────────────────────
const KEYSTORE_PATH = path.join(app.getPath('userData'), 'keystore.json');
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');

// ── In-memory wallet (unlocked key) ──────────────────────────────────────
let unlockedWallet = null;   // ethers.Wallet when unlocked

// ── Known fallback nodes ──────────────────────────────────────────────────
// Tried in order when the configured node is unreachable.
// Community operators: run a node with --url and submit a PR to add yours here.
const FALLBACK_NODES = [
  'https://emberchain.org/api',
  // e.g. 'https://node1.example.com/api',
];

// ── Settings helpers ──────────────────────────────────────────────────────
function loadSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')); }
  catch { return { nodeUrl: FALLBACK_NODES[0] }; }
}
function saveSettings(s) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(s, null, 2));
}

/**
 * Try the saved node URL first, then fall through FALLBACK_NODES until one
 * responds. Returns the working base URL (no trailing slash), or null.
 * Auto-saves the working URL so next requests go there directly.
 */
async function resolveWorkingNode() {
  const settings  = loadSettings();
  const primary   = (settings.nodeUrl || '').replace(/\/$/, '');
  const seen      = new Set();
  const candidates = [primary, ...FALLBACK_NODES.map(u => u.replace(/\/$/, ''))].filter(Boolean);
  for (const url of candidates) {
    if (seen.has(url)) continue;
    seen.add(url);
    try {
      const r = await nodeRequest(`${url}/sync/status`);
      if (r.status === 200) {
        if (url !== primary) {
          saveSettings({ ...settings, nodeUrl: url });
        }
        return url;
      }
    } catch { /* unreachable — try next */ }
  }
  return null;
}

// ── Active node cache ─────────────────────────────────────────────────────
// Stores the last known-good node URL so we don't re-probe on every request.
let _activeNode = null;
function getActiveNode() { return _activeNode || loadSettings().nodeUrl || FALLBACK_NODES[0]; }
function setActiveNode(url) { _activeNode = url; }

// ── JSON fetch helper (works http + https) ────────────────────────────────
function nodeRequest(url, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const opts = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers: { 'Content-Type': 'application/json' },
      timeout: 12000,
    };
    const req = lib.request(opts, (res) => {
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
 * Like nodeRequest() but automatically falls through to backup nodes when
 * the primary is unreachable. Updates the active node cache on success.
 * path    — e.g. '/rpc' (no base URL)
 * method  — HTTP method
 * body    — request body (will be JSON-encoded)
 */
async function smartRequest(path, method = 'GET', body = null) {
  const settings  = loadSettings();
  const primary   = (settings.nodeUrl || '').replace(/\/$/, '');
  const seen      = new Set();
  // Try: cached active → saved primary → fallbacks in order
  const candidates = [_activeNode, primary, ...FALLBACK_NODES.map(u => u.replace(/\/$/, ''))]
    .filter(Boolean);

  for (const base of candidates) {
    if (seen.has(base)) continue;
    seen.add(base);
    try {
      const r = await nodeRequest(`${base}${path}`, method, body);
      // Treat any response (even 4xx) as "node is reachable"
      if (base !== _activeNode) {
        setActiveNode(base);
        if (base !== primary) {
          // Persist the working fallback so next startup goes there first
          saveSettings({ ...settings, nodeUrl: base });
          // Notify the renderer that we switched nodes
          mainWindow?.webContents?.send('node:switched', base);
        }
      }
      return r;
    } catch {
      /* unreachable — try next */
    }
  }
  throw new Error('All nodes unreachable. Check your connection or add a node in Settings.');
}

// ── Main window ───────────────────────────────────────────────────────────
let mainWindow;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 640,
    minWidth: 720,
    minHeight: 500,
    title: 'Emberchain Wallet',
    backgroundColor: '#1a1a1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico'
                                     : process.platform === 'darwin' ? 'icon.icns'
                                     : 'icon.png'),
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Native app menu
  const menuTemplate = [
    {
      label: 'File',
      submenu: [
        { label: 'Lock Wallet', accelerator: 'CmdOrCtrl+L', click: () => {
            unlockedWallet = null;
            mainWindow.webContents.send('wallet:locked');
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
      ],
    },
    {
      label: 'Settings',
      submenu: [
        { label: 'Network / Node URL…', click: () => mainWindow.webContents.send('open:settings') },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Emberchain Website', click: () => shell.openExternal('https://emberchain.io') },
        { label: 'View on GitHub', click: () => shell.openExternal('https://github.com/RedPillPhil/Emberchain') },
        { type: 'separator' },
        { label: `About Emberchain Wallet v${app.getVersion()}`,
          click: () => dialog.showMessageBox(mainWindow, {
            title: 'Emberchain Wallet',
            message: `Emberchain Wallet\nVersion ${app.getVersion()}\n\nChain ID: 7773 · Currency: EMBR`,
            icon: path.join(__dirname, 'build', 'icon.png'),
          })
        },
      ],
    },
  ];
  if (process.platform === 'darwin') {
    menuTemplate.unshift({ label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }] });
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ─────────────────────────────────────────────────────────────────────────
// IPC: QR code
// ─────────────────────────────────────────────────────────────────────────
ipcMain.handle('wallet:qrcode', async (_e, text) => {
  const QRCode = require('qrcode');
  return QRCode.toDataURL(text, { width: 220, margin: 2, color: { dark: '#000000', light: '#ffffff' } });
});

// ─────────────────────────────────────────────────────────────────────────
// IPC: Settings
// ─────────────────────────────────────────────────────────────────────────
ipcMain.handle('settings:get', () => loadSettings());
ipcMain.handle('settings:set', (_e, patch) => {
  const s = { ...loadSettings(), ...patch };
  saveSettings(s);
  // Reset the active-node cache so smartRequest re-probes on the next call
  _activeNode = null;
  return s;
});

// ─────────────────────────────────────────────────────────────────────────
// IPC: Keystore / Wallet
// ─────────────────────────────────────────────────────────────────────────
ipcMain.handle('wallet:exists', () => fs.existsSync(KEYSTORE_PATH));

ipcMain.handle('wallet:create', async (_e, password) => {
  await waitEthers();
  const wallet = ethers.Wallet.createRandom();
  const ks = await wallet.encrypt(password);
  fs.writeFileSync(KEYSTORE_PATH, ks);
  unlockedWallet = wallet;
  return { address: wallet.address, mnemonic: wallet.mnemonic?.phrase || null };
});

ipcMain.handle('wallet:import-key', async (_e, privateKeyOrMnemonic, password) => {
  await waitEthers();
  let wallet;
  const trimmed = privateKeyOrMnemonic.trim();
  if (trimmed.split(' ').length >= 12) {
    wallet = ethers.Wallet.fromPhrase(trimmed);
  } else {
    wallet = new ethers.Wallet(trimmed.startsWith('0x') ? trimmed : '0x' + trimmed);
  }
  const ks = await wallet.encrypt(password);
  fs.writeFileSync(KEYSTORE_PATH, ks);
  unlockedWallet = wallet;
  return { address: wallet.address };
});

ipcMain.handle('wallet:import-keystore', async (_e, keystoreJson, password) => {
  await waitEthers();
  const wallet = await ethers.Wallet.fromEncryptedJson(keystoreJson, password);
  const ks = await wallet.encrypt(password);
  fs.writeFileSync(KEYSTORE_PATH, ks);
  unlockedWallet = wallet;
  return { address: wallet.address };
});

ipcMain.handle('wallet:unlock', async (_e, password) => {
  await waitEthers();
  const ks = fs.readFileSync(KEYSTORE_PATH, 'utf8');
  try {
    unlockedWallet = await ethers.Wallet.fromEncryptedJson(ks, password);
    return { ok: true, address: unlockedWallet.address };
  } catch {
    return { ok: false, error: 'Wrong password' };
  }
});

ipcMain.handle('wallet:lock', () => { unlockedWallet = null; });
ipcMain.handle('wallet:is-unlocked', () => !!unlockedWallet);
ipcMain.handle('wallet:address', () => unlockedWallet?.address ?? null);
ipcMain.handle('wallet:private-key', () => unlockedWallet?.privateKey ?? null);

// ─────────────────────────────────────────────────────────────────────────
// IPC: Node status — lets the renderer know which node is active
// ─────────────────────────────────────────────────────────────────────────
ipcMain.handle('node:active-url', () => getActiveNode());

ipcMain.handle('node:test-url', async (_e, url) => {
  let base = (url || '').trim().replace(/\/$/, '');
  if (!base) return { ok: false, error: 'No URL entered.' };

  // Common mistake: user pastes the MetaMask RPC URL which ends in /rpc.
  // Strip it and test the correct /api base instead.
  if (base.endsWith('/rpc')) {
    const corrected = base.slice(0, -4); // remove /rpc
    try {
      const r = await nodeRequest(`${corrected}/sync/status`);
      if (r.status === 200 && r.body?.chainId) {
        return { ok: false, error: `That's the MetaMask RPC URL — for the wallet use: ${corrected}` };
      }
    } catch { /* fall through */ }
  }

  // Common mistake: user pastes a URL without /api (e.g. https://emberchain.org).
  // Try appending /api automatically.
  if (!base.endsWith('/api')) {
    try {
      const r2 = await nodeRequest(`${base}/api/sync/status`);
      if (r2.status === 200 && r2.body?.chainId) {
        return { ok: false, error: `Almost! Use ${base}/api (add /api at the end)` };
      }
    } catch { /* fall through */ }
  }

  try {
    const r = await nodeRequest(`${base}/sync/status`);
    if (r.status === 200 && r.body?.chainId) {
      return { ok: true, height: r.body.latestBlock, chainId: r.body.chainId };
    }
    return { ok: false, error: `Reached a server but it's not an Emberchain node (status ${r.status}). URL should end in /api — e.g. http://localhost:8545/api` };
  } catch (err) {
    return { ok: false, error: err.message?.includes('timeout') ? 'Connection timed out — is the node running?' : (err.message || 'Could not reach node.') };
  }
});

// ─────────────────────────────────────────────────────────────────────────
// IPC: Chain queries  (all use smartRequest — auto-failover to backup nodes)
// ─────────────────────────────────────────────────────────────────────────
ipcMain.handle('chain:balance', async (_e, address) => {
  const r = await smartRequest(`/wallets/${address}`);
  const body = r.body;
  if (body?.balance != null) {
    try {
      const weiStr = String(body.balance).trim();
      body.balance = Number(BigInt(weiStr)) / 1e18;
    } catch { /* leave as-is */ }
  }
  return body;
});

ipcMain.handle('chain:transactions', async (_e, address) => {
  const r = await smartRequest(`/transactions?address=${address}&limit=50`);
  return r.body;
});

ipcMain.handle('chain:block-height', async () => {
  const r = await smartRequest('/rpc', 'POST',
    { jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 });
  const hex = r.body?.result;
  return hex ? parseInt(hex, 16) : null;
});

ipcMain.handle('chain:gas-price', async () => {
  const r = await smartRequest('/rpc', 'POST',
    { jsonrpc: '2.0', method: 'eth_gasPrice', params: [], id: 1 });
  const hex = r.body?.result;
  return hex ? BigInt(hex).toString() : '1000000000';
});

ipcMain.handle('chain:nonce', async (_e, address) => {
  const r = await smartRequest('/rpc', 'POST',
    { jsonrpc: '2.0', method: 'eth_getTransactionCount', params: [address, 'pending'], id: 1 });
  const hex = r.body?.result;
  return hex ? parseInt(hex, 16) : 0;
});

// ─────────────────────────────────────────────────────────────────────────
// IPC: Send (sign in main process, broadcast)
// ─────────────────────────────────────────────────────────────────────────
ipcMain.handle('chain:send', async (_e, { to, amountEmbr, gasLimit }) => {
  await waitEthers();
  if (!unlockedWallet) return { ok: false, error: 'Wallet locked' };

  const [nonceRes, gpRes] = await Promise.all([
    smartRequest('/rpc', 'POST',
      { jsonrpc: '2.0', method: 'eth_getTransactionCount', params: [unlockedWallet.address, 'pending'], id: 1 }),
    smartRequest('/rpc', 'POST',
      { jsonrpc: '2.0', method: 'eth_gasPrice', params: [], id: 1 }),
  ]);
  const nonce    = parseInt(nonceRes.body?.result ?? '0x0', 16);
  const gasPrice = gpRes.body?.result ?? '0x3B9ACA00';

  const tx = {
    to,
    value: ethers.parseEther(String(amountEmbr)),
    gasLimit: BigInt(gasLimit ?? 21000),
    gasPrice: BigInt(gasPrice),
    nonce,
    chainId: 7773n,
  };
  const signed    = await unlockedWallet.signTransaction(tx);
  const broadcast = await smartRequest('/rpc', 'POST',
    { jsonrpc: '2.0', method: 'eth_sendRawTransaction', params: [signed], id: 1 });
  if (broadcast.body?.error) return { ok: false, error: broadcast.body.error.message };
  return { ok: true, hash: broadcast.body?.result };
});

// ─────────────────────────────────────────────────────────────────────────
// IPC: Privacy / Shielded
// ─────────────────────────────────────────────────────────────────────────
ipcMain.handle('privacy:balance', async () => {
  if (!unlockedWallet) return { ok: false, error: 'Wallet locked' };
  const r = await smartRequest('/privacy/balance', 'POST',
    { privateKey: unlockedWallet.privateKey });
  return r.body;
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

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────
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
