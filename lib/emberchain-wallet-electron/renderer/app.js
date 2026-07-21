/* EmberChain Desktop — renderer */
'use strict';

// ── State ─────────────────────────────────────────────────────────────────
let address    = null;
let pollTimer  = null;
let mining     = false;
let myHashrate = 0;
let netHashrate = 0;

// ── DOM helpers ───────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const show = el => el && el.classList.remove('hidden');
const hide = el => el && el.classList.add('hidden');
function showResult(id, msg, ok) {
  const el = $(id);
  el.className = 'result-box ' + (ok ? 'ok' : 'err');
  el.textContent = msg;
  show(el);
  if (ok) setTimeout(() => hide(el), 8000);
}

// Copy text from an element
window.copyText = function(id) {
  const txt = $(id)?.textContent || '';
  navigator.clipboard.writeText(txt).catch(() => {});
  const el = $(id);
  const orig = el.textContent;
  el.textContent = 'Copied!';
  setTimeout(() => { el.textContent = orig; }, 1500);
};

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
  if (sec < 60)    return `${sec}s ago`;
  if (sec < 3600)  return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return new Date(ts).toLocaleDateString();
}
function ts() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
}
function fmtHash(h) {
  if (h >= 1e6) return `${(h/1e6).toFixed(2)} MH/s`;
  if (h >= 1e3) return `${(h/1e3).toFixed(1)} kH/s`;
  return `${h} H/s`;
}

// ── Screen switching ──────────────────────────────────────────────────────
function showScreen(id) {
  ['screen-setup', 'screen-unlock', 'screen-wallet'].forEach(s =>
    s === id ? show($(s)) : hide($(s)));
}

// ── Tab switching ─────────────────────────────────────────────────────────
document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const tab = link.dataset.tab;
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    link.classList.add('active');
    document.querySelectorAll('.tab-panel').forEach(p => hide(p));
    show($('tab-' + tab));
    if (tab === 'transactions') loadFullTxList();
    if (tab === 'receive') renderQr(address);
    if (tab === 'mine' && address) $('mine-address').value = address;
  });
});

// ── Setup tabs ────────────────────────────────────────────────────────────
document.querySelectorAll('.setup-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.setup-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.setup-panel').forEach(p => hide(p));
    $('setup-' + btn.dataset.setup)?.classList.remove('hidden');
  });
});

// ── Create wallet ─────────────────────────────────────────────────────────
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

// ── Import wallet ─────────────────────────────────────────────────────────
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
  $('btn-unlock').disabled = true;
  $('btn-unlock').textContent = 'Unlocking…';
  try {
    const res = await window.ember.walletUnlock($('unlock-pwd').value);
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

// ── QR code ───────────────────────────────────────────────────────────────
async function renderQr(addr) {
  if (!addr) return;
  try {
    const dataUrl = await window.ember.getQrCode(addr);
    $('receive-qr').src = dataUrl;
  } catch {}
}

// ── Init wallet UI ────────────────────────────────────────────────────────
async function initWallet(addr) {
  address = addr;
  $('overview-address').textContent  = addr;
  $('receive-address').textContent   = addr;
  $('status-address').textContent    = shortAddr(addr);
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
      conn.className   = 'connected';
      $('status-block').textContent = `Block ${height.toLocaleString()}`;
    } else throw new Error('no height');
  } catch {
    const conn = $('status-conn');
    conn.textContent = '⬤ Disconnected';
    conn.className   = 'disconnected';
    $('status-block').textContent = '';
  }
}

async function refreshOverview() {
  if (!address) return;
  try {
    const data = await window.ember.getBalance(address);
    const bal  = data?.balance ?? data?.balanceEmbr ?? null;
    $('balance-embr').textContent = bal != null
      ? `${Number(bal).toLocaleString(undefined, {minimumFractionDigits:4,maximumFractionDigits:8})} EMBR`
      : '— EMBR';
  } catch { $('balance-embr').textContent = '— EMBR'; }
  try {
    const txs = await window.ember.getTransactions(address);
    renderTxList('recent-txs', Array.isArray(txs) ? txs.slice(0, 8) : (txs?.transactions ?? []).slice(0, 8));
  } catch {
    $('recent-txs').innerHTML = '<div class="tx-placeholder">Could not load transactions.</div>';
  }
}

$('btn-refresh').addEventListener('click', refreshOverview);
$('btn-refresh-shielded').addEventListener('click', async () => {
  $('balance-shielded').textContent = '…';
  try {
    const res = await window.ember.privacyBalance();
    const rawBal = res?.totalBalance ?? res?.balance ?? 0;
    $('balance-shielded').textContent = `${Number(rawBal).toLocaleString(undefined,{minimumFractionDigits:4,maximumFractionDigits:8})} EMBR`;
  } catch { $('balance-shielded').textContent = '—'; }
});

// ── Transactions ──────────────────────────────────────────────────────────
$('btn-refresh-txs').addEventListener('click', loadFullTxList);
async function loadFullTxList() {
  if (!address) return;
  $('tx-list-full').innerHTML = '<div class="tx-placeholder">Loading…</div>';
  try {
    const txs  = await window.ember.getTransactions(address);
    const list = Array.isArray(txs) ? txs : (txs?.transactions ?? []);
    renderTxList('tx-list-full', list);
  } catch { $('tx-list-full').innerHTML = '<div class="tx-placeholder">Could not load transactions.</div>'; }
}
function renderTxList(containerId, txs) {
  const el = $(containerId);
  if (!txs || txs.length === 0) { el.innerHTML = '<div class="tx-placeholder">No transactions yet.</div>'; return; }
  el.innerHTML = txs.map(tx => {
    const isSent = (tx.from || '').toLowerCase() === address.toLowerCase();
    const dir    = isSent ? 'out' : 'in';
    const icon   = isSent ? '↑' : '↓';
    const amtRaw = tx.value ?? tx.amount ?? 0;
    const amt    = typeof amtRaw === 'string' && amtRaw.startsWith('0x')
      ? (Number(BigInt(amtRaw)) / 1e18) : Number(amtRaw);
    const hash = tx.hash ?? tx.txHash ?? '';
    const ts   = tx.timestamp ?? tx.blockTime ?? null;
    const cp   = isSent ? (tx.to ?? '') : (tx.from ?? '');
    return `<div class="tx-item tx-${dir}">
      <div class="tx-icon">${icon}</div>
      <div class="tx-meta">
        <span class="tx-hash" title="${hash}">${shortAddr(hash) || 'Pending'}</span>
        <span class="tx-date">${ts ? timeSince(ts) : ''} ${cp ? '· ' + shortAddr(cp) : ''}</span>
      </div>
      <span class="tx-amount ${dir==='in'?'pos':'neg'}">${isSent?'-':'+'}${amt.toLocaleString(undefined,{minimumFractionDigits:4,maximumFractionDigits:6})} EMBR</span>
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
  } catch (err) { showResult('send-result', String(err), false); }
  finally {
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

// ── Shield / Private Send / Unshield ─────────────────────────────────────
$('btn-shield').addEventListener('click', async () => {
  hide($('shield-result'));
  const amount = $('shield-amount').value;
  if (!amount || Number(amount) <= 0) { showResult('shield-result', 'Enter a valid amount.', false); return; }
  $('btn-shield').disabled = true; $('btn-shield').textContent = 'Shielding…';
  try {
    const res = await window.ember.privacyShield({ amountEmbr: amount });
    if (res?.success || res?.txHash || res?.commitment) {
      showResult('shield-result', `✓ Shielded ${amount} EMBR.`, true);
      $('shield-amount').value = '';
    } else { showResult('shield-result', `Error: ${res?.error || JSON.stringify(res)}`, false); }
  } catch (err) { showResult('shield-result', String(err), false); }
  finally { $('btn-shield').disabled = false; $('btn-shield').textContent = 'Shield →'; }
});

$('btn-psend').addEventListener('click', async () => {
  hide($('psend-result'));
  const to = $('psend-to').value.trim(), amount = $('psend-amount').value;
  if (!to.match(/^0x[0-9a-fA-F]{40}$/)) { showResult('psend-result', 'Invalid address.', false); return; }
  if (!amount || Number(amount) <= 0)    { showResult('psend-result', 'Enter a valid amount.', false); return; }
  $('btn-psend').disabled = true; $('btn-psend').textContent = 'Sending…';
  try {
    const res = await window.ember.privacySend({ recipientAddress: to, amountEmbr: amount });
    if (res?.success || res?.nullifier) {
      showResult('psend-result', `✓ Private send complete.`, true);
      $('psend-to').value = ''; $('psend-amount').value = '';
    } else { showResult('psend-result', `Error: ${res?.error || JSON.stringify(res)}`, false); }
  } catch (err) { showResult('psend-result', String(err), false); }
  finally { $('btn-psend').disabled = false; $('btn-psend').textContent = 'Send Private →'; }
});

$('btn-unshield').addEventListener('click', async () => {
  hide($('unshield-result'));
  const amount = $('unshield-amount').value;
  if (!amount || Number(amount) <= 0) { showResult('unshield-result', 'Enter a valid amount.', false); return; }
  $('btn-unshield').disabled = true; $('btn-unshield').textContent = 'Unshielding…';
  try {
    const res = await window.ember.privacyUnshield({ amountEmbr: amount });
    if (res?.success || res?.txHash) {
      showResult('unshield-result', `✓ Unshielded ${amount} EMBR.`, true);
      $('unshield-amount').value = '';
      setTimeout(refreshOverview, 3000);
    } else { showResult('unshield-result', `Error: ${res?.error || JSON.stringify(res)}`, false); }
  } catch (err) { showResult('unshield-result', String(err), false); }
  finally { $('btn-unshield').disabled = false; $('btn-unshield').textContent = 'Unshield →'; }
});

// ── Node panel ────────────────────────────────────────────────────────────
$('btn-node-start').addEventListener('click', async () => {
  $('btn-node-start').disabled = true;
  $('btn-node-start').textContent = 'Starting…';
  try {
    const r = await window.ember.nodeStart();
    if (r && !r.ok) {
      $('node-status-label').textContent = `Error: ${r.error}`;
    }
  } catch (e) {
    $('node-status-label').textContent = `Error: ${e.message}`;
  } finally {
    $('btn-node-start').textContent = '▶ Start';
  }
});
$('btn-node-stop').addEventListener('click',  () => window.ember.nodeStop());

function renderNodeStatus(s) {
  if (!s) return;

  // Sidebar badge
  const badge = $('node-nav-badge');
  if (s.downloading) {
    badge.className = 'node-badge badge-syncing';
  } else if (s.running && s.synced) {
    badge.className = 'node-badge badge-ok';
  } else if (s.running) {
    badge.className = 'node-badge badge-syncing';
  } else {
    badge.className = 'node-badge badge-off';
  }

  // Overview mini-card
  const dot = $('overview-node-dot');
  const txt = $('overview-node-text');
  if (s.downloading) {
    dot.className = 'node-dot dot-loading';
    txt.textContent = 'Downloading blockchain data…';
  } else if (s.running && s.synced) {
    dot.className = 'node-dot dot-ok';
    txt.textContent = `Local node running · Block ${s.height.toLocaleString()} · ${s.peerCount} peer${s.peerCount !== 1 ? 's' : ''}`;
  } else if (s.running) {
    dot.className = 'node-dot dot-syncing';
    txt.textContent = `Syncing… ${s.height.toLocaleString()} / ${s.bestPeerHeight.toLocaleString()} blocks`;
  } else {
    dot.className = 'node-dot dot-stopped';
    txt.textContent = s.downloadError ? `Node error: ${s.downloadError}` : 'Node stopped';
  }

  // Status bar
  const ind = $('status-node-indicator');
  if (s.downloading) {
    ind.textContent = '⬤ Downloading…'; ind.className = 'node-syncing';
  } else if (s.running && s.synced) {
    ind.textContent = '⬤ Local Node'; ind.className = 'node-ok';
  } else if (s.running) {
    ind.textContent = `⬤ Syncing ${s.syncProgress}%`; ind.className = 'node-syncing';
  } else {
    ind.textContent = ''; ind.className = '';
  }

  // ── Node tab ──────────────────────────────────────────────────────────
  const statusDot   = $('node-status-dot');
  const statusLabel = $('node-status-label');

  if (s.downloading) {
    statusDot.className   = 'node-dot dot-loading';
    statusLabel.textContent = 'Downloading blockchain…';
    show($('node-downloading-msg'));
    hide($('node-sync-section'));
  } else if (s.running) {
    show($('node-sync-section'));
    hide($('node-downloading-msg'));
    if (s.synced) {
      statusDot.className    = 'node-dot dot-ok';
      statusLabel.textContent  = '🟢 Running — Synced';
    } else {
      statusDot.className    = 'node-dot dot-syncing';
      statusLabel.textContent  = '🔄 Running — Syncing';
    }
    $('node-sync-pct').textContent  = `${s.syncProgress}%`;
    $('node-sync-bar').style.width  = `${s.syncProgress}%`;
    $('node-sync-label').textContent = s.synced ? 'Fully synced' : 'Syncing blockchain…';
    if (s.bestPeerHeight > 0) {
      $('node-sync-detail').textContent =
        `${s.height.toLocaleString()} / ${s.bestPeerHeight.toLocaleString()} blocks downloaded`;
    } else {
      $('node-sync-detail').textContent = `Height: ${s.height.toLocaleString()}`;
    }
  } else {
    statusDot.className    = 'node-dot dot-stopped';
    statusLabel.textContent  = s.downloadError ? `Error: ${s.downloadError}` : 'Stopped';
    hide($('node-sync-section'));
    hide($('node-downloading-msg'));
  }

  $('node-height').textContent    = s.running ? s.height.toLocaleString() : '—';
  $('node-peers').textContent     = s.running ? `${s.peerCount} peer${s.peerCount !== 1 ? 's' : ''}` : '—';
  $('node-conn-type').textContent = s.running
    ? (s.connectionType === 'public' ? '🌐 Public' : '🔒 Outbound Only') : '—';
  $('node-port').textContent      = s.port;

  // URLs
  $('node-rpc-url').textContent = s.rpcUrl || `http://127.0.0.1:${s.port}/api/rpc`;

  const pubRow = $('node-public-url-row');
  if (s.myUrl) {
    $('node-public-url').textContent = `${s.myUrl}/api/rpc`;
    show(pubRow);
    hide($('node-outbound-hint'));
  } else if (s.running) {
    hide(pubRow);
    show($('node-outbound-hint'));
  } else {
    hide(pubRow);
    hide($('node-outbound-hint'));
  }

  // Start/Stop button states
  $('btn-node-start').disabled = s.running || s.downloading;
  $('btn-node-stop').disabled  = !s.running;
}

// Listen for live status pushes from main
window.ember.on('node:status', renderNodeStatus);

// ── Mining ────────────────────────────────────────────────────────────────
const INTENSITY_LABELS = {
  1: '1 — Eco', 2: '2 — Light', 3: '3 — Balanced', 4: '4 — Aggressive',
  5: '5 — MAX', 6: '6 — Turbo', 7: '7 — Extreme',
  8: '8 — Nuclear ⚠', 9: '9 — Insane ⚠⚠', 10: '10 — OVERLOAD ☠',
};
const INTENSITY_DESCS = {
  1: '~300 hashes / batch (background only)', 2: '~1,500 hashes / batch (low CPU)',
  3: '~6,000 hashes / batch (recommended)',   4: '~20,000 hashes / batch (high CPU)',
  5: '~60,000 hashes / batch (all cores)',    6: '~120,000 hashes / batch (fan noise)',
  7: '~300,000 hashes / batch (heavy load)',  8: '~600,000 hashes / batch ⚠ cooling needed',
  9: '~1.2M hashes / batch ⚠⚠ CPU hot',      10: '~2M hashes / batch ☠ max',
};

$('mine-intensity').addEventListener('input', () => {
  const v = parseInt($('mine-intensity').value, 10);
  $('mine-intensity-label').textContent = INTENSITY_LABELS[v];
  $('mine-intensity-desc').textContent  = INTENSITY_DESCS[v];
});

function setMiningUI(isMining) {
  mining = isMining;
  const btn = $('btn-mine');
  btn.classList.toggle('mining', isMining);
  $('btn-mine-icon').textContent  = isMining ? '■' : '▶';
  $('btn-mine-label').textContent = isMining ? 'STOP MINING' : 'START MINING';
  $('mine-address').disabled   = isMining;
  $('mine-intensity').disabled = isMining;
}

function mineLog(msg, cls = 'log-info') {
  const log = $('mine-log');
  const div = document.createElement('div');
  div.className = 'log-entry';
  div.innerHTML = `<span class="log-time">${ts()}</span><span class="${cls}">${msg}</span>`;
  log.appendChild(div);
  while (log.children.length > 300) log.removeChild(log.firstChild);
  log.scrollTop = log.scrollHeight;
}

$('btn-mine').addEventListener('click', () => {
  if (!mining) {
    const addr      = $('mine-address').value.trim() || address;
    const intensity = parseInt($('mine-intensity').value, 10);
    if (!addr || !addr.match(/^0x[0-9a-fA-F]{40}$/)) {
      mineLog('Enter a valid wallet address first.', 'log-err'); return;
    }
    setMiningUI(true);
    mineLog(`Starting miner — intensity: ${INTENSITY_LABELS[intensity]}`, 'log-ok');
    window.ember.miningStart({ address: addr, intensity });
  } else {
    window.ember.miningStop();
    setMiningUI(false);
  }
});

$('btn-mine-clear').addEventListener('click', () => { $('mine-log').innerHTML = ''; });

window.ember.on('mining:event', msg => {
  switch (msg.type) {
    case 'status':
      mineLog(msg.msg);
      break;
    case 'mining_started':
      mineLog('Template received — hashing started ⛏', 'log-ok');
      break;
    case 'hashrate':
      myHashrate = msg.hashrate;
      $('mine-hashrate').textContent = fmtHash(msg.hashrate);
      if (msg.blockNumber) $('mine-blocknum').textContent = `#${msg.blockNumber.toLocaleString()}`;
      updateHashbar();
      break;
    case 'network':
      if (msg.data?.hashrate) {
        netHashrate = msg.data.hashrate;
        updateHashbar();
      }
      break;
    case 'share':
      $('mine-shares').textContent = msg.totalShares;
      mineLog(`Share accepted! Total: ${msg.totalShares}`, 'log-ok');
      break;
    case 'block':
      $('mine-blocks').textContent = msg.totalBlocks;
      mineLog(`🎉 Block found! #${msg.number ?? '?'} — Total: ${msg.totalBlocks}`, 'log-ok');
      break;
    case 'stale':
      mineLog('Stale block — template refreshed', 'log-warn');
      break;
    case 'warn':
      mineLog(`⚠ ${msg.msg}`, 'log-warn');
      break;
    case 'error':
      mineLog(`✖ ${msg.msg}`, 'log-err');
      setMiningUI(false);
      break;
    case 'stopped':
      setMiningUI(false);
      mineLog('Mining stopped.', 'log-info');
      $('mine-hashrate').textContent = '— H/s';
      myHashrate = 0;
      updateHashbar();
      break;
  }
});

function updateHashbar() {
  if (netHashrate <= 0 || myHashrate <= 0) {
    $('hashbar-fill').style.width = '0%';
    $('hashbar-pct').textContent  = '0%';
    return;
  }
  const pct = Math.min(100, (myHashrate / netHashrate) * 100);
  const disp = pct < 0.1 ? '<0.1' : pct.toFixed(1);
  $('hashbar-fill').style.width = `${pct}%`;
  $('hashbar-pct').textContent  = `${disp}%`;
}

// ── Node public-URL config ─────────────────────────────────────────────────
async function loadPublicUrlField() {
  const s = await window.ember.getSettings();
  const v = s.publicUrl ?? '';
  $('node-public-ip').value = v;
  $('node-public-ip-hint').textContent = v ? `✅ Advertising as ${v}` : '';
}
loadPublicUrlField();

$('btn-save-public-url').addEventListener('click', async () => {
  let url = $('node-public-ip').value.trim().replace(/\/$/, '');
  if (url && !url.startsWith('http')) url = 'http://' + url;
  // Append port if bare IP without port
  if (url && /^https?:\/\/[\d.]+$/.test(url)) url += ':17545';
  await window.ember.saveSettings({ publicUrl: url });
  await window.ember.applyPublicUrl(url);
  $('node-public-ip').value = url;
  $('node-public-ip-hint').textContent = url ? `✅ Advertising as ${url}` : 'Cleared — node is outbound-only';
});

$('btn-clear-public-url').addEventListener('click', async () => {
  await window.ember.saveSettings({ publicUrl: '' });
  await window.ember.applyPublicUrl('');
  $('node-public-ip').value = '';
  $('node-public-ip-hint').textContent = 'Cleared — node is outbound-only';
});

// ── Settings ──────────────────────────────────────────────────────────────
async function openSettings() {
  const s = await window.ember.getSettings();
  $('settings-node-url').value = s.nodeUrl ?? '';
  $('settings-test-result').textContent = '';
  $('settings-test-result').style.color = '';
  try {
    const active = await window.ember.getActiveNodeUrl();
    $('settings-active-node').textContent = active
      ? `Currently connected to: ${active}` : '';
  } catch { $('settings-active-node').textContent = ''; }
  show($('overlay-settings'));
}

$('btn-settings-test').addEventListener('click', async () => {
  const url = $('settings-node-url').value.trim().replace(/\/$/, '');
  const btn = $('btn-settings-test'), result = $('settings-test-result');
  btn.disabled = true; btn.textContent = 'Testing…'; result.textContent = '';
  try {
    const r = await window.ember.testNodeUrl(url);
    if (r.ok) {
      result.textContent = `✅ Connected! Block height: ${r.height?.toLocaleString() ?? '?'}, Chain ID: ${r.chainId}`;
      result.style.color = '#4caf50';
    } else {
      result.textContent = `❌ ${r.error}`;
      result.style.color = '#f44336';
    }
  } catch (err) {
    result.textContent = `❌ ${err.message}`; result.style.color = '#f44336';
  } finally {
    btn.disabled = false; btn.textContent = 'Test Connection';
  }
});

$('btn-settings-save').addEventListener('click', async () => {
  const url = $('settings-node-url').value.trim().replace(/\/$/, '');
  await window.ember.saveSettings({ nodeUrl: url });
  hide($('overlay-settings'));
  refreshStatus();
});
$('btn-settings-cancel').addEventListener('click', () => hide($('overlay-settings')));

// Fallback-node toast
let toastTimer = null;
window.ember.on('node:switched', url => {
  $('toast-fallback-url').textContent = url;
  show($('toast-fallback'));
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => hide($('toast-fallback')), 10000);
});

window.ember.on('open:settings', openSettings);

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

  // Poll initial node status
  try {
    const s = await window.ember.nodeGetStatus();
    renderNodeStatus(s);
  } catch {}
}

boot();
