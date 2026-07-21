'use strict';

// ── Elements ─────────────────────────────────────────────────────────────────

const elAddress       = document.getElementById('inp-address');
const elNode          = document.getElementById('inp-node');
const elIntensity     = document.getElementById('inp-intensity');
const elIntensityLbl  = document.getElementById('intensity-label');
const elIntensityDesc = document.getElementById('intensity-desc');
const elBtnMine       = document.getElementById('btn-mine');
const elBtnMineIcon   = document.getElementById('btn-mine-icon');
const elBtnMineLabel  = document.getElementById('btn-mine-label');
const elStatusLine    = document.getElementById('status-line');
const elLog           = document.getElementById('log');
const elBtnClear      = document.getElementById('btn-clear-log');
const elBtnCollapse   = document.getElementById('btn-collapse-log');
const elLogWrap       = document.getElementById('log-wrap');
const elLogCount      = document.getElementById('log-count');

const elHashrate      = document.getElementById('stat-hashrate');
const elShares        = document.getElementById('stat-shares');
const elBlocks        = document.getElementById('stat-blocks');
const elNetHashrate   = document.getElementById('stat-net-hashrate');
const elDifficulty    = document.getElementById('stat-difficulty');
const elBlockNum      = document.getElementById('stat-block-num');
const elHashbarFill   = document.getElementById('hashbar-fill');
const elHashbarGlow   = document.getElementById('hashbar-glow');
const elHashbarPct    = document.getElementById('hashbar-pct');

// ── State ─────────────────────────────────────────────────────────────────────

let mining     = false;
let logVisible = true;
let myHashrate = 0;
let netHashrate = 0;
let miningStatusSet = false;   // flips true on first hashrate / mining_started

// ── Intensity descriptions ────────────────────────────────────────────────────

const INTENSITY_LABELS = {
  1:  '1 — Eco',
  2:  '2 — Light',
  3:  '3 — Balanced',
  4:  '4 — Aggressive',
  5:  '5 — MAX',
  6:  '6 — Turbo',
  7:  '7 — Extreme',
  8:  '8 — Nuclear  ⚠',
  9:  '9 — Insane   ⚠⚠',
  10: '10 — OVERLOAD ☠',
};
const INTENSITY_DESCS = {
  1:  '~300 hashes / batch  (background only)',
  2:  '~1,500 hashes / batch  (low CPU)',
  3:  '~6,000 hashes / batch  (recommended)',
  4:  '~20,000 hashes / batch  (high CPU)',
  5:  '~60,000 hashes / batch  (all cores)',
  6:  '~120,000 hashes / batch  (fan noise expected)',
  7:  '~300,000 hashes / batch  (heavy load)',
  8:  '~600,000 hashes / batch  ⚠ ensure good cooling',
  9:  '~1.2M hashes / batch  ⚠⚠ CPU will run hot',
  10: '~2M hashes / batch  ☠ maximum — monitor temps!',
};

function updateIntensityUI() {
  const v = parseInt(elIntensity.value, 10);
  elIntensityLbl.textContent  = INTENSITY_LABELS[v];
  elIntensityDesc.textContent = INTENSITY_DESCS[v];
  elIntensityDesc.className   = 'intensity-desc' + (v >= 8 ? ' warn' : v >= 6 ? ' caution' : '');
}
elIntensity.addEventListener('input', updateIntensityUI);
updateIntensityUI();

// ── Address validation ────────────────────────────────────────────────────────

function isValidAddress(a) { return /^0x[0-9a-fA-F]{40}$/.test(a.trim()); }

elAddress.addEventListener('input', () => {
  const valid = isValidAddress(elAddress.value);
  elBtnMine.disabled = !valid;
  elStatusLine.className = 'status-line';
  elStatusLine.textContent = valid ? 'Ready to mine' : 'Enter your wallet address to begin';
  if (valid) elStatusLine.classList.add('ok');
});

// ── Window controls ───────────────────────────────────────────────────────────

document.getElementById('btn-minimize').addEventListener('click', () => window.miner.minimize());
document.getElementById('btn-close').addEventListener('click',    () => window.miner.close());

// ── Log collapse ──────────────────────────────────────────────────────────────

function updateLogCount() {
  const n = elLog.children.length;
  elLogCount.textContent = logVisible ? '' : `(${n} entries)`;
}

elBtnCollapse.addEventListener('click', () => {
  logVisible = !logVisible;
  elLogWrap.classList.toggle('collapsed', !logVisible);
  elBtnCollapse.textContent = logVisible ? '▾' : '▸';
  elBtnCollapse.title       = logVisible ? 'Collapse log' : 'Expand log';
  updateLogCount();
});

// ── Logging ───────────────────────────────────────────────────────────────────

function ts() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
}

function logEntry(msg, cls = 'log-info') {
  const div = document.createElement('div');
  div.className = 'log-entry';
  div.innerHTML = `<span class="log-time">${ts()}</span><span class="${cls}">${msg}</span>`;
  elLog.appendChild(div);
  while (elLog.children.length > 500) elLog.removeChild(elLog.firstChild);
  if (logVisible) elLog.scrollTop = elLog.scrollHeight;
  updateLogCount();
}

elBtnClear.addEventListener('click', () => { elLog.innerHTML = ''; updateLogCount(); });

// ── Hashrate formatting ───────────────────────────────────────────────────────

function fmtHash(h) {
  if (h >= 1_000_000) return `${(h / 1_000_000).toFixed(2)} MH/s`;
  if (h >= 1_000)     return `${(h / 1_000).toFixed(1)} kH/s`;
  return `${h} H/s`;
}

function fmtDiff(d) {
  const n = Number(d);
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `${(n / 1e9).toFixed(2)}G`;
  if (n >= 1e6)  return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3)  return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

// ── Hashrate bar ──────────────────────────────────────────────────────────────

function updateHashbar() {
  if (netHashrate <= 0 || myHashrate <= 0) {
    elHashbarFill.style.width = '0%';
    elHashbarPct.textContent = '0%';
    return;
  }
  const pct = Math.min(100, (myHashrate / netHashrate) * 100);
  const display = pct < 0.1 ? '<0.1' : pct.toFixed(1);
  elHashbarFill.style.width = `${pct}%`;
  elHashbarPct.textContent = `${display}% of network`;
}

// ── Mining events ─────────────────────────────────────────────────────────────

window.miner.on('mining:event', (msg) => {
  switch (msg.type) {

    case 'status':
      setStatus(msg.msg, 'info');
      break;

    case 'mining_started':
      // First successful template fetch — switch status from "Connecting…" to "Mining"
      if (!miningStatusSet) {
        miningStatusSet = true;
        setStatus('⛏  Mining', 'mining');
        logEntry('Template received — hashing started', 'log-status');
      }
      break;

    case 'hashrate':
      if (!miningStatusSet) {
        miningStatusSet = true;
        setStatus('⛏  Mining', 'mining');
      }
      myHashrate = msg.hashrate;
      elHashrate.textContent = fmtHash(msg.hashrate);
      if (msg.blockNumber) elBlockNum.textContent = `#${msg.blockNumber}`;
      if (msg.difficulty)  elDifficulty.textContent = fmtDiff(msg.difficulty);
      if (msg.difficulty) {
        netHashrate = Number(BigInt(msg.difficulty)) / 60;
        elNetHashrate.textContent = fmtHash(Math.round(netHashrate));
      }
      updateHashbar();
      break;

    case 'share':
      elShares.textContent = msg.totalShares;
      logEntry(`✅ Share #${msg.totalShares} accepted`, 'log-share');
      break;

    case 'block': {
      elBlocks.textContent = msg.totalBlocks;
      const blockLabel = msg.number ? `#${msg.number}` : '(via share)';
      logEntry(`🟧 BLOCK FOUND ${blockLabel}  —  Total: ${msg.totalBlocks} blocks`, 'log-block');
      elBlocks.classList.add('green');
      setTimeout(() => elBlocks.classList.remove('green'), 2000);
      break;
    }

    case 'stale':
      logEntry('↩ Stale block — chain advanced, fetching new template', 'log-info');
      break;

    case 'network':
      if (msg.data) {
        const d = msg.data;
        if (d.height)     elBlockNum.textContent    = `#${d.height}`;
        if (d.difficulty) elDifficulty.textContent  = fmtDiff(d.difficulty);
        if (d.avgBlockTime && d.difficulty) {
          const est = Number(BigInt(d.difficulty)) / (d.avgBlockTime || 60);
          netHashrate = est;
          elNetHashrate.textContent = fmtHash(Math.round(est));
          updateHashbar();
        }
      }
      break;

    case 'warn':
      // Template retry — log only, don't clobber the status line
      logEntry(`⚠ ${msg.msg}  (retrying in 5s…)`, 'log-warn');
      break;

    case 'error':
      logEntry(`✖ ${msg.msg}`, 'log-error');
      setStatus(msg.msg, 'error');
      break;

    case 'stopped':
      setMiningUI(false);
      setStatus('Mining stopped', '');
      logEntry('Mining stopped', 'log-info');
      elHashrate.textContent = '— H/s';
      elHashbarFill.style.width = '0%';
      elHashbarGlow.classList.remove('active');
      elHashbarPct.textContent = '0%';
      myHashrate = 0;
      miningStatusSet = false;
      updateHashbar();
      break;
  }
});

// ── Start / stop ──────────────────────────────────────────────────────────────

function setStatus(msg, cls) {
  elStatusLine.className = 'status-line' + (cls ? ` ${cls}` : '');
  elStatusLine.textContent = msg;
}

function setMiningUI(isMining) {
  mining = isMining;
  elBtnMine.classList.toggle('mining', isMining);
  elBtnMineIcon.textContent  = isMining ? '■' : '▶';
  elBtnMineLabel.textContent = isMining ? 'STOP MINING'  : 'START MINING';
  elHashbarGlow.classList.toggle('active', isMining);
  elAddress.disabled   = isMining;
  elNode.disabled      = isMining;
  elIntensity.disabled = isMining;
}

elBtnMine.addEventListener('click', () => {
  if (!mining) {
    const address   = elAddress.value.trim();
    const nodeUrl   = elNode.value.trim() || 'https://emberchain.org';
    const intensity = parseInt(elIntensity.value, 10);

    if (!isValidAddress(address)) {
      setStatus('Invalid address — must be 0x…', 'error');
      return;
    }

    miningStatusSet = false;
    setMiningUI(true);
    setStatus('Connecting to node…', 'info');
    elShares.textContent = '0';
    elBlocks.textContent = '0';
    elLog.innerHTML = '';
    logEntry(`Starting miner — node: ${nodeUrl}`, 'log-status');
    logEntry(`Address: ${address}`, 'log-info');
    logEntry(`Intensity: ${INTENSITY_LABELS[intensity]}  ${INTENSITY_DESCS[intensity]}`, 'log-info');

    window.miner.start({ nodeUrl, address, intensity });
  } else {
    setStatus('Stopping…', 'info');
    window.miner.stop();
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────

logEntry('Emberchain Miner ready', 'log-status');
logEntry('Enter your wallet address and click START MINING', 'log-info');
