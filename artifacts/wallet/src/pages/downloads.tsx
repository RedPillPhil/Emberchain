import { Download, Monitor, Apple, Tv2, Smartphone } from "lucide-react";

const DESKTOP_RELEASE = "https://github.com/RedPillPhil/Emberchain/releases/tag/desktop-v1.0.18";
const ANDROID_RELEASE = "https://github.com/RedPillPhil/Emberchain/releases/tag/android-v1.0.0";

export default function Downloads() {
  return (
    <div className="max-w-3xl mx-auto space-y-10 px-4 py-10">

      {/* Header */}
      <div className="border-b border-border pb-8">
        <h1 className="text-4xl font-display font-bold uppercase tracking-tighter text-foreground mb-2 flex items-center gap-3">
          <Download className="w-8 h-8 text-primary" />
          Downloads
        </h1>
        <p className="text-muted-foreground font-sans text-sm uppercase tracking-widest font-bold">
          Two apps. Everything you need.
        </p>
      </div>

      {/* ── Desktop App ── */}
      <div className="border border-primary/50 bg-primary/5 rounded-sm p-6 space-y-5 relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-48 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-start gap-3">
          <Monitor className="w-6 h-6 text-primary mt-0.5 shrink-0" />
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-display font-bold text-foreground uppercase tracking-wide text-lg">
                EmberChain Desktop
              </span>
              <span className="text-xs text-primary font-mono bg-primary/10 border border-primary/30 px-2 py-0.5 rounded uppercase tracking-wide">
                v1.0.18 · Latest
              </span>
            </div>
            <p className="text-muted-foreground font-sans text-sm leading-relaxed max-w-xl">
              The all-in-one app — full node, wallet, private transactions, and miner in a single install.
              No MetaMask, no Node.js, no command line.
            </p>
          </div>
        </div>

        {/* What's included */}
        <ul className="text-sm font-sans text-muted-foreground space-y-1 pl-9">
          {[
            "Full embedded EmberChain node — starts automatically",
            "Wallet — send & receive EMBR publicly or privately",
            "Shielded pool — hide sender, receiver, and amount",
            "One-click browser mining",
          ].map(f => (
            <li key={f} className="flex items-start gap-2">
              <span className="text-primary mt-0.5">✓</span>
              {f}
            </li>
          ))}
        </ul>

        {/* Platform buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              label: "Windows",
              sub: "Extract zip → run .exe",
              Icon: Monitor,
              color: "text-blue-400",
              border: "border-blue-400/40 hover:border-blue-400/80 hover:bg-blue-400/5",
            },
            {
              label: "macOS",
              sub: "Intel + Apple Silicon (.dmg)",
              Icon: Apple,
              color: "text-gray-300",
              border: "border-gray-400/40 hover:border-gray-300/80 hover:bg-gray-400/5",
            },
            {
              label: "Linux",
              sub: "AppImage — chmod +x then run",
              Icon: Tv2,
              color: "text-orange-300",
              border: "border-orange-300/40 hover:border-orange-300/80 hover:bg-orange-300/5",
            },
          ].map(({ label, sub, Icon, color, border }) => (
            <a
              key={label}
              href={DESKTOP_RELEASE}
              target="_blank"
              rel="noreferrer"
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
          All builds on{" "}
          <a href={DESKTOP_RELEASE} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
            GitHub — desktop-v1.0.18
          </a>{" "}
          — no account required to download.
        </p>
      </div>

      {/* ── Android Wallet ── */}
      <div className="border border-green-500/40 bg-green-500/5 rounded-sm p-6 space-y-5 relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-48 h-48 bg-green-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-start gap-3">
          <Smartphone className="w-6 h-6 text-green-400 mt-0.5 shrink-0" />
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-display font-bold text-foreground uppercase tracking-wide text-lg">
                EmberChain Android
              </span>
              <span className="text-xs text-green-400 font-mono bg-green-400/10 border border-green-400/30 px-2 py-0.5 rounded uppercase tracking-wide">
                v1.0.0 · Live
              </span>
            </div>
            <p className="text-muted-foreground font-sans text-sm leading-relaxed max-w-xl">
              Your full EMBR wallet in your pocket. Download the APK and sideload directly — no app store required.
            </p>
          </div>
        </div>

        {/* What's included */}
        <ul className="text-sm font-sans text-muted-foreground space-y-1 pl-9">
          {[
            "Create or restore wallets with a BIP-39 seed phrase",
            "Send & receive EMBR — public and private transactions",
            "Browser mining direct from your phone",
            "Community chat and forum",
            "PIN lock — auto-locks when you switch apps",
          ].map(f => (
            <li key={f} className="flex items-start gap-2">
              <span className="text-green-400 mt-0.5">✓</span>
              {f}
            </li>
          ))}
        </ul>

        <a
          href={ANDROID_RELEASE}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 border border-green-500/50 bg-green-500/10 hover:bg-green-500/20 text-green-300 font-display font-bold uppercase tracking-widest text-sm px-5 py-3 rounded-sm transition-colors"
        >
          <Download className="w-4 h-4" />
          Download APK — Android v1.0.0
        </a>

        {/* Install steps */}
        <div className="bg-black/30 border border-white/5 rounded-sm p-4 space-y-2">
          <p className="text-xs text-muted-foreground font-sans font-bold uppercase tracking-widest mb-3">How to install</p>
          {[
            "Download the APK from the link above",
            'Go to Settings → Security → "Install unknown apps" and allow your browser',
            "Open the downloaded APK and tap Install",
            "Launch EmberChain from your app drawer",
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-3 text-sm font-sans text-muted-foreground">
              <span className="text-green-400 font-mono font-bold shrink-0">{i + 1}.</span>
              {step}
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground font-sans pl-1">
          Requires Android 8.0 or later · ~50 MB
        </p>
      </div>

    </div>
  );
}
