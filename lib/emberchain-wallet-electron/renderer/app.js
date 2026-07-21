/* Emberchain Desktop Wallet — renderer logic */
'use strict';

// ── State ─────────────────────────────────────────────────────────────────
let address = null;
let pollTimer = null;

// ── Utilities ─────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const show = (el, cls = '') => { el.classList.remove('hidden'); if (cls) el.className += ' ' + cls; };
const hide = el => el.classList.add('hidden');
const setHtml = (id, html) => { $(id).innerHTML = html; };

function showResult(id, msg, ok) {
  const el = $(id);
  el.className = 'result-box ' + (ok ? 'ok' : 'err');
  el.textContent = msg;
  show(el);
  if (ok) setTimeout(() => hide(el), 8000);
}

function fmt(embr) {
  if (embr == null) return '—';
  const n = typeof embr === 'bigint' ? Number(embr) / 1e18 : Number(embr);
  return n.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 8 }) + ' EMBR';
}

function shortAddr(addr) {
  if (!addr) return '';
  return addr.slice(0, 8) + '…' + addr.slice(-6);
}

function timeSince(ts) {
  if (!ts) return '';
  const sec = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return new Date(ts).toLocaleDateString();
}

// ── Screen switching ──────────────────────────────────────────────────────
function showScreen(id) {
  ['screen-setup', 'screen-unlock', 'screen-wallet'].forEach(s => {
    s === id ? show($(s)) : hide($(s));
  });
}

// ── Tab switching ─────────────────────────────────────────────────────────
document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const tab = link.dataset.tab;
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    link.classList.add('active');
    document.querySelectorAll('.tab-panel').forEach(p => hide(p));
    show($('tab-' + tab.replace('-', '-')));
    if (tab === 'transactions') loadFullTxList();
    if (tab === 'receive') renderQr(address);
  });
});

// ── Setup tabs ────────────────────────────────────────────────────────────
document.querySelectorAll('.setup-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.setup-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.setup-panel').forEach(p => hide(p));
    const panel = $('setup-' + btn.dataset.setup);
    panel.classList.remove('hidden');
  });
});

// ── Setup: Create wallet ──────────────────────────────────────────────────
$('btn-create').addEventListener('click', async () => {
  hide($('create-error'));
  const pwd  = $('create-pwd').value;
  const pwd2 = $('create-pwd2').value;
  if (pwd.length < 8) { show($('create-error')); $('create-error').textContent = 'Password must be at least 8 characters.'; return; }
  if (pwd !== pwd2)   { show($('create-error')); $('create-error').textContent = 'Passwords do not match.'; return; }

  $('btn-create').disabled = true;
  $('btn-create').textContent = 'Creating…';
  try {
    const res = await window.ember.walletCreate(pwd);
    if (res?.mnemonic) {
      const words = res.mnemonic.split(' ');
      $('mnemonic-words').innerHTML = words.map((w, i) => `<span>${i + 1}. ${w}</span>`).join('');
      show($('create-mnemonic'));
      hide($('btn-create'));
    } else {
      await initWallet(res.address);
    }
  } catch (err) {
    show($('create-error')); $('create-error').textContent = String(err);
  } finally {
    $('btn-create').disabled = false;
    $('btn-create').textContent = 'Create Wallet';
  }
});

$('btn-mnemonic-done').addEventListener('click', async () => {
  address = await window.ember.walletAddress();
  await initWallet(address);
});

// ── Setup: Import wallet ──────────────────────────────────────────────────
$('btn-import').addEventListener('click', async () => {
  hide($('import-error'));
  const key  = $('import-key').value.trim();
  const pwd  = $('import-pwd').value;
  const pwd2 = $('import-pwd2').value;
  if (!key)         { show($('import-error')); $('import-error').textContent = 'Enter a private key or seed phrase.'; return; }
  if (pwd.length < 8) { show($('import-error')); $('import-error').textContent = 'Password must be at least 8 characters.'; return; }
  if (pwd !== pwd2) { show($('import-error')); $('import-error').textContent = 'Passwords do not match.'; return; }

  $('btn-import').disabled = true;
  $('btn-import').textContent = 'Importing…';
  try {
    const res = await window.ember.walletImportKey(key, pwd);
    await initWallet(res.address);
  } catch (err) {
    show($('import-error')); $('import-error').textContent = String(err);
  } finally {
    $('btn-import').disabled = false;
    $('btn-import').textContent = 'Import Wallet';
  }
});

// ── Unlock ────────────────────────────────────────────────────────────────
$('unlock-pwd').addEventListener('keydown', e => { if (e.key === 'Enter') $('btn-unlock').click(); });

$('btn-unlock').addEventListener('click', async () => {
  hide($('unlock-error'));
  const pwd = $('unlock-pwd').value;
  $('btn-unlock').disabled = true;
  $('btn-unlock').textContent = 'Unlocking…';
  try {
    const res = await window.ember.walletUnlock(pwd);
    if (res.ok) {
      $('unlock-pwd').value = '';
      await initWallet(res.address);
    } else {
      show($('unlock-error')); $('unlock-error').textContent = res.error || 'Wrong password.';
    }
  } finally {
    $('btn-unlock').disabled = false;
    $('btn-unlock').textContent = 'Unlock';
  }
});

// ── Lock ──────────────────────────────────────────────────────────────────
async function lockWallet() {
  await window.ember.walletLock();
  if (pollTimer) clearInterval(pollTimer);
  address = null;
  showScreen('screen-unlock');
}
$('btn-lock-small').addEventListener('click', lockWallet);
window.ember.on('wallet:locked', lockWallet);
window.ember.on('open:settings', openSettings);

// ── QR code ───────────────────────────────────────────────────────────────
async function renderQr(addr) {
  if (!addr) return;
  try {
    const dataUrl = await window.ember.getQrCode(addr);
    const img = $('receive-qr');
    img.src = dataUrl;
  } catch (err) {
    console.error('QR generation failed', err);
  }
}

// ── Init wallet UI ────────────────────────────────────────────────────────
async function initWallet(addr) {
  address = addr;
  $('overview-address').textContent = addr;
  $('receive-address').textContent = addr;
  $('status-address').textContent = shortAddr(addr);
  showScreen('screen-wallet');
  renderQr(addr);
  startPolling();
  await refreshOverview();
}

// ── Polling ───────────────────────────────────────────────────────────────
function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(refreshStatus, 15000);
  refreshStatus();
}

async function refreshStatus() {
  try {
    const height = await window.ember.getBlockHeight();
    const conn = $('status-conn');
    if (height != null) {
      conn.textContent = '⬤ Connected';
      conn.className = 'connected';
      $('status-block').textContent = `Block ${height.toLocaleString()}`;
    } else {
      throw new Error('no height');
    }
  } catch {
    const conn = $('status-conn');
    conn.textContent = '⬤ Disconnected';
    conn.className = 'disconnected';
    $('status-block').textContent = '';
  }
}

async function refreshOverview() {
  if (!address) return;
  try {
    const data = await window.ember.getBalance(address);
    const bal = data?.balance ?? data?.balanceEmbr ?? data?.formattedBalance ?? null;
    $('balance-embr').textContent = bal != null ? `${Number(bal).toLocaleString(undefined, {minimumFractionDigits:4,maximumFractionDigits:8})} EMBR` : '— EMBR';
  } catch {
    $('balance-embr').textContent = '— EMBR';
  }
  try {
    const txs = await window.ember.getTransactions(address);
    renderTxList('recent-txs', Array.isArray(txs) ? txs.slice(0, 8) : (txs?.transactions ?? []).slice(0, 8));
  } catch {
    $('recent-txs').innerHTML = '<div class="tx-placeholder">Could not load transactions.</div>';
  }
}

$('btn-refresh').addEventListener('click', refreshOverview);
async function refreshShieldedBalance() {
  $('balance-shielded').textContent = '…';
  try {
    const res = await window.ember.privacyBalance();
    if (res?.error) throw new Error(res.error);
    const rawBal = res?.totalBalance ?? res?.balance ?? 0;
    // Privacy balances are stored in EMBR units (not wei)
    const bal = Number(rawBal);
    $('balance-shielded').textContent = `${bal.toLocaleString(undefined, {minimumFractionDigits:4,maximumFractionDigits:8})} EMBR`;
  } catch (err) {
    $('balance-shielded').textContent = '—';
    console.warn('Shielded balance error:', err.message);
  }
}
$('btn-refresh-shielded').addEventListener('click', refreshShieldedBalance);

// ── Transactions ──────────────────────────────────────────────────────────
$('btn-refresh-txs').addEventListener('click', loadFullTxList);

async function loadFullTxList() {
  if (!address) return;
  $('tx-list-full').innerHTML = '<div class="tx-placeholder">Loading…</div>';
  try {
    const txs = await window.ember.getTransactions(address);
    const list = Array.isArray(txs) ? txs : (txs?.transactions ?? []);
    renderTxList('tx-list-full', list);
  } catch {
    $('tx-list-full').innerHTML = '<div class="tx-placeholder">Could not load transactions.</div>';
  }
}

function renderTxList(containerId, txs) {
  const el = $(containerId);
  if (!txs || txs.length === 0) { el.innerHTML = '<div class="tx-placeholder">No transactions yet.</div>'; return; }
  el.innerHTML = txs.map(tx => {
    const isSent = (tx.from || '').toLowerCase() === address.toLowerCase();
    const dir = isSent ? 'out' : 'in';
    const icon = isSent ? '↑' : '↓';
    const amountRaw = tx.value ?? tx.amount ?? 0;
    const amount = typeof amountRaw === 'string' && amountRaw.startsWith('0x')
      ? (Number(BigInt(amountRaw)) / 1e18)
      : Number(amountRaw);
    const hash = tx.hash ?? tx.txHash ?? '';
    const ts = tx.timestamp ?? tx.blockTime ?? null;
    const counterpart = isSent ? (tx.to ?? '') : (tx.from ?? '');
    return `<div class="tx-item tx-${dir}">
      <div class="tx-icon">${icon}</div>
      <div class="tx-meta">
        <span class="tx-hash" title="${hash}">${shortAddr(hash) || 'Pending'}</span>
        <span class="tx-date">${ts ? timeSince(ts) : ''} ${counterpart ? '· ' + shortAddr(counterpart) : ''}</span>
      </div>
      <span class="tx-amount ${dir === 'in' ? 'pos' : 'neg'}">${isSent ? '-' : '+'}${amount.toLocaleString(undefined,{minimumFractionDigits:4,maximumFractionDigits:6})} EMBR</span>
    </div>`;
  }).join('');
}

// ── Send ──────────────────────────────────────────────────────────────────
$('btn-send').addEventListener('click', async () => {
  hide($('send-result'));
  const to     = $('send-to').value.trim();
  const amount = $('send-amount').value;
  const gas    = parseInt($('send-gas').value) || 21000;
  if (!to.match(/^0x[0-9a-fA-F]{40}$/)) { showResult('send-result', 'Invalid recipient address.', false); return; }
  if (!amount || Number(amount) <= 0)    { showResult('send-result', 'Enter a valid amount.', false); return; }

  $('btn-send').disabled = true;
  $('btn-send').textContent = 'Sending…';
  try {
    const res = await window.ember.sendTx({ to, amountEmbr: amount, gasLimit: gas });
    if (res?.ok) {
      showResult('send-result', `✓ Sent! Tx: ${res.hash}`, true);
      $('send-to').value = '';
      $('send-amount').value = '';
      setTimeout(refreshOverview, 3000);
    } else {
      showResult('send-result', `Error: ${res?.error || 'Unknown error'}`, false);
    }
  } catch (err) {
    showResult('send-result', String(err), false);
  } finally {
    $('btn-send').disabled = false;
    $('btn-send').textContent = 'Send →';
  }
});

// ── Receive ───────────────────────────────────────────────────────────────
$('btn-copy-address').addEventListener('click', () => {
  navigator.clipboard.writeText(address || '');
  $('btn-copy-address').textContent = 'Copied!';
  setTimeout(() => { $('btn-copy-address').textContent = 'Copy'; }, 1500);
});

// ── Shield ────────────────────────────────────────────────────────────────
$('btn-shield').addEventListener('click', async () => {
  hide($('shield-result'));
  const amount = $('shield-amount').value;
  if (!amount || Number(amount) <= 0) { showResult('shield-result', 'Enter a valid amount.', false); return; }
  $('btn-shield').disabled = true;
  $('btn-shield').textContent = 'Shielding…';
  try {
    const res = await window.ember.privacyShield({ amountEmbr: amount });
    if (res?.success || res?.txHash || res?.commitment) {
      showResult('shield-result', `✓ Shielded ${amount} EMBR. Commitment stored.`, true);
      $('shield-amount').value = '';
    } else {
      showResult('shield-result', `Error: ${res?.error || JSON.stringify(res)}`, false);
    }
  } catch (err) {
    showResult('shield-result', String(err), false);
  } finally {
    $('btn-shield').disabled = false;
    $('btn-shield').textContent = 'Shield →';
  }
});

// ── Private Send ──────────────────────────────────────────────────────────
$('btn-psend').addEventListener('click', async () => {
  hide($('psend-result'));
  const to     = $('psend-to').value.trim();
  const amount = $('psend-amount').value;
  if (!to.match(/^0x[0-9a-fA-F]{40}$/)) { showResult('psend-result', 'Invalid recipient address.', false); return; }
  if (!amount || Number(amount) <= 0)    { showResult('psend-result', 'Enter a valid amount.', false); return; }
  $('btn-psend').disabled = true;
  $('btn-psend').textContent = 'Sending…';
  try {
    const res = await window.ember.privacySend({ recipientAddress: to, amountEmbr: amount });
    if (res?.success || res?.nullifier) {
      showResult('psend-result', `✓ Private send complete.`, true);
      $('psend-to').value = '';
      $('psend-amount').value = '';
    } else {
      showResult('psend-result', `Error: ${res?.error || JSON.stringify(res)}`, false);
    }
  } catch (err) {
    showResult('psend-result', String(err), false);
  } finally {
    $('btn-psend').disabled = false;
    $('btn-psend').textContent = 'Send Private →';
  }
});

// ── Unshield ──────────────────────────────────────────────────────────────
$('btn-unshield').addEventListener('click', async () => {
  hide($('unshield-result'));
  const amount = $('unshield-amount').value;
  if (!amount || Number(amount) <= 0) { showResult('unshield-result', 'Enter a valid amount.', false); return; }
  $('btn-unshield').disabled = true;
  $('btn-unshield').textContent = 'Unshielding…';
  try {
    const res = await window.ember.privacyUnshield({ amountEmbr: amount });
    if (res?.success || res?.txHash) {
      showResult('unshield-result', `✓ Unshielded ${amount} EMBR to your address.`, true);
      $('unshield-amount').value = '';
      setTimeout(refreshOverview, 3000);
    } else {
      showResult('unshield-result', `Error: ${res?.error || JSON.stringify(res)}`, false);
    }
  } catch (err) {
    showResult('unshield-result', String(err), false);
  } finally {
    $('btn-unshield').disabled = false;
    $('btn-unshield').textContent = 'Unshield →';
  }
});

// ── Settings overlay ──────────────────────────────────────────────────────
async function openSettings() {
  const s = await window.ember.getSettings();
  $('settings-node-url').value = s.nodeUrl ?? '';
  show($('overlay-settings'));
}
$('btn-settings-save').addEventListener('click', async () => {
  const url = $('settings-node-url').value.trim().replace(/\/$/, '');
  await window.ember.saveSettings({ nodeUrl: url });
  hide($('overlay-settings'));
  refreshStatus();
});
$('btn-settings-cancel').addEventListener('click', () => hide($('overlay-settings')));

// ── Boot ──────────────────────────────────────────────────────────────────
async function boot() {
  const exists   = await window.ember.walletExists();
  const unlocked = await window.ember.walletIsUnlocked();

  if (!exists) {
    showScreen('screen-setup');
  } else if (unlocked) {
    const addr = await window.ember.walletAddress();
    await initWallet(addr);
  } else {
    showScreen('screen-unlock');
    $('unlock-address').textContent = 'Enter your password to unlock';
  }

  // Auto-open settings if no node URL has been configured yet
  const s = await window.ember.getSettings();
  if (!s.nodeUrl) {
    // Small delay so the main screen renders first
    setTimeout(openSettings, 400);
  }
}

boot();
