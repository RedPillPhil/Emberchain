const { contextBridge, ipcRenderer } = require('electron');

const invoke = (ch, ...args) => ipcRenderer.invoke(ch, ...args);

contextBridge.exposeInMainWorld('ember', {
  // Settings
  getSettings:      ()       => invoke('settings:get'),
  saveSettings:     (patch)  => invoke('settings:set', patch),

  // Wallet lifecycle
  walletExists:     ()       => invoke('wallet:exists'),
  walletCreate:     (pwd)    => invoke('wallet:create', pwd),
  walletImportKey:  (k, pwd) => invoke('wallet:import-key', k, pwd),
  walletImportKS:   (j, pwd) => invoke('wallet:import-keystore', j, pwd),
  walletUnlock:     (pwd)    => invoke('wallet:unlock', pwd),
  walletLock:       ()       => invoke('wallet:lock'),
  walletIsUnlocked: ()       => invoke('wallet:is-unlocked'),
  walletAddress:    ()       => invoke('wallet:address'),

  // Chain queries
  getBalance:       (addr)   => invoke('chain:balance', addr),
  getTransactions:  (addr)   => invoke('chain:transactions', addr),
  getBlockHeight:   ()       => invoke('chain:block-height'),
  getGasPrice:      ()       => invoke('chain:gas-price'),

  // Send
  sendTx:           (opts)   => invoke('chain:send', opts),

  // Privacy / shielded
  privacyBalance:   ()       => invoke('privacy:balance'),
  privacyShield:    (opts)   => invoke('privacy:shield', opts),
  privacySend:      (opts)   => invoke('privacy:send', opts),
  privacyUnshield:  (opts)   => invoke('privacy:unshield', opts),
  privacyTxList:    ()       => invoke('privacy:transactions'),

  // QR code
  getQrCode: (text) => invoke('wallet:qrcode', text),

  // Node
  getActiveNodeUrl: () => invoke('node:active-url'),

  // Events from main → renderer
  on: (event, cb) => ipcRenderer.on(event, (_e, ...args) => cb(...args)),
});
