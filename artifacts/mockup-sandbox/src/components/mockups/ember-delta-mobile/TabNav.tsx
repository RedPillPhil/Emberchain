import { useState } from "react";
import {
  BarChart2, BookOpen, TrendingUp, TrendingDown,
  ChevronDown, Wallet, AlertCircle
} from "lucide-react";

type Tab = "chart" | "book" | "buy" | "sell";

const asks = [
  { price: 0.002341, amount: 412.5, total: 0.9652 },
  { price: 0.002318, amount: 880.0, total: 2.0398 },
  { price: 0.002305, amount: 1240.0, total: 2.8582 },
  { price: 0.002290, amount: 630.0, total: 1.4427 },
  { price: 0.002275, amount: 920.0, total: 2.0930 },
];
const bids = [
  { price: 0.002260, amount: 750.0, total: 1.6950 },
  { price: 0.002244, amount: 1100.0, total: 2.4684 },
  { price: 0.002228, amount: 560.0, total: 1.2477 },
  { price: 0.002210, amount: 2200.0, total: 4.8620 },
  { price: 0.002195, amount: 880.0, total: 1.9316 },
];

const maxTotal = Math.max(...[...asks, ...bids].map(r => r.total));

function Sparkline() {
  const pts = [42, 48, 44, 52, 49, 55, 51, 58, 54, 60, 56, 63, 59, 65, 62, 68, 64, 66, 63, 67];
  const h = 120, w = 350, pad = 4;
  const min = Math.min(...pts), max = Math.max(...pts);
  const sx = (i: number) => pad + (i / (pts.length - 1)) * (w - pad * 2);
  const sy = (v: number) => h - pad - ((v - min) / (max - min)) * (h - pad * 2);
  const d = pts.map((v, i) => `${i === 0 ? "M" : "L"} ${sx(i)} ${sy(v)}`).join(" ");
  const fill = `${d} L ${sx(pts.length - 1)} ${h} L ${sx(0)} ${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 120 }}>
      <defs>
        <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f97316" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fill} fill="url(#sg)" />
      <path d={d} fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChartView() {
  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Price header */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold font-mono text-green-400">0.002260</span>
          <span className="text-sm text-green-400">+3.24%</span>
        </div>
        <div className="text-xs text-zinc-500 mt-0.5">≈ $0.00351 USD · Last 24h</div>
      </div>
      {/* Time filters */}
      <div className="flex gap-1 px-4 mb-2">
        {["1H","6H","1D","1W"].map(t => (
          <button key={t} className={`text-xs px-2.5 py-1 rounded ${t === "1D" ? "bg-orange-500 text-white" : "text-zinc-400 hover:text-white"}`}>{t}</button>
        ))}
      </div>
      {/* Chart */}
      <div className="px-2 mb-3">
        <Sparkline />
      </div>
      {/* Stats row */}
      <div className="grid grid-cols-2 gap-px bg-zinc-800 border-t border-b border-zinc-800 mx-0">
        {[
          ["24h High","0.002380"],["24h Low","0.002150"],
          ["24h Vol","4.2M wEMBR"],["Mkt Cap","—"],
        ].map(([l,v]) => (
          <div key={l} className="px-4 py-3 bg-zinc-950">
            <div className="text-xs text-zinc-500">{l}</div>
            <div className="text-sm font-mono text-zinc-200 mt-0.5">{v}</div>
          </div>
        ))}
      </div>
      {/* Recent trades */}
      <div className="px-4 pt-3">
        <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Recent Trades</div>
        <div className="grid grid-cols-3 text-xs text-zinc-500 mb-1">
          <span>Price (ETH)</span><span className="text-right">Amount</span><span className="text-right">Total</span>
        </div>
        {[
          {p:"0.002260",a:"412.5",t:"0.9323",buy:true},
          {p:"0.002244",a:"880.0",t:"1.9747",buy:false},
          {p:"0.002260",a:"1240.0",t:"2.8024",buy:true},
          {p:"0.002228",a:"560.0",t:"1.2477",buy:false},
          {p:"0.002275",a:"750.0",t:"1.7063",buy:true},
        ].map((r,i) => (
          <div key={i} className="grid grid-cols-3 text-xs py-1 border-b border-zinc-800/60">
            <span className={`font-mono ${r.buy ? "text-green-400" : "text-red-400"}`}>{r.p}</span>
            <span className="font-mono text-zinc-300 text-right">{r.a}</span>
            <span className="font-mono text-zinc-400 text-right">{r.t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BookView() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <span className="text-sm font-semibold text-zinc-200">Order Book</span>
        <span className="text-xs text-zinc-500">wEMBR/ETH</span>
      </div>
      <div className="grid grid-cols-3 text-xs text-zinc-500 px-4 py-2">
        <span>Price (ETH)</span><span className="text-right">wEMBR</span><span className="text-right">Total</span>
      </div>
      {/* Asks */}
      <div className="flex flex-col-reverse px-0 flex-1 min-h-0 overflow-y-auto">
        {asks.map((a, i) => (
          <div key={i} className="relative grid grid-cols-3 text-xs px-4 py-1.5">
            <div className="absolute inset-y-0 right-0 bg-red-500/10"
              style={{ width: `${(a.total / maxTotal) * 100}%` }} />
            <span className="font-mono text-red-400 relative z-10">{a.price.toFixed(6)}</span>
            <span className="font-mono text-zinc-300 text-right relative z-10">{a.amount.toFixed(1)}</span>
            <span className="font-mono text-zinc-400 text-right relative z-10">{a.total.toFixed(4)}</span>
          </div>
        ))}
      </div>
      {/* Spread */}
      <div className="flex items-center gap-2 px-4 py-2 border-y border-zinc-800 bg-zinc-900/60">
        <span className="text-green-400 font-mono text-sm font-bold">0.002260</span>
        <span className="text-xs text-zinc-500">Spread: 0.39%</span>
      </div>
      {/* Bids */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {bids.map((b, i) => (
          <div key={i} className="relative grid grid-cols-3 text-xs px-4 py-1.5">
            <div className="absolute inset-y-0 right-0 bg-green-500/10"
              style={{ width: `${(b.total / maxTotal) * 100}%` }} />
            <span className="font-mono text-green-400 relative z-10">{b.price.toFixed(6)}</span>
            <span className="font-mono text-zinc-300 text-right relative z-10">{b.amount.toFixed(1)}</span>
            <span className="font-mono text-zinc-400 text-right relative z-10">{b.total.toFixed(4)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OrderView({ side }: { side: "buy" | "sell" }) {
  const [price, setPrice] = useState("0.002260");
  const [amount, setAmount] = useState("");
  const isBuy = side === "buy";
  const accentClass = isBuy ? "bg-green-500 hover:bg-green-400" : "bg-red-500 hover:bg-red-400";
  const labelClass = isBuy ? "text-green-400" : "text-red-400";
  const eth = price && amount ? (parseFloat(price) * parseFloat(amount)).toFixed(6) : "0.000000";
  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Balances */}
      <div className="mx-4 mt-4 rounded-xl bg-zinc-900 border border-zinc-800 p-3 mb-4">
        <div className="flex items-center gap-1.5 text-xs text-zinc-400 mb-2">
          <Wallet className="w-3.5 h-3.5" />
          <span>DEX Balances (available to trade)</span>
        </div>
        <div className="flex justify-between text-sm">
          <div><div className="text-zinc-500 text-xs">ETH</div><div className="font-mono text-zinc-200">0.0000</div></div>
          <div className="text-right"><div className="text-zinc-500 text-xs">wEMBR</div><div className="font-mono text-zinc-200">0.0000</div></div>
        </div>
        <button className="mt-2 w-full text-xs text-orange-400 border border-orange-500/30 rounded-lg py-1.5 hover:bg-orange-500/10">
          Deposit / Withdraw
        </button>
      </div>
      {/* Price */}
      <div className="px-4 mb-3">
        <label className="text-xs text-zinc-400 mb-1 block">Price (ETH per wEMBR)</label>
        <div className="flex items-center bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden">
          <input className="flex-1 bg-transparent text-sm font-mono text-zinc-100 px-3 py-3 outline-none"
            value={price} onChange={e => setPrice(e.target.value)} placeholder="0.000000" />
          <span className="px-3 text-xs text-zinc-500">ETH</span>
        </div>
      </div>
      {/* Amount */}
      <div className="px-4 mb-2">
        <label className="text-xs text-zinc-400 mb-1 block">Amount (wEMBR)</label>
        <div className="flex items-center bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden">
          <input className="flex-1 bg-transparent text-sm font-mono text-zinc-100 px-3 py-3 outline-none"
            value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
          <span className="px-3 text-xs text-zinc-500">wEMBR</span>
        </div>
      </div>
      {/* Pct shortcuts */}
      <div className="flex gap-2 px-4 mb-4">
        {["25%","50%","75%","MAX"].map(p => (
          <button key={p} className="flex-1 text-xs py-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:bg-zinc-700">{p}</button>
        ))}
      </div>
      {/* Total */}
      <div className="px-4 mb-4">
        <div className="flex justify-between text-xs text-zinc-500 mb-1"><span>Total (ETH)</span></div>
        <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-3">
          <span className="font-mono text-sm text-zinc-300">{eth}</span>
          <span className="ml-auto text-xs text-zinc-500">ETH</span>
        </div>
      </div>
      {/* Info */}
      <div className="mx-4 mb-4 flex gap-1.5 items-start text-xs text-zinc-500 bg-zinc-900/60 rounded-lg p-2.5">
        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>Orders are signed off-chain and matched on-chain by takers. No gas until filled.</span>
      </div>
      {/* CTA */}
      <div className="px-4 pb-6">
        <button className={`w-full py-4 rounded-2xl font-semibold text-white text-sm ${accentClass} transition-colors`}>
          Connect Wallet to {isBuy ? "Buy" : "Sell"}
        </button>
      </div>
    </div>
  );
}

export function TabNav() {
  const [tab, setTab] = useState<Tab>("chart");

  const tabs: { id: Tab; icon: React.ReactNode; label: string }[] = [
    { id: "chart", icon: <BarChart2 className="w-5 h-5" />, label: "Chart" },
    { id: "book",  icon: <BookOpen className="w-5 h-5" />,  label: "Book" },
    { id: "buy",   icon: <TrendingUp className="w-5 h-5" />, label: "Buy" },
    { id: "sell",  icon: <TrendingDown className="w-5 h-5" />, label: "Sell" },
  ];

  return (
    <div className="w-[390px] h-[844px] bg-zinc-950 text-white flex flex-col overflow-hidden"
      style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800 shrink-0">
        <div className="w-7 h-7 rounded-lg bg-orange-500 flex items-center justify-center text-xs font-bold">ED</div>
        <button className="flex items-center gap-1 text-sm font-semibold text-zinc-100">
          wEMBR/ETH <ChevronDown className="w-4 h-4 text-zinc-400" />
        </button>
        <div className="ml-auto flex items-baseline gap-1.5">
          <span className="text-sm font-mono text-green-400">0.002260</span>
          <span className="text-xs text-green-400">+3.24%</span>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "chart" && <ChartView />}
        {tab === "book"  && <BookView />}
        {tab === "buy"   && <OrderView side="buy" />}
        {tab === "sell"  && <OrderView side="sell" />}
      </div>

      {/* Bottom tab bar */}
      <div className="shrink-0 border-t border-zinc-800 bg-zinc-950 grid grid-cols-4 pb-safe">
        {tabs.map(t => {
          const active = t.id === tab;
          const color = t.id === "buy" ? "text-green-400" : t.id === "sell" ? "text-red-400" : "text-orange-400";
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex flex-col items-center gap-0.5 py-3 text-xs font-medium transition-colors
                ${active ? color : "text-zinc-500 hover:text-zinc-300"}`}
            >
              {t.icon}
              <span>{t.label}</span>
              {active && <span className="w-1 h-1 rounded-full bg-current" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
