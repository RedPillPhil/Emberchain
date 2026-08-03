import { Download, Smartphone, ExternalLink } from "lucide-react";

const RELEASES_URL = "https://github.com/RedPillPhil/Emberchain/releases";
const ANDROID_APK =
  "https://github.com/RedPillPhil/Emberchain/releases/download/android-v1.0.0/emberchain-android.apk";

export default function Downloads() {
  return (
    <div className="max-w-3xl mx-auto space-y-10 px-4 py-10">
      <div className="border-b border-border pb-8">
        <h1 className="text-4xl font-display font-bold uppercase tracking-tighter text-foreground mb-2 flex items-center gap-3">
          <Download className="w-8 h-8 text-primary" />
          Downloads
        </h1>
        <p className="text-muted-foreground font-sans text-sm uppercase tracking-widest font-bold">
          Mobile wallet · sideload ready
        </p>
      </div>

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

        <ul className="text-sm font-sans text-muted-foreground space-y-1 pl-9">
          {[
            "Create or restore wallets with a BIP-39 seed phrase",
            "Send & receive EMBR — public and private transactions",
            "Browser mining direct from your phone",
            "Community chat and forum",
            "PIN lock — auto-locks when you switch apps",
          ].map((f) => (
            <li key={f} className="flex items-start gap-2">
              <span className="text-green-400 mt-0.5">✓</span>
              {f}
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap gap-3">
          <a
            href={ANDROID_APK}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 border border-green-500/50 bg-green-500/10 hover:bg-green-500/20 text-green-300 font-display font-bold uppercase tracking-widest text-sm px-5 py-3 rounded-sm transition-colors"
          >
            <Download className="w-4 h-4" />
            Download APK
          </a>
          <a
            href={RELEASES_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 border border-border hover:border-primary/40 text-muted-foreground hover:text-foreground font-display font-bold uppercase tracking-widest text-sm px-5 py-3 rounded-sm transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            All Releases
          </a>
        </div>

        <div className="bg-black/30 border border-white/5 rounded-sm p-4 space-y-2">
          <p className="text-xs text-muted-foreground font-sans font-bold uppercase tracking-widest mb-3">
            How to install
          </p>
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
          Requires Android 8.0 or later · ~50 MB ·{" "}
          <a
            href={RELEASES_URL}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-2"
          >
            github.com/RedPillPhil/Emberchain/releases
          </a>
        </p>
      </div>
    </div>
  );
}
