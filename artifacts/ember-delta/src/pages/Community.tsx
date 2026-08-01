import React from 'react';
import { MessageCircleMore, ExternalLink, Hash, Send } from 'lucide-react';
import { Shell } from '@/components/layout/Shell';

const SOCIAL_LINKS = [
  {
    title: 'Telegram',
    description: 'Fast updates and community discussion.',
    href: import.meta.env.VITE_COMMUNITY_TELEGRAM_URL || 'https://t.me/emberchain.org',
  },
  {
    title: 'X',
    description: 'Announcements and ecosystem news (@emberchainorg).',
    href: import.meta.env.VITE_COMMUNITY_X_URL || 'https://x.com/emberchainorg',
  },
];

export default function Community() {
  return (
    <Shell>
      <div className="flex flex-col gap-6 pb-8">
        <div className="rounded-xl border border-border bg-card/70 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-primary/15 p-3 text-primary shrink-0">
              <MessageCircleMore className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                Community
              </p>
              <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Chat &amp; discussion</h1>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Live in-app chat runs on the main Emberchain wallet (no Replit required — hosted on your chain node).
                Join us on Telegram and X, or open the wallet community tab for live chat and forum.
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-col sm:flex-row flex-wrap gap-2">
            <a
              href="/community"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Hash className="h-4 w-4" />
              Open live chat (wallet)
            </a>
            {SOCIAL_LINKS.map((link) => (
              <a
                key={link.title}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-semibold hover:border-primary/50"
              >
                {link.title}
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              </a>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {SOCIAL_LINKS.map((link) => (
            <a
              key={link.title}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="group rounded-xl border border-border bg-card/70 p-5 transition hover:border-primary/60 hover:bg-card"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-foreground">{link.title}</h2>
                <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-primary" />
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{link.description}</p>
              <p className="mt-3 text-xs font-mono text-primary/80 break-all">{link.href.replace('https://', '')}</p>
            </a>
          ))}
        </div>

        <div className="rounded-xl border border-dashed border-border bg-background/70 p-5 sm:p-6">
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <Send className="h-4 w-4" />
            In-app live chat
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Connect your EMBR wallet on the main site and go to{' '}
            <a href="/community" className="text-primary underline underline-offset-2">Community</a>
            {' '}for real-time chat and forum posts — synced via your chain node at duckdns.
          </p>
        </div>
      </div>
    </Shell>
  );
}
