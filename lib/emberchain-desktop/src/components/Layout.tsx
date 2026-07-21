import { ReactNode } from "react";
import { Activity, Send, List, Cpu, Settings as SettingsIcon, Flame } from "lucide-react";
import { Page } from "../pages/WalletApp";

interface NavItem {
  id: Page;
  label: string;
  icon: typeof Activity;
}

const NAV: NavItem[] = [
  { id: "overview", label: "OVERVIEW", icon: Activity },
  { id: "send", label: "TRANSFER", icon: Send },
  { id: "transactions", label: "HISTORY", icon: List },
  { id: "mining", label: "FORGE", icon: Cpu },
  { id: "settings", label: "SETTINGS", icon: SettingsIcon },
];

interface Props {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  children: ReactNode;
}

export default function Layout({ currentPage, onNavigate, children }: Props) {
  return (
    <div className="h-screen flex bg-[var(--background)]">
      {/* Sidebar */}
      <aside className="w-48 flex-shrink-0 border-r border-[var(--border)] flex flex-col">
        {/* Logo */}
        <div className="h-14 flex items-center gap-2 px-4 border-b border-[var(--border)]">
          <Flame className="w-5 h-5 text-[var(--primary)]" />
          <span className="font-bold text-sm uppercase tracking-widest text-[var(--foreground)]"
                style={{ fontFamily: "var(--font-display)" }}>
            EMBR
          </span>
          <span className="ml-auto text-[10px] text-[var(--muted-foreground)] bg-[var(--muted)] px-1.5 py-0.5 rounded-sm">
            LOCAL
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 space-y-0.5 px-2">
          {NAV.map(({ id, label, icon: Icon }) => {
            const active = currentPage === id;
            return (
              <button
                key={id}
                onClick={() => onNavigate(id)}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-sm text-left transition-colors
                  text-xs font-bold uppercase tracking-widest
                  ${active
                    ? "bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/20"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]"}
                `}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </button>
            );
          })}
        </nav>

        {/* Node status pill */}
        <div className="p-3 border-t border-[var(--border)]">
          <div className="flex items-center gap-2 px-2 py-1.5 bg-green-500/10 border border-green-500/20 rounded-sm">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse-slow" />
            <span className="text-[10px] text-green-400 uppercase tracking-widest font-bold">Node Online</span>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
