import React from 'react';
import { MessageCircleMore, ExternalLink, Sparkles } from 'lucide-react';
import { Shell } from '@/components/layout/Shell';

const COMMUNITY_LINKS = [
  {
    title: 'Discord',
    description: 'Live community chat and support.',
    href: import.meta.env.VITE_COMMUNITY_DISCORD_URL || 'https://discord.com/invite/emberchain',
  },
  {
    title: 'Telegram',
    description: 'Fast updates and community discussion.',
    href: import.meta.env.VITE_COMMUNITY_TELEGRAM_URL || 'https://t.me/emberchain',
  },
  {
    title: 'X / Twitter',
    description: 'Announcements and ecosystem news.',
    href: import.meta.env.VITE_COMMUNITY_X_URL || 'https://x.com/emberchain',
  },
];

export default function Community() {
  return (
    <Shell>
      <div className="h-full overflow-y-auto bg-background">
        <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-border bg-card/70 p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-primary/15 p-3 text-primary">
                <MessageCircleMore className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                  Community
                </p>
                <h1 className="text-2xl font-semibold text-foreground">Community chat and discussion</h1>
              </div>
            </div>

            <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground">
              This page is now fully independent of Replit and can be hosted on Vercel like the rest of the Ember Delta experience.
              Use the buttons below to join the community channels you prefer, or set your own links through environment variables.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {COMMUNITY_LINKS.map((link) => (
              <a
                key={link.title}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="group rounded-2xl border border-border bg-card/70 p-5 transition hover:border-primary/60 hover:bg-card"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-foreground">{link.title}</h2>
                  <ExternalLink className="h-4 w-4 text-muted-foreground transition group-hover:text-primary" />
                </div>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{link.description}</p>
              </a>
            ))}
          </div>

          <div className="rounded-2xl border border-dashed border-border bg-background/70 p-6">
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <Sparkles className="h-4 w-4" />
              Customise your community links
            </div>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              Add VITE_COMMUNITY_DISCORD_URL, VITE_COMMUNITY_TELEGRAM_URL, or VITE_COMMUNITY_X_URL in your Vercel environment to point this page at your preferred channels.
            </p>
          </div>
        </div>
      </div>
    </Shell>
  );
}
