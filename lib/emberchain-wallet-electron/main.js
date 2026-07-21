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

// ── Settings helpers ──────────────────────────────────────────────────────
function loadSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')); }
  catch { return { nodeUrl: 'https://emberchain.org/api' }; }
}
function saveSettings(s) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(s, null, 2));
}

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
// IPC: Chain queries
// ─────────────────────────────────────────────────────────────────────────
ipcMain.handle('chain:balance', async (_e, address) => {
  const { nodeUrl } = loadSettings();
  const r = await nodeRequest(`${nodeUrl}/wallets/${address}`);
  const body = r.body;
  // API returns balance as raw wei string; convert to EMBR for display
  if (body?.balance != null) {
    try {
      const weiStr = String(body.balance).trim();
      body.balance = Number(BigInt(weiStr)) / 1e18;
    } catch { /* leave as-is if already a float */ }
  }
  return body;
});

ipcMain.handle('chain:transactions', async (_e, address) => {
  const { nodeUrl } = loadSettings();
  const r = await nodeRequest(`${nodeUrl}/transactions?address=${address}&limit=50`);
  return r.body;
});

ipcMain.handle('chain:block-height', async () => {
  const { nodeUrl } = loadSettings();
  const r = await nodeRequest(`${nodeUrl}/rpc`, 'POST',
    { jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 });
  const hex = r.body?.result;
  return hex ? parseInt(hex, 16) : null;
});

ipcMain.handle('chain:gas-price', async () => {
  const { nodeUrl } = loadSettings();
  const r = await nodeRequest(`${nodeUrl}/rpc`, 'POST',
    { jsonrpc: '2.0', method: 'eth_gasPrice', params: [], id: 1 });
  const hex = r.body?.result;
  return hex ? BigInt(hex).toString() : '1000000000';
});

ipcMain.handle('chain:nonce', async (_e, address) => {
  const { nodeUrl } = loadSettings();
  const r = await nodeRequest(`${nodeUrl}/rpc`, 'POST',
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
  const { nodeUrl } = loadSettings();

  // get nonce + gas price
  const [nonceRes, gpRes] = await Promise.all([
    nodeRequest(`${nodeUrl}/rpc`, 'POST',
      { jsonrpc: '2.0', method: 'eth_getTransactionCount', params: [unlockedWallet.address, 'pending'], id: 1 }),
    nodeRequest(`${nodeUrl}/rpc`, 'POST',
      { jsonrpc: '2.0', method: 'eth_gasPrice', params: [], id: 1 }),
  ]);
  const nonce = parseInt(nonceRes.body?.result ?? '0x0', 16);
  const gasPrice = gpRes.body?.result ?? '0x3B9ACA00';

  const tx = {
    to,
    value: ethers.parseEther(String(amountEmbr)),
    gasLimit: BigInt(gasLimit ?? 21000),
    gasPrice: BigInt(gasPrice),
    nonce,
    chainId: 7773n,
  };
  const signed = await unlockedWallet.signTransaction(tx);
  const broadcast = await nodeRequest(`${nodeUrl}/rpc`, 'POST',
    { jsonrpc: '2.0', method: 'eth_sendRawTransaction', params: [signed], id: 1 });
  if (broadcast.body?.error) return { ok: false, error: broadcast.body.error.message };
  return { ok: true, hash: broadcast.body?.result };
});

// ─────────────────────────────────────────────────────────────────────────
// IPC: Privacy / Shielded
// ─────────────────────────────────────────────────────────────────────────
ipcMain.handle('privacy:balance', async () => {
  if (!unlockedWallet) return { ok: false, error: 'Wallet locked' };
  const { nodeUrl } = loadSettings();
  const r = await nodeRequest(`${nodeUrl}/privacy/balance`, 'POST',
    { privateKey: unlockedWallet.privateKey });
  return r.body;
});

ipcMain.handle('privacy:shield', async (_e, { amountEmbr }) => {
  if (!unlockedWallet) return { ok: false, error: 'Wallet locked' };
  const { nodeUrl } = loadSettings();
  const r = await nodeRequest(`${nodeUrl}/privacy/shield`, 'POST',
    { senderPrivateKey: unlockedWallet.privateKey, amount: Number(amountEmbr) });
  return r.body;
});

ipcMain.handle('privacy:send', async (_e, { recipientAddress, amountEmbr }) => {
  if (!unlockedWallet) return { ok: false, error: 'Wallet locked' };
  const { nodeUrl } = loadSettings();
  const r = await nodeRequest(`${nodeUrl}/privacy/send`, 'POST',
    { senderPrivateKey: unlockedWallet.privateKey, recipientAddress, amount: Number(amountEmbr) });
  return r.body;
});

ipcMain.handle('privacy:unshield', async (_e, { amountEmbr }) => {
  if (!unlockedWallet) return { ok: false, error: 'Wallet locked' };
  const { nodeUrl } = loadSettings();
  const r = await nodeRequest(`${nodeUrl}/privacy/unshield`, 'POST',
    { senderPrivateKey: unlockedWallet.privateKey, amount: Number(amountEmbr) });
  return r.body;
});

ipcMain.handle('privacy:transactions', async () => {
  const { nodeUrl } = loadSettings();
  const r = await nodeRequest(`${nodeUrl}/privacy/transactions`);
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
