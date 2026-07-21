/**
 * Self-contained block explorer SPA served at GET / in standalone-node mode.
 * Pure vanilla JS — no external dependencies, no build step.
 * Auto-refreshes every 15 s. Hash-router: #/, #/block/N, #/tx/0x…, #/address/0x…
 */

export function explorerHtml(host: string): string {
  const api = `http://${host}/api`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Emberchain Explorer</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0a0a0a;--surface:#111;--surface2:#181818;--border:#222;
  --orange:#f97316;--orange-dim:#7c3312;
  --green:#22c55e;--red:#ef4444;--blue:#60a5fa;
  --text:#e5e5e5;--muted:#6b7280;--dim:#374151;
}
html{scroll-behavior:smooth}
body{background:var(--bg);color:var(--text);font-family:'Courier New',monospace;font-size:13px;min-height:100vh}

/* ── Header ── */
header{background:var(--surface);border-bottom:1px solid var(--border);padding:0 20px;height:52px;display:flex;align-items:center;gap:16px;position:sticky;top:0;z-index:100}
.logo{color:var(--orange);font-size:1rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;white-space:nowrap;cursor:pointer}
.logo span{color:var(--text)}
.search-wrap{flex:1;max-width:540px;position:relative}
.search-wrap input{width:100%;background:var(--bg);border:1px solid var(--border);border-radius:3px;padding:7px 36px 7px 12px;color:var(--text);font-family:inherit;font-size:12px;outline:none;transition:border .15s}
.search-wrap input:focus{border-color:var(--orange)}
.search-wrap input::placeholder{color:var(--muted)}
.search-btn{position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--muted);cursor:pointer;font-size:14px;padding:0}
.search-btn:hover{color:var(--orange)}
.live{display:flex;align-items:center;gap:6px;color:var(--muted);font-size:11px;white-space:nowrap;margin-left:auto}
.dot{width:7px;height:7px;border-radius:50%;background:var(--green);animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}

/* ── Layout ── */
main{max-width:1200px;margin:0 auto;padding:20px 16px}

/* ── Stats bar ── */
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
@media(max-width:700px){.stats{grid-template-columns:repeat(2,1fr)}}
.stat{background:var(--surface);border:1px solid var(--border);border-radius:3px;padding:14px 16px}
.stat-label{color:var(--muted);font-size:10px;letter-spacing:.1em;text-transform:uppercase;margin-bottom:6px}
.stat-value{color:var(--orange);font-size:1.2rem;font-weight:700;letter-spacing:.05em}
.stat-sub{color:var(--muted);font-size:10px;margin-top:3px}

/* ── Two-column panels ── */
.panels{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:900px){.panels{grid-template-columns:1fr}}

/* ── Panel ── */
.panel{background:var(--surface);border:1px solid var(--border);border-radius:3px;overflow:hidden}
.panel-head{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border)}
.panel-title{color:var(--text);font-size:11px;letter-spacing:.1em;text-transform:uppercase}
.panel-more{color:var(--orange);font-size:10px;cursor:pointer;text-decoration:none}
.panel-more:hover{text-decoration:underline}

/* ── Table ── */
.tbl{width:100%;border-collapse:collapse}
.tbl tr{border-bottom:1px solid var(--border);cursor:pointer;transition:background .1s}
.tbl tr:last-child{border-bottom:none}
.tbl tr:hover{background:var(--surface2)}
.tbl td{padding:9px 16px;vertical-align:middle}
.tbl .num{color:var(--orange);font-size:12px;font-weight:700;white-space:nowrap}
.tbl .hash{color:var(--blue);font-size:11px}
.tbl .addr{color:var(--blue);font-size:11px}
.tbl .age{color:var(--muted);font-size:10px;white-space:nowrap}
.tbl .badge{background:var(--surface2);border:1px solid var(--border);border-radius:2px;padding:2px 6px;font-size:10px;color:var(--muted);white-space:nowrap}
.tbl .val{color:var(--green);font-size:11px;white-space:nowrap}
.tbl .ok{color:var(--green)}
.tbl .fail{color:var(--red)}

/* ── Detail view ── */
.detail{background:var(--surface);border:1px solid var(--border);border-radius:3px;padding:20px 24px}
.detail-title{color:var(--orange);font-size:11px;letter-spacing:.12em;text-transform:uppercase;margin-bottom:18px;display:flex;align-items:center;gap:10px}
.back{color:var(--muted);cursor:pointer;font-size:11px}
.back:hover{color:var(--orange)}
.drow{display:flex;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);align-items:flex-start;flex-wrap:wrap}
.drow:last-child{border-bottom:none}
.dlabel{color:var(--muted);font-size:10px;letter-spacing:.08em;text-transform:uppercase;min-width:140px;padding-top:1px}
.dval{color:var(--text);font-size:12px;word-break:break-all}
.dval .link{color:var(--blue);cursor:pointer}
.dval .link:hover{text-decoration:underline}

/* ── Loading / empty ── */
.loading{color:var(--muted);padding:32px 16px;text-align:center;font-size:12px}
.empty{color:var(--muted);padding:24px 16px;text-align:center;font-size:11px}

/* ── Refresh ticker ── */
.ticker{color:var(--dim);font-size:10px}
</style>
</head>
<body>

<header>
  <div class="logo" onclick="nav('#/')">🔥 <span>Ember</span>chain</div>
  <div class="search-wrap">
    <input id="search" placeholder="Search block # / tx hash / address…" onkeydown="if(event.key==='Enter')doSearch()"/>
    <button class="search-btn" onclick="doSearch()">⌕</button>
  </div>
  <div class="live"><span class="dot"></span> <span id="liveBlock">—</span> <span class="ticker" id="ticker"></span></div>
</header>

<main id="main">
  <div class="loading">Loading…</div>
</main>

<script>
const API = '${api}';

// ── Utilities ─────────────────────────────────────────────────────────────────

function short(h, head=10, tail=8) {
  if (!h) return '—';
  if (h.length <= head+tail+3) return h;
  return h.slice(0,head)+'…'+h.slice(-tail);
}
function ago(ts) {
  if (!ts) return '—';
  const s = Math.floor((Date.now()/1000) - ts);
  if (s < 5) return 'just now';
  if (s < 60) return s+'s ago';
  if (s < 3600) return Math.floor(s/60)+'m ago';
  if (s < 86400) return Math.floor(s/3600)+'h ago';
  return Math.floor(s/86400)+'d ago';
}
function embr(wei) {
  if (!wei) return '0 EMBR';
  try {
    const v = Number(BigInt(wei)) / 1e18;
    return v.toLocaleString(undefined,{maximumFractionDigits:4})+' EMBR';
  } catch { return wei+' wei'; }
}
function fmt(n) { return Number(n).toLocaleString(); }

// ── Fetch wrappers ────────────────────────────────────────────────────────────

async function get(path) {
  const r = await fetch(API+path);
  if (!r.ok) throw new Error(r.status);
  return r.json();
}

// ── Router ────────────────────────────────────────────────────────────────────

function nav(hash) { location.hash = hash; }

window.addEventListener('hashchange', render);
window.addEventListener('load', () => { startRefresh(); render(); });

let _refreshTimer, _tickTimer, _tickSecs=15;

function startRefresh() {
  clearInterval(_refreshTimer);
  clearInterval(_tickTimer);
  _tickSecs = 15;
  updateTicker();
  _refreshTimer = setInterval(() => { _tickSecs=15; render(); }, 15000);
  _tickTimer    = setInterval(() => { _tickSecs--; updateTicker(); }, 1000);
}
function updateTicker() {
  const el = document.getElementById('ticker');
  if (el) el.textContent = 'refresh in '+Math.max(0,_tickSecs)+'s';
}

async function render() {
  const hash = location.hash.replace(/^#\/?/,'');
  const parts = hash.split('/');
  const main = document.getElementById('main');
  main.innerHTML = '<div class="loading">Loading…</div>';
  try {
    if (!hash || hash === '/') {
      await renderHome(main);
    } else if (parts[0]==='block' && parts[1]) {
      await renderBlock(main, parts[1]);
    } else if (parts[0]==='tx' && parts[1]) {
      await renderTx(main, parts[1]);
    } else if (parts[0]==='address' && parts[1]) {
      await renderAddress(main, parts[1]);
    } else if (parts[0]==='blocks') {
      await renderBlockList(main);
    } else if (parts[0]==='txs') {
      await renderTxList(main);
    } else {
      main.innerHTML = '<div class="empty">Page not found.</div>';
    }
  } catch(e) {
    main.innerHTML = '<div class="empty">Error loading data: '+e.message+'</div>';
  }
}

// ── Search ────────────────────────────────────────────────────────────────────

function doSearch() {
  const q = (document.getElementById('search').value||'').trim();
  if (!q) return;
  if (/^\\d+$/.test(q)) { nav('#/block/'+q); }
  else if (q.startsWith('0x') && q.length>=40) {
    // Could be tx (66 chars) or address (42 chars)
    if (q.length===66) nav('#/tx/'+q);
    else nav('#/address/'+q);
  } else {
    nav('#/address/'+q);
  }
  document.getElementById('search').value='';
}

// ── Home ──────────────────────────────────────────────────────────────────────

async function renderHome(main) {
  const [status, blocks, txs, mining, peers] = await Promise.all([
    get('/chain/status').catch(()=>null),
    get('/chain/blocks?limit=10').catch(()=>[]),
    get('/transactions?limit=10').catch(()=>[]),
    get('/mining/status').catch(()=>null),
    get('/sync/peers').catch(()=>({peers:[]})),
  ]);

  // Update live block in header
  if (status?.latestBlock?.number != null) {
    document.getElementById('liveBlock').textContent = '#'+fmt(status.latestBlock.number);
  }

  const totalTx = status?.totalTransactions ?? '—';
  const peerCount = (peers?.peers?.length ?? 0);
  const diff = mining?.difficulty ?? status?.difficulty ?? '—';
  const blockHeight = status?.latestBlock?.number ?? '—';

  main.innerHTML =
    \`<div class="stats">
      <div class="stat">
        <div class="stat-label">Latest Block</div>
        <div class="stat-value">\${blockHeight!=='—'?fmt(blockHeight):'—'}</div>
        <div class="stat-sub">\${status?.latestBlock?.timestamp?ago(status.latestBlock.timestamp):''}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Transactions</div>
        <div class="stat-value">\${totalTx!=='—'?fmt(totalTx):'—'}</div>
        <div class="stat-sub">all time</div>
      </div>
      <div class="stat">
        <div class="stat-label">Peers</div>
        <div class="stat-value">\${peerCount}</div>
        <div class="stat-sub">connected</div>
      </div>
      <div class="stat">
        <div class="stat-label">Difficulty</div>
        <div class="stat-value" style="font-size:.9rem">\${diff!=='—'?fmt(diff):'—'}</div>
        <div class="stat-sub">current</div>
      </div>
    </div>
    <div class="panels">
      <div class="panel">
        <div class="panel-head">
          <span class="panel-title">Latest Blocks</span>
          <a class="panel-more" onclick="nav('#/blocks')">View all →</a>
        </div>
        \${blocksTable(blocks)}
      </div>
      <div class="panel">
        <div class="panel-head">
          <span class="panel-title">Latest Transactions</span>
          <a class="panel-more" onclick="nav('#/txs')">View all →</a>
        </div>
        \${txTable(txs)}
      </div>
    </div>\`;
}

// ── Block list ────────────────────────────────────────────────────────────────

async function renderBlockList(main) {
  const blocks = await get('/chain/blocks?limit=50');
  main.innerHTML =
    \`<div class="panel">
      <div class="panel-head">
        <span class="panel-title">All Blocks (latest 50)</span>
        <a class="panel-more" onclick="nav('#/')">← Home</a>
      </div>
      \${blocksTable(blocks)}
    </div>\`;
}

function blocksTable(blocks) {
  if (!blocks || !blocks.length) return '<div class="empty">No blocks yet.</div>';
  const rows = blocks.map(b=>\`
    <tr onclick="nav('#/block/\${b.number}')">
      <td><span class="num">#\${fmt(b.number)}</span><br><span class="age">\${ago(b.timestamp)}</span></td>
      <td><span class="addr" title="\${b.miner}">\${short(b.miner,8,6)}</span><br><span class="age">miner</span></td>
      <td><span class="badge">\${b.transactionCount} tx</span></td>
    </tr>\`).join('');
  return \`<table class="tbl">\${rows}</table>\`;
}

// ── Tx list ───────────────────────────────────────────────────────────────────

async function renderTxList(main) {
  const txs = await get('/transactions?limit=50');
  main.innerHTML =
    \`<div class="panel">
      <div class="panel-head">
        <span class="panel-title">All Transactions (latest 50)</span>
        <a class="panel-more" onclick="nav('#/')">← Home</a>
      </div>
      \${txTable(txs)}
    </div>\`;
}

function txTable(txs) {
  if (!txs || !txs.length) return '<div class="empty">No transactions yet.</div>';
  const rows = txs.map(tx=>\`
    <tr onclick="nav('#/tx/\${tx.hash}')">
      <td><span class="hash" title="\${tx.hash}">\${short(tx.hash,8,6)}</span><br><span class="age">\${ago(tx.timestamp)}</span></td>
      <td>
        <span class="age">From</span> <span class="addr" title="\${tx.from}">\${short(tx.from,6,4)}</span><br>
        <span class="age">To&nbsp;&nbsp;&nbsp;</span> <span class="addr" title="\${tx.to}">\${tx.to?short(tx.to,6,4):'contract'}</span>
      </td>
      <td>
        <span class="val">\${embr(tx.value)}</span><br>
        <span class="\${tx.status==='success'?'ok':'fail'}" style="font-size:10px">\${tx.status==='success'?'✓ ok':'✗ fail'}</span>
      </td>
    </tr>\`).join('');
  return \`<table class="tbl">\${rows}</table>\`;
}

// ── Block detail ──────────────────────────────────────────────────────────────

async function renderBlock(main, num) {
  const block = await get('/chain/blocks/'+num);
  const prevNum = block.number > 0 ? block.number-1 : null;
  const nextNum = block.number+1;

  const payoutRows = (block.payouts||[]).map(p=>
    \`<div class="drow">
      <div class="dlabel">Payout</div>
      <div class="dval"><span class="link" onclick="nav('#/address/\${p.address}')">\${p.address}</span> → \${embr(p.amount)}</div>
    </div>\`
  ).join('');

  const txRows = (block.transactions||[]).map(tx=>
    \`<div class="drow">
      <div class="dlabel">Tx</div>
      <div class="dval">
        <span class="link" onclick="nav('#/tx/\${tx.hash}')">\${short(tx.hash,12,8)}</span>
        &nbsp;·&nbsp; \${embr(tx.value)}
        &nbsp;·&nbsp; <span class="\${tx.status==='success'?'ok':'fail'}">\${tx.status==='success'?'✓':'✗'}</span>
      </div>
    </div>\`
  ).join('');

  const nav_ = \`
    \${prevNum!==null?'<a class="panel-more" onclick="nav(\'#/block/'+prevNum+'\')">← Prev</a>':''}&nbsp;
    <a class="panel-more" onclick="nav(\'#/block/'+nextNum+'\')">Next →</a>
  \`;

  main.innerHTML =
    \`<div class="detail">
      <div class="detail-title">
        <span class="back" onclick="nav('#/')">← Explorer</span>
        &nbsp;/&nbsp; Block #\${fmt(block.number)}
        <span style="margin-left:auto">\${nav_}</span>
      </div>
      <div class="drow"><div class="dlabel">Block #</div><div class="dval">\${fmt(block.number)}</div></div>
      <div class="drow"><div class="dlabel">Time</div><div class="dval">\${ago(block.timestamp)} &nbsp;·&nbsp; \${block.timestamp?new Date(block.timestamp*1000).toUTCString():'—'}</div></div>
      <div class="drow"><div class="dlabel">Hash</div><div class="dval" style="word-break:break-all">\${block.hash||'—'}</div></div>
      <div class="drow"><div class="dlabel">Parent Hash</div><div class="dval">\${prevNum!==null?\`<span class="link" onclick="nav('#/block/\${prevNum}')">\${short(block.parentHash,16,12)}</span>\`:short(block.parentHash,16,12)}</div></div>
      <div class="drow"><div class="dlabel">Miner</div><div class="dval"><span class="link" onclick="nav('#/address/\${block.miner}')">\${block.miner||'—'}</span></div></div>
      <div class="drow"><div class="dlabel">Difficulty</div><div class="dval">\${fmt(block.difficulty)}</div></div>
      <div class="drow"><div class="dlabel">Nonce</div><div class="dval">\${block.nonce||'—'}</div></div>
      <div class="drow"><div class="dlabel">Transactions</div><div class="dval">\${(block.transactions||[]).length}</div></div>
      \${payoutRows}
      \${txRows}
    </div>\`;
}

// ── Tx detail ─────────────────────────────────────────────────────────────────

async function renderTx(main, hash) {
  const tx = await get('/transactions/'+hash);
  main.innerHTML =
    \`<div class="detail">
      <div class="detail-title">
        <span class="back" onclick="nav('#/')">← Explorer</span>
        &nbsp;/&nbsp; Transaction
      </div>
      <div class="drow"><div class="dlabel">Hash</div><div class="dval" style="word-break:break-all">\${tx.hash}</div></div>
      <div class="drow"><div class="dlabel">Status</div><div class="dval"><span class="\${tx.status==='success'?'ok':'fail'}">\${tx.status==='success'?'✓ Success':'✗ Failed'}</span></div></div>
      <div class="drow"><div class="dlabel">Time</div><div class="dval">\${ago(tx.timestamp)} &nbsp;·&nbsp; \${tx.timestamp?new Date(tx.timestamp*1000).toUTCString():'—'}</div></div>
      <div class="drow"><div class="dlabel">Block</div><div class="dval">\${tx.blockNumber!=null?\`<span class="link" onclick="nav('#/block/\${tx.blockNumber}')">#\${fmt(tx.blockNumber)}</span>\`:'—'}</div></div>
      <div class="drow"><div class="dlabel">From</div><div class="dval"><span class="link" onclick="nav('#/address/\${tx.from}')">\${tx.from||'—'}</span></div></div>
      <div class="drow"><div class="dlabel">To</div><div class="dval">\${tx.to?\`<span class="link" onclick="nav('#/address/\${tx.to}')">\${tx.to}</span>\`:'— (contract creation)'}</div></div>
      \${tx.contractAddress?\`<div class="drow"><div class="dlabel">Contract</div><div class="dval"><span class="link" onclick="nav('#/address/\${tx.contractAddress}')">\${tx.contractAddress}</span></div></div>\`:''}
      <div class="drow"><div class="dlabel">Value</div><div class="dval">\${embr(tx.value)}</div></div>
      <div class="drow"><div class="dlabel">Gas Used</div><div class="dval">\${tx.gasUsed!=null?fmt(tx.gasUsed):'—'}</div></div>
      <div class="drow"><div class="dlabel">Nonce</div><div class="dval">\${tx.nonce??'—'}</div></div>
      \${tx.input&&tx.input!=='0x'?\`<div class="drow"><div class="dlabel">Input Data</div><div class="dval" style="font-size:10px;word-break:break-all;color:var(--muted)">\${tx.input}</div></div>\`:''}
    </div>\`;
}

// ── Address detail ────────────────────────────────────────────────────────────

async function renderAddress(main, addr) {
  const [wallet, txs] = await Promise.all([
    get('/wallets/'+addr).catch(()=>null),
    get('/transactions?address='+addr+'&limit=50').catch(()=>[]),
  ]);
  const bal = wallet?.balance ?? wallet?.publicBalance ?? null;
  main.innerHTML =
    \`<div class="detail" style="margin-bottom:16px">
      <div class="detail-title">
        <span class="back" onclick="nav('#/')">← Explorer</span>
        &nbsp;/&nbsp; Address
      </div>
      <div class="drow"><div class="dlabel">Address</div><div class="dval" style="word-break:break-all">\${addr}</div></div>
      <div class="drow"><div class="dlabel">Balance</div><div class="dval">\${bal!=null?embr(bal):'—'}</div></div>
      <div class="drow"><div class="dlabel">Transactions</div><div class="dval">\${txs.length}</div></div>
    </div>
    <div class="panel">
      <div class="panel-head"><span class="panel-title">Transactions</span></div>
      \${txTable(txs)}
    </div>\`;
}
</script>
</body>
</html>`;
}
