import { Download, Terminal, Cpu, HardDrive, Zap, CheckCircle2, Copy, Monitor, Apple, Tv2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Shell } from "@/components/layout/shell";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const files = [
  {
    name: "emberchain-miner.js",
    label: "Standalone Miner",
    size: "~15 KB",
    icon: Cpu,
    description: "Single file. Download and run anywhere Node.js is installed. Mine EMBR from your own computer — rewards paid proportionally by shares.",
    color: "text-orange-400",
    border: "border-orange-400/30",
    bg: "bg-orange-400/5",
    glow: "hover:border-orange-400/60",
    usage: "node emberchain-miner.js --address 0xYourAddress --intensity 3",
    note: "Only needs Node.js 20+. No other dependencies.",
  },
  {
    name: "emberchain-node.js",
    label: "Node Launcher",
    size: "~6 KB",
    icon: HardDrive,
    description: "Downloads the full chain state from any peer on first run, then starts a local RPC node. Needs server.mjs in the same folder.",
    color: "text-blue-400",
    border: "border-blue-400/30",
    bg: "bg-blue-400/5",
    glow: "hover:border-blue-400/60",
    usage: "node emberchain-node.js --peer https://emberchain.org --port 8545",
    note: "Download server.mjs too — place both files in the same folder.",
  },
  {
    name: "server.mjs",
    label: "Bundled Server",
    size: "~3.5 MB",
    icon: Zap,
    description: "The complete Emberchain API server, bundled into a single file. Spawned automatically by the node launcher. Required for running a full node.",
    color: "text-purple-400",
    border: "border-purple-400/30",
    bg: "bg-purple-400/5",
    glow: "hover:border-purple-400/60",
    usage: "# Normally started automatically by emberchain-node.js",
    note: "Only needed if you're running a full node (not the miner).",
  },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
      title="Copy"
    >
      {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

export default function Downloads() {
  return (
    <Shell requireWallet={false}>
    <div className="max-w-4xl mx-auto space-y-10">

      {/* Header */}
      <div className="border-b border-border pb-8">
        <h1 className="text-4xl font-display font-bold uppercase tracking-tighter text-foreground mb-2 flex items-center gap-3">
          <Download className="w-8 h-8 text-primary" />
          Downloads
        </h1>
        <p className="text-muted-foreground font-sans text-sm uppercase tracking-widest font-bold">
          Run the miner or a full node on your own computer
        </p>
      </div>

      {/* ── Desktop Wallet App ── */}
      <div className="border border-primary/50 bg-primary/5 rounded-sm p-6 space-y-5 relative overflow-hidden">
        {/* glow accent */}
        <div className="absolute -top-10 -right-10 w-48 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <Monitor className="w-6 h-6 text-primary mt-0.5 shrink-0" />
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="font-display font-bold text-foreground uppercase tracking-wide text-lg">
                  Emberchain Wallet
                </span>
                <span className="text-xs text-primary font-mono bg-primary/10 border border-primary/30 px-2 py-0.5 rounded uppercase tracking-wide">
                  Desktop App
                </span>
              </div>
              <p className="text-muted-foreground font-sans text-sm leading-relaxed max-w-xl">
                Full wallet + embedded Emberchain node in one installer. No MetaMask, no Node.js, no command line.
                Just download, install, and your wallet opens immediately.
              </p>
            </div>
          </div>
        </div>

        {/* Platform buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              label: "Windows",
              sub: "64-bit installer (.exe)",
              Icon: Monitor,
              color: "text-blue-400",
              border: "border-blue-400/40 hover:border-blue-400/80 hover:bg-blue-400/5",
              href: "https://github.com/RedPillPhil/Emberchain/releases/latest/download/Emberchain-Wallet-Setup.exe",
              filename: "Emberchain-Wallet-Setup.exe",
            },
            {
              label: "macOS",
              sub: "Intel + Apple Silicon (.dmg)",
              Icon: Apple,
              color: "text-gray-300",
              border: "border-gray-400/40 hover:border-gray-300/80 hover:bg-gray-400/5",
              href: "https://github.com/RedPillPhil/Emberchain/releases/latest",
              filename: null,
            },
            {
              label: "Linux",
              sub: "AppImage / .deb",
              Icon: Tv2,
              color: "text-orange-300",
              border: "border-orange-300/40 hover:border-orange-300/80 hover:bg-orange-300/5",
              href: "https://github.com/RedPillPhil/Emberchain/releases/latest",
              filename: null,
            },
          ].map(({ label, sub, Icon, color, border, href, filename }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noreferrer"
              {...(filename ? { download: filename } : {})}
              className={`flex items-center gap-3 border rounded-sm px-4 py-3 transition-colors ${border}`}
            >
              <Icon className={`w-5 h-5 shrink-0 ${color}`} />
              <div className="min-w-0">
                <div className="font-display font-bold text-foreground uppercase tracking-wide text-sm flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5" />
                  {label}
                </div>
                <div className="text-muted-foreground text-xs font-sans truncate">{sub}</div>
              </div>
            </a>
          ))}
        </div>

        <p className="text-xs text-muted-foreground font-sans pl-1">
          ✓ No Node.js required &nbsp;·&nbsp; ✓ Runs a full embedded node &nbsp;·&nbsp; ✓ Chain data stored locally &nbsp;·&nbsp;
          Builds posted to{" "}
          <a href="https://github.com/RedPillPhil/Emberchain/releases" target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
            GitHub Releases
          </a>{" "}
          on each tagged version.
        </p>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3 text-muted-foreground">
        <div className="flex-1 border-t border-border" />
        <span className="text-xs uppercase tracking-widest font-sans">Command-line tools</span>
        <div className="flex-1 border-t border-border" />
      </div>

      {/* Requirement callout */}
      <div className="flex items-start gap-3 bg-secondary/40 border border-border rounded-sm p-4 text-sm">
        <Terminal className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <p className="text-muted-foreground font-sans leading-relaxed">
          <span className="text-foreground font-bold">Requirement:</span>{" "}
          <a href="https://nodejs.org" target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
            Node.js 20+
          </a>{" "}
          must be installed. Check with <code className="bg-black/30 px-1 rounded text-xs font-mono">node --version</code>.
          No other install needed — these files are fully self-contained.
        </p>
      </div>

      {/* File cards */}
      <div className="space-y-4">
        {files.map((f) => {
          const Icon = f.icon;
          return (
            <div
              key={f.name}
              className={cn(
                "border rounded-sm p-6 transition-colors",
                f.border, f.bg, f.glow,
              )}
            >
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
                <div className="flex items-start gap-3">
                  <Icon className={cn("w-5 h-5 mt-0.5 shrink-0", f.color)} />
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-display font-bold text-foreground uppercase tracking-wide">
                        {f.label}
                      </span>
                      <span className="text-xs text-muted-foreground font-mono bg-black/20 px-1.5 py-0.5 rounded">
                        {f.size}
                      </span>
                    </div>
                    <p className="text-muted-foreground font-sans text-sm mt-1 leading-relaxed">
                      {f.description}
                    </p>
                  </div>
                </div>
                <a
                  href={`${BASE}/downloads/${f.name}`}
                  download={f.name}
                  className={cn(
                    "shrink-0 flex items-center gap-2 px-4 py-2 rounded-sm border font-display font-bold text-sm uppercase tracking-widest transition-colors",
                    f.border,
                    "hover:bg-white/5 text-foreground",
                  )}
                >
                  <Download className="w-4 h-4" />
                  Download
                </a>
              </div>

              {/* Usage snippet */}
              <div className="bg-black/40 border border-white/5 rounded-sm px-4 py-3 font-mono text-xs text-green-400 flex items-center justify-between gap-2">
                <span className="truncate">{f.usage}</span>
                <CopyButton text={f.usage} />
              </div>

              {f.note && (
                <p className="text-xs text-muted-foreground font-sans mt-2 pl-1">
                  ⚠ {f.note}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Quick-start guide */}
      <div className="space-y-6">
        <h2 className="font-display font-bold text-xl uppercase tracking-tight text-foreground border-b border-border pb-3">
          Quick Start
        </h2>

        {/* Miner */}
        <div>
          <h3 className="font-display font-bold uppercase tracking-wide text-orange-400 mb-3 flex items-center gap-2">
            <Cpu className="w-4 h-4" /> Mining EMBR
          </h3>
          <div className="space-y-2">
            {[
              { n: 1, cmd: "node emberchain-miner.js --address 0xYourWalletAddress", comment: "# Basic — connects to emberchain.org automatically" },
              { n: 2, cmd: "node emberchain-miner.js --address 0xYourWalletAddress --intensity 5", comment: "# Max CPU — earns rewards fastest" },
              { n: 3, cmd: "node emberchain-miner.js --address 0xYourWalletAddress --node http://localhost:8545", comment: "# Mine against your own local node" },
            ].map(({ n, cmd, comment }) => (
              <div key={n} className="bg-black/40 border border-white/5 rounded-sm px-4 py-2.5 font-mono text-xs">
                <div className="text-muted-foreground mb-0.5">{comment}</div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-green-400">{cmd}</span>
                  <CopyButton text={cmd} />
                </div>
              </div>
            ))}
          </div>
          <p className="text-muted-foreground text-xs font-sans mt-2 pl-1">
            Intensity 1–5: 1 = barely uses CPU, 5 = full speed. Rewards are proportional to shares submitted.
          </p>
        </div>

        {/* Full node */}
        <div>
          <h3 className="font-display font-bold uppercase tracking-wide text-blue-400 mb-3 flex items-center gap-2">
            <HardDrive className="w-4 h-4" /> Running a Full Node
          </h3>
          <div className="space-y-2">
            {[
              { cmd: "# 1. Download both files into the same folder:", isComment: true },
              { cmd: "#    emberchain-node.js  +  server.mjs", isComment: true },
              { cmd: "" },
              { cmd: "# 2. Start the node (downloads chain on first run):", isComment: true },
              { cmd: "node emberchain-node.js" },
              { cmd: "" },
              { cmd: "# 3. Add to MetaMask → Add Network:", isComment: true },
              { cmd: "#    RPC URL : http://localhost:8545/api/rpc", isComment: true },
              { cmd: "#    Chain ID: 7773    Currency: EMBR", isComment: true },
            ].map((item, i) =>
              item.cmd === "" ? <div key={i} className="h-1" /> : (
                <div key={i} className="bg-black/40 border border-white/5 rounded-sm px-4 py-2 font-mono text-xs flex items-center justify-between gap-2">
                  <span className={item.isComment ? "text-muted-foreground" : "text-green-400"}>{item.cmd}</span>
                  {!item.isComment && item.cmd && <CopyButton text={item.cmd} />}
                </div>
              )
            )}
          </div>
          <p className="text-muted-foreground text-xs font-sans mt-2 pl-1">
            Add <code className="bg-black/20 px-1 rounded">--resync</code> to refresh chain data. Add <code className="bg-black/20 px-1 rounded">--port 9000</code> to use a different port.
          </p>
        </div>

        {/* Background service */}
        <div>
          <h3 className="font-display font-bold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
            <Terminal className="w-4 h-4" /> Keep Running 24/7
          </h3>
          <div className="space-y-2">
            {[
              { cmd: "npm install -g pm2", comment: "# Install pm2 process manager" },
              { cmd: 'pm2 start "node emberchain-miner.js --address 0xYour" --name embr-miner', comment: "# Start miner" },
              { cmd: 'pm2 start "node emberchain-node.js" --name embr-node', comment: "# Start node" },
              { cmd: "pm2 startup && pm2 save", comment: "# Auto-restart on reboot" },
            ].map(({ cmd, comment }) => (
              <div key={cmd} className="bg-black/40 border border-white/5 rounded-sm px-4 py-2.5 font-mono text-xs">
                <div className="text-muted-foreground mb-0.5">{comment}</div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-green-400">{cmd}</span>
                  <CopyButton text={cmd} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
    </Shell>
  );
}
