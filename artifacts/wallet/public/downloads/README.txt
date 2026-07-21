Emberchain Node & Miner — Standalone Package
=============================================

REQUIREMENTS: Node.js 20 or newer (https://nodejs.org)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  STANDALONE MINER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Mine EMBR from your computer. Rewards are paid proportionally
  based on shares submitted.

  node emberchain-miner.js --address 0xYourWalletAddress

  Options:
    --address   <0x…>   Your EMBR wallet address (required)
    --node      <url>   Node to mine against (default: https://emberchain.org)
    --intensity <1-5>   CPU usage: 1=eco 3=balanced 5=max (default: 3)
    --shares    false   Disable share submission (default: enabled)

  Examples:
    node emberchain-miner.js --address 0xABC123 --intensity 3
    node emberchain-miner.js --address 0xABC123 --node http://localhost:8545 --intensity 5

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  FULL NODE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Run your own Emberchain node. First run downloads the full chain
  history. Subsequent runs start instantly from local data.

  node emberchain-node.js

  Options:
    --peer    <url>   Bootstrap peer (default: https://emberchain.org)
    --port    <port>  Local port (default: 8545)
    --data    <dir>   Data directory (default: ./emberchain-data)
    --resync          Force re-download chain snapshot

  After startup, add to MetaMask:
    Network name : Emberchain
    RPC URL      : http://localhost:8545/api/rpc
    Chain ID     : 7773
    Currency     : EMBR

  NOTE: emberchain-node.js and server.mjs must be in the same folder.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  RUN AS BACKGROUND SERVICE (Linux/macOS)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  # With pm2:
  npm install -g pm2
  pm2 start "node emberchain-miner.js --address 0xYour" --name embr-miner
  pm2 start "node emberchain-node.js" --name embr-node
  pm2 startup && pm2 save

  # With screen:
  screen -S embr-miner
  node emberchain-miner.js --address 0xYour
  # Ctrl+A, D  to detach

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  LINKS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Website  : https://emberchain.org
  Explorer : https://emberchain.org/ledger
