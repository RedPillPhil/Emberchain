import React, { useState, useEffect } from 'react';
import { Shell } from '@/components/layout/Shell';
import { TokenIcon } from '@/components/TokenIcon';
import { cn } from '@/lib/utils';
import { Search, Plus, Trash2, ExternalLink } from 'lucide-react';
import { getAllPairs, addCustomPair, removeCustomPair, BUILT_IN_PAIRS, type TradingPair } from '@/lib/custom-pairs';
import { usePublicClient } from 'wagmi';
import { ERC20_ABI } from '@/lib/contracts';
import { Link } from 'wouter';

export default function Tokens() {
  const publicClient = usePublicClient();
  const [pairs, setPairs] = useState<TradingPair[]>(getAllPairs());
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newAddr, setNewAddr] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');

  const refresh = () => setPairs(getAllPairs());

  const filtered = pairs.filter(p =>
    p.symbol.toLowerCase().includes(search.toLowerCase()) ||
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleAdd = async () => {
    const addr = newAddr.trim();
    if (!addr.startsWith('0x') || addr.length !== 42) {
      setAddError('Enter a valid ERC-20 address (0x…, 42 chars)');
      return;
    }
    if (!publicClient) {
      setAddError('Connect wallet or wait for client to load');
      return;
    }
    setAddLoading(true);
    setAddError('');
    try {
      const [symbol, name] = await Promise.all([
        publicClient.readContract({ address: addr as `0x${string}`, abi: ERC20_ABI, functionName: 'symbol' }),
        publicClient.readContract({ address: addr as `0x${string}`, abi: ERC20_ABI, functionName: 'name' }).catch(() => addr),
      ]);
      addCustomPair({ tokenAddress: addr as `0x${string}`, symbol: symbol as string, name: name as string });
      refresh();
      setNewAddr('');
      setShowAdd(false);
    } catch {
      setAddError('Could not resolve symbol — is this an ERC-20 on Base?');
    } finally {
      setAddLoading(false);
    }
  };

  const handleRemove = (tokenAddress: string) => {
    removeCustomPair(tokenAddress);
    refresh();
  };

  return (
    <Shell>
      <div className="h-full overflow-y-auto bg-background p-4 md:p-8">
        <div className="max-w-4xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-white tracking-tight">Token Markets</h1>
              <p className="text-muted-foreground mt-1">
                wEMBR/ETH is live. Add any ERC-20 on Base to trade it on EmberDelta.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-muted-foreground" />
                </div>
                <input
                  type="text"
                  placeholder="Search…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-card border border-border rounded text-sm focus:outline-none focus:border-primary transition-colors text-white"
                />
              </div>
              <button
                onClick={() => setShowAdd(!showAdd)}
                className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground text-sm font-bold rounded hover:bg-primary/90 transition-colors whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                Add Token
              </button>
            </div>
          </div>

          {/* Add Token Form */}
          {showAdd && (
            <div className="bg-card border border-primary/30 rounded p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
              <h3 className="font-semibold text-white text-sm">Add ERC-20 token from Base</h3>
              <p className="text-xs text-muted-foreground">
                EmberDelta's contract supports trading any ERC-20 against ETH — just paste the contract address and it will appear here and in the pair selector.
              </p>
              <div className="flex gap-2">
                <input
                  autoFocus
                  type="text"
                  value={newAddr}
                  onChange={e => { setNewAddr(e.target.value); setAddError(''); }}
                  placeholder="0x… token contract address on Base"
                  className="flex-1 bg-input border border-border rounded px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-primary"
                />
                <button
                  onClick={handleAdd}
                  disabled={addLoading}
                  className="px-4 py-2 bg-primary text-primary-foreground text-sm font-bold rounded hover:bg-primary/90 disabled:opacity-50"
                >
                  {addLoading ? 'Resolving…' : 'Add'}
                </button>
                <button
                  onClick={() => { setShowAdd(false); setNewAddr(''); setAddError(''); }}
                  className="px-3 py-2 bg-secondary text-white text-sm rounded hover:bg-secondary/80"
                >
                  Cancel
                </button>
              </div>
              {addError && <p className="text-xs text-destructive">{addError}</p>}
            </div>
          )}

          {/* Token Table */}
          <div className="bg-card border border-border rounded shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 border-b border-border">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Asset</th>
                    <th className="px-6 py-4 font-semibold">Contract (Base)</th>
                    <th className="px-6 py-4 font-semibold text-center">Status</th>
                    <th className="px-6 py-4 font-semibold text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map(pair => (
                    <tr key={pair.tokenAddress} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <TokenIcon symbol={pair.symbol} size={32} />
                          <div>
                            <div className="font-bold text-white text-base">{pair.symbol}</div>
                            <div className="text-xs text-muted-foreground">{pair.name}</div>
                          </div>
                          {pair.isBuiltIn && (
                            <span className="ml-1 px-1.5 py-0.5 text-[9px] font-bold uppercase bg-primary/20 text-primary border border-primary/30 rounded">
                              official
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <a
                          href={`https://basescan.org/token/${pair.tokenAddress}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-primary transition-colors"
                        >
                          {pair.tokenAddress.slice(0, 10)}…{pair.tokenAddress.slice(-6)}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className={cn(
                          "px-2 py-1 rounded text-xs font-medium",
                          (pair.isBuiltIn || pair.isOfficial)
                            ? "bg-success/10 text-bid"
                            : "bg-secondary text-muted-foreground"
                        )}>
                          {pair.isBuiltIn ? 'Live' : pair.isOfficial ? 'Listed' : 'Custom'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center justify-center gap-2">
                          <Link
                            href="/"
                            className="inline-block px-4 py-1.5 bg-primary/10 text-primary border border-primary/30 rounded font-bold text-xs hover:bg-primary hover:text-primary-foreground transition-all"
                          >
                            Trade
                          </Link>
                          {!pair.isBuiltIn && !pair.isOfficial && (
                            <button
                              onClick={() => handleRemove(pair.tokenAddress)}
                              className="p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded hover:bg-destructive/10"
                              title="Remove custom token"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">
                        {search ? `No tokens matching "${search}"` : 'No tokens yet — add one above.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            EmberDelta supports any ERC-20/ETH pair. Custom tokens are stored locally in your browser.
          </p>
        </div>
      </div>
    </Shell>
  );
}
