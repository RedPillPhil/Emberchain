import { useState, useRef } from "react";
import { ChevronDown, ChevronUp, Wallet, AlertCircle, X, GripHorizontal } from "lucide-react";

const asks = [
  { price: 0.002341, amount: 412.5, total: 0.9652 },
  { price: 0.002318, amount: 880.0, total: 2.0398 },
  { price: 0.002305, amount: 1240.0, total: 2.8582 },
  { price: 0.002290, amount: 630.0, total: 1.4427 },
];
const bids = [
  { price: 0.002260, amount: 750.0, total: 1.6950 },
  { price: 0.002244, amount: 1100.0, total: 2.4684 },
  { price: 0.002228, amount: 560.0, total: 1.2477 },
  { price: 0.002210, amount: 2200.0, total: 4.8620 },
];
const maxTotal = Math.max(...[...asks, ...bids].map(r => r.total));

function MiniSparkline() {
  const pts = [42, 48, 44, 52, 49, 55, 51, 58, 54, 60, 56, 63, 59, 65, 62, 68, 64, 66, 63, 67];
  const h = 90, w = 350, pad = 2;
  const min = Math.min(...pts), max = Math.max(...pts);
  const sx = (i: number) => pad + (i / (pts.length - 1)) * (w - pad * 2);
  const sy = (v: number) => h - pad - ((v - min) / (max - min)) * (h - pad * 2);
  const d = pts.map((v, i) => `${i === 0 ? "M" : "L"} ${sx(i)} ${sy(v)}`).join(" ");
  const fill = `${d} L ${sx(pts.length - 1)} ${h} L ${sx(0)} ${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 90 }}>
      <defs>
        <linearGradient id="sg3" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f97316" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fill} fill="url(#sg3)" />
      <path d={d} fill="none" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type DrawerState = "closed" | "peek" | "full";

export function DrawerLayout() {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [price, setPrice] = useState("0.002260");
  const [amount, setAmount] = useState("");
  const [drawer, setDrawer] = useState<DrawerState>("peek");

  const isBuy = side === "buy";
  const eth = price && amount ? (parseFloat(price) * parseFloat(amount)).toFixed(6) : "0.000000";

  // Drawer height map (px, from bottom)
  const drawerHeights: Record<DrawerState, number> = { closed: 48, peek: 300, full: 700 };
  const drawerH = drawerHeights[drawer];

  const cycleDrawer = () => {
    setDrawer(d => d === "closed" ? "peek" : d === "peek" ? "full" : "closed");
  };

  return (
    <div className="w-[390px] h-[844px] bg-zinc-950 text-white flex flex-col overflow-hidden relative"
      style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800 shrink-0 z-10 bg-zinc-950">
        <div className="w-7 h-7 rounded-lg bg-orange-500 flex items-center justify-center text-xs font-bold">ED</div>
        <button className="flex items-center gap-1 text-sm font-semibold text-zinc-100">
          wEMBR/ETH <ChevronDown className="w-4 h-4 text-zinc-400" />
        </button>
        <div className="ml-auto text-right">
          <div className="text-sm font-mono text-green-400">0.002260</div>
          <div className="text-xs text-green-400">+3.24%</div>
        </div>
      </div>

      {/* Chart strip */}
      <div className="px-0 border-b border-zinc-800 shrink-0">
        <div className="flex items-center justify-between px-4 pt-2 pb-0">
          <div className="flex gap-1">
            {["1H","6H","1D","1W"].map(t => (
              <button key={t} className={`text-xs px-2 py-0.5 rounded ${t === "1D" ? "bg-orange-500 text-white" : "text-zinc-500"}`}>{t}</button>
            ))}
          </div>
          <div className="flex gap-3 text-xs text-zinc-500">
            <span>H <span className="text-zinc-300 font-mono">0.002380</span></span>
            <span>L <span className="text-zinc-300 font-mono">0.002150</span></span>
          </div>
        </div>
        <div className="px-2">
          <MiniSparkline />
        </div>
      </div>

      {/* Order form — scrollable main area */}
      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: `${drawerH + 8}px` }}>
        {/* Buy/Sell tabs */}
        <div className="flex border-b border-zinc-800">
          <button
            onClick={() => setSide("buy")}
            className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-colors
              ${isBuy ? "border-green-500 text-green-400" : "border-transparent text-zinc-500"}`}>
            Buy wEMBR
          </button>
          <button
            onClick={() => setSide("sell")}
            className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-colors
              ${!isBuy ? "border-red-500 text-red-400" : "border-transparent text-zinc-500"}`}>
            Sell wEMBR
          </button>
        </div>

        {/* Balances */}
        <div className="px-4 py-3 bg-zinc-900/40 border-b border-zinc-800">
          <div className="flex items-center gap-1 text-xs text-zinc-500 mb-2">
            <Wallet className="w-3.5 h-3.5" />
            <span>DEX Balances</span>
            <button className="ml-auto text-orange-400 text-[10px] border border-orange-500/30 rounded px-2 py-0.5">Deposit</button>
          </div>
          <div className="flex justify-between text-xs font-mono">
            <span className="text-zinc-400">ETH <span className="text-zinc-200">0.0000</span></span>
            <span className="text-zinc-400">wEMBR <span className="text-zinc-200">0.0000</span></span>
          </div>
        </div>

        {/* Form fields */}
        <div className="px-4 py-4 space-y-3">
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Price (ETH per wEMBR)</label>
            <div className="flex items-center bg-zinc-900 border border-zinc-700 rounded-xl">
              <input className="flex-1 bg-transparent text-sm font-mono text-zinc-100 px-3 py-2.5 outline-none"
                value={price} onChange={e => setPrice(e.target.value)} />
              <span className="px-3 text-xs text-zinc-500">ETH</span>
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Amount (wEMBR)</label>
            <div className="flex items-center bg-zinc-900 border border-zinc-700 rounded-xl">
              <input className="flex-1 bg-transparent text-sm font-mono text-zinc-100 px-3 py-2.5 outline-none"
                value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
              <span className="px-3 text-xs text-zinc-500">wEMBR</span>
            </div>
          </div>
          <div className="flex gap-2">
            {["25%","50%","75%","MAX"].map(p => (
              <button key={p} className="flex-1 text-xs py-1.5 rounded-lg bg-zinc-800 text-zinc-400">{p}</button>
            ))}
          </div>
          <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5">
            <span className="text-xs text-zinc-500">Total</span>
            <span className="font-mono text-sm text-zinc-300">{eth} ETH</span>
          </div>
          <button className={`w-full py-3.5 rounded-2xl font-semibold text-white text-sm
            ${isBuy ? "bg-green-500" : "bg-red-500"}`}>
            Connect Wallet to {isBuy ? "Buy" : "Sell"}
          </button>
          <div className="flex gap-1.5 items-start text-xs text-zinc-600 pt-1">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>Off-chain orders, on-chain settlement. No gas until filled.</span>
          </div>
        </div>
      </div>

      {/* Bottom sheet drawer — Order Book */}
      <div
        className="absolute inset-x-0 bottom-0 bg-zinc-900 border-t border-zinc-700 rounded-t-2xl z-20 flex flex-col transition-all duration-300 ease-in-out"
        style={{ height: `${drawerH}px` }}
      >
        {/* Drawer handle / header */}
        <button
          onClick={cycleDrawer}
          className="flex items-center justify-between w-full px-4 pt-3 pb-2 shrink-0"
        >
          <div className="flex items-center gap-2">
            <GripHorizontal className="w-4 h-4 text-zinc-600" />
            <span className="text-sm font-semibold text-zinc-200">Order Book</span>
            <span className="text-xs text-zinc-500">6 orders</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-green-400 font-mono">0.002260</span>
            {drawer === "full"
              ? <ChevronDown className="w-4 h-4 text-zinc-400" />
              : <ChevronUp className="w-4 h-4 text-zinc-400" />}
          </div>
        </button>

        {/* Drawer content */}
        {drawer !== "closed" && (
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="grid grid-cols-3 text-xs text-zinc-500 px-4 pb-1">
              <span>Price (ETH)</span><span className="text-right">wEMBR</span><span className="text-right">Total</span>
            </div>
            {asks.slice().reverse().map((a, i) => (
              <div key={i} className="relative grid grid-cols-3 text-xs px-4 py-1.5">
                <div className="absolute inset-y-0 right-0 bg-red-500/10" style={{ width: `${(a.total / maxTotal) * 100}%` }} />
                <span className="font-mono text-red-400 relative z-10">{a.price.toFixed(6)}</span>
                <span className="font-mono text-zinc-300 text-right relative z-10">{a.amount.toFixed(1)}</span>
                <span className="font-mono text-zinc-400 text-right relative z-10">{a.total.toFixed(4)}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 px-4 py-1.5 bg-zinc-950/60 border-y border-zinc-800">
              <span className="text-green-400 font-mono text-sm font-bold">0.002260</span>
              <span className="text-xs text-zinc-500">Spread 0.39%</span>
            </div>
            {bids.map((b, i) => (
              <div key={i} className="relative grid grid-cols-3 text-xs px-4 py-1.5">
                <div className="absolute inset-y-0 right-0 bg-green-500/10" style={{ width: `${(b.total / maxTotal) * 100}%` }} />
                <span className="font-mono text-green-400 relative z-10">{b.price.toFixed(6)}</span>
                <span className="font-mono text-zinc-300 text-right relative z-10">{b.amount.toFixed(1)}</span>
                <span className="font-mono text-zinc-400 text-right relative z-10">{b.total.toFixed(4)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
