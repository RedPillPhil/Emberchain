Emberchain Node & Miner — Standalone Package
=============================================

REQUIREMENTS: Node.js 20 or newer (https://nodejs.org)

These three files must be in the same folder:
  emberchain-node.js   — node launcher
  emberchain-miner.js  — standalone miner
  server.mjs           — bundled server (used by the node launcher)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  FULL NODE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Run your own Emberchain node. First run downloads the full chain
  history (~several MB). Subsequent runs start instantly.

  node emberchain-node.js

  Options:
    --peer    <url>    Bootstrap peer (default: https://emberchain.org)
    --port    <port>   Local port     (default: 8545)
    --data    <dir>    Data directory (default: ./emberchain-data)
    --resync           Force re-download chain snapshot
    --url     <url>    YOUR node's public URL — registers you with the
                       network so peers broadcast new blocks to you and
                       you can serve other users
                       Example: --url https://my-node.example.com

  After startup, connect your Desktop Wallet:
    Settings → Node URL → http://localhost:8545/api

  Or add to MetaMask:
    Network name : Emberchain
    RPC URL      : http://localhost:8545/api/rpc
    Chain ID     : 7773
    Currency     : EMBR

  NOTE: To be a full P2P participant, run with --url so other nodes
  can gossip blocks to you. Without it you still sync via polling
  but won't receive or broadcast blocks in real time.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  STANDALONE MINER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Mine EMBR from your computer. Rewards are paid to your address.

  node emberchain-miner.js --address 0xYourWalletAddress

  Options:
    --address   <0x…>    Your EMBR wallet address (required)
    --node      <url>    Node to mine against (default: https://emberchain.org)
    --intensity <1-5>    CPU usage: 1=eco  3=balanced  5=max (default: 3)

  Mine against your own node:
    node emberchain-miner.js --address 0xABC --node http://localhost:8545

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  RUN AS BACKGROUND SERVICE (Linux/macOS)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  # With pm2:
  npm install -g pm2
  pm2 start "node emberchain-node.js --url https://your-url.com" --name embr-node
  pm2 start "node emberchain-miner.js --address 0xYour"          --name embr-miner
  pm2 startup && pm2 save

  # With screen:
  screen -S embr-node
  node emberchain-node.js --url https://your-url.com
  # Ctrl+A, D  to detach

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  HOW THE P2P NETWORK WORKS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  1. Your node downloads the chain from the bootstrap peer on first run.
  2. If you provide --url, it registers with that peer (POST /api/sync/peers).
  3. When any node mines a block, it pushes it to all known peers
     (POST /api/sync/submit-block) immediately — no need to wait for polling.
  4. Your node validates every received block's proof-of-work before accepting.
  5. Even without --url, your node polls for new blocks every 30 seconds.

  The network survives without the main server as long as at least two
  nodes that know each other are reachable.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  LINKS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Website  : https://emberchain.org
  Explorer : https://emberchain.org/ledger
  GitHub   : https://github.com/RedPillPhil/Emberchain
