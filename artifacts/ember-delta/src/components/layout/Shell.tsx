import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { ChevronDown, Wallet, Activity, ArrowRightLeft, Rocket, Menu, LogOut, Copy, ExternalLink, AlertCircle, Plus, X, MessageCircleMore } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TokenIcon } from '@/components/TokenIcon';
import { useWeb3 } from '@/lib/use-web3';
import { getAllPairs, addCustomPair, removeCustomPair, BUILT_IN_PAIRS, type TradingPair } from '@/lib/custom-pairs';
import { resolveApiServer } from '@/lib/config';
import { usePublicClient } from 'wagmi';
import { ERC20_ABI } from '@/lib/contracts';
import { TOKEN_LAUNCH_DOWN } from '@/lib/launch-flags';

interface ShellProps {
  children: React.ReactNode;
  selectedPair?: TradingPair;
  onPairChange?: (pair: TradingPair) => void;
}

export function Shell({ children, selectedPair, onPairChange }: ShellProps) {
  const [location] = useLocation();
  const {
    address, isConnected, isWrongNetwork,
    ethBalance, wembrWalletBalance, embrBalance,
    connectWallet, disconnectWallet, switchToBase,
  } = useWeb3();

  const publicClient = usePublicClient();
  const [isPairDropdownOpen, setIsPairDropdownOpen] = useState(false);
  const [isWalletDropdownOpen, setIsWalletDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [pairs, setPairs] = useState<TradingPair[]>(getAllPairs);

  // Auto-fetch launched tokens from the API and add them to the pairs list
  useEffect(() => {
    const api = resolveApiServer();
    if (!api) return;
    fetch(`${api}/api/token-launch/listings`)
      .then(r => r.json())
      .then((listings: Array<{ wrapped_token_address?: string; wrapped_symbol?: string; token_name?: string; status?: string }>) => {
        let changed = false;
        for (const l of listings) {
          if (l.status === 'live' && l.wrapped_token_address && l.wrapped_symbol) {
            addCustomPair({
              tokenAddress: l.wrapped_token_address as `0x${string}`,
              symbol: l.wrapped_symbol,
              name: l.token_name ? `Wrapped ${l.token_name}` : l.wrapped_symbol,
              isOfficial: true,
            });
            changed = true;
          }
        }
        if (changed) setPairs(getAllPairs());
      })
      .catch(() => { /* ignore — best effort */ });
  }, []);

  // Add pair state
  const [showAddPair, setShowAddPair] = useState(false);
  const [newPairAddress, setNewPairAddress] = useState('');
  const [addPairLoading, setAddPairLoading] = useState(false);
  const [addPairError, setAddPairError] = useState('');

  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = selectedPair ?? BUILT_IN_PAIRS[0];

  const truncateAddress = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

  const handleCopyAddress = () => {
    if (address) navigator.clipboard.writeText(address);
  };

  const handleSelectPair = (pair: TradingPair) => {
    onPairChange?.(pair);
    setIsPairDropdownOpen(false);
  };

  const handleRemovePair = (e: React.MouseEvent, tokenAddress: string) => {
    e.stopPropagation();
    removeCustomPair(tokenAddress);
    setPairs(getAllPairs());
    if (current.tokenAddress.toLowerCase() === tokenAddress.toLowerCase()) {
      onPairChange?.(BUILT_IN_PAIRS[0]);
    }
  };

  const handleAddPair = async () => {
    const addr = newPairAddress.trim();
    if (!addr.startsWith('0x') || addr.length !== 42) {
      setAddPairError('Enter a valid ERC-20 contract address (0x…)');
      return;
    }
    if (!publicClient) {
      setAddPairError('Wallet not ready — connect first');
      return;
    }
    setAddPairLoading(true);
    setAddPairError('');
    try {
      const [symbol, name] = await Promise.all([
        publicClient.readContract({ address: addr as `0x${string}`, abi: ERC20_ABI, functionName: 'symbol' }),
        publicClient.readContract({ address: addr as `0x${string}`, abi: ERC20_ABI, functionName: 'name' }).catch(() => addr),
      ]);
      const pair: TradingPair = {
        tokenAddress: addr as `0x${string}`,
        symbol: symbol as string,
        name: name as string,
      };
      addCustomPair(pair);
      setPairs(getAllPairs());
      setNewPairAddress('');
      setShowAddPair(false);
    } catch (e: any) {
      setAddPairError('Could not read token info — is this a valid ERC-20 on Base?');
    } finally {
      setAddPairLoading(false);
    }
  };

  const navLinks = [
    { href: '/', label: 'Exchange', icon: Activity },
    { href: '/tokens', label: 'Tokens', icon: Menu },
    { href: '/bridge', label: 'Bridge', icon: ArrowRightLeft },
    { href: '/launch', label: 'Launch', icon: Rocket },
    { href: '/community', label: 'Community', icon: MessageCircleMore },
  ];

  return (
    <div className="flex flex-col h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      {/* Top Header */}
      <header className="h-12 border-b border-border bg-card flex items-center justify-between px-4 shrink-0 z-10">
        <div className="flex items-center gap-4 h-full">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 text-primary hover:opacity-80 transition-opacity">
            <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-black text-xs">ED</span>
            </div>
            <span className="font-bold tracking-tight text-white hidden sm:inline-block">Ember Delta</span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center h-full gap-0.5">
            {navLinks.map(link => {
              const isActive = location === link.href;
              const Icon = link.icon;
              const isLaunchPaused = link.href === '/launch' && TOKEN_LAUNCH_DOWN;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  title={isLaunchPaused ? 'Token launch is paused' : undefined}
                  className={cn(
                    "h-full flex items-center px-3 text-sm font-medium border-b-2 transition-colors",
                    isLaunchPaused && "opacity-40 cursor-default",
                    isActive
                      ? "border-primary text-white"
                      : "border-transparent text-muted-foreground hover:text-white hover:bg-white/5"
                  )}
                >
                  <Icon className="w-4 h-4 mr-1.5" />
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* Pair Selector (exchange only) */}
          {location === '/' && (
            <div className="relative h-full flex items-center hidden sm:flex">
              <div className="h-6 w-px bg-border mx-2" />
              <button
                onClick={() => setIsPairDropdownOpen(!isPairDropdownOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-white/5 transition-colors text-sm font-bold"
              >
                <TokenIcon symbol={current.symbol} size={18} />
                {current.symbol}/ETH
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </button>

              {isPairDropdownOpen && (
                <div className="absolute top-12 left-0 w-72 bg-card border border-border rounded shadow-xl py-1 z-50">
                  <div className="px-3 py-2 text-xs font-semibold text-muted-foreground border-b border-border uppercase">
                    Trading Pairs
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {pairs.map(pair => (
                      <button
                        key={pair.tokenAddress}
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 text-sm text-left transition-colors group",
                          current.tokenAddress === pair.tokenAddress && "bg-primary/10"
                        )}
                        onClick={() => handleSelectPair(pair)}
                      >
                        <div className="flex items-center gap-2">
                          <TokenIcon symbol={pair.symbol} size={16} />
                          <div>
                            <span className="font-medium text-white">{pair.symbol}/ETH</span>
                            {!pair.isBuiltIn && !pair.isOfficial && (
                              <span className="ml-1.5 text-[9px] text-muted-foreground">custom</span>
                            )}
                            {pair.isOfficial && !pair.isBuiltIn && (
                              <span className="ml-1.5 text-[9px] text-primary font-semibold">listed</span>
                            )}
                          </div>
                        </div>
                        {!pair.isBuiltIn && !pair.isOfficial && (
                          <button
                            onClick={e => handleRemovePair(e, pair.tokenAddress)}
                            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all p-1 rounded"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Add Pair */}
                  <div className="border-t border-border px-3 py-2">
                    {!showAddPair ? (
                      <button
                        onClick={() => setShowAddPair(true)}
                        className="w-full flex items-center gap-2 py-1.5 text-xs text-primary hover:text-primary/80 transition-colors font-medium"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add custom ERC-20 pair
                      </button>
                    ) : (
                      <div className="space-y-2 pt-1">
                        <div className="text-[10px] text-muted-foreground">Paste any ERC-20 address on Base:</div>
                        <input
                          autoFocus
                          type="text"
                          value={newPairAddress}
                          onChange={e => { setNewPairAddress(e.target.value); setAddPairError(''); }}
                          placeholder="0x…"
                          className="w-full bg-input border border-border rounded px-2 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-primary"
                        />
                        {addPairError && (
                          <p className="text-[10px] text-destructive">{addPairError}</p>
                        )}
                        <div className="flex gap-1.5">
                          <button
                            onClick={handleAddPair}
                            disabled={addPairLoading}
                            className="flex-1 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded hover:bg-primary/90 disabled:opacity-50"
                          >
                            {addPairLoading ? 'Resolving…' : 'Add'}
                          </button>
                          <button
                            onClick={() => { setShowAddPair(false); setNewPairAddress(''); setAddPairError(''); }}
                            className="px-3 py-1.5 bg-secondary text-xs text-white rounded hover:bg-secondary/80"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Wallet */}
        <div className="flex items-center gap-3">
          {!isConnected ? (
            <button
              onClick={connectWallet}
              className="h-8 px-4 bg-primary text-primary-foreground text-xs font-bold rounded hover:bg-primary/90 transition-colors flex items-center gap-2"
            >
              <Wallet className="w-4 h-4" />
              <span className="hidden sm:inline">Connect Wallet</span>
              <span className="sm:hidden">Connect</span>
            </button>
          ) : isWrongNetwork ? (
            <button
              onClick={switchToBase}
              className="h-8 px-4 bg-orange-500 text-white text-xs font-bold rounded hover:bg-orange-600 transition-colors flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4" />
              <span className="hidden sm:inline">Switch to Base</span>
              <span className="sm:hidden">Switch</span>
            </button>
          ) : (
            <div className="relative">
              {/* ETH balance pill with hover tooltip */}
              <div className="flex items-center bg-background border border-border rounded text-xs font-mono h-8 group">
                <div
                  className="px-3 border-r border-border text-muted-foreground hidden sm:block relative cursor-default select-none"
                  onMouseEnter={() => setShowTooltip(true)}
                  onMouseLeave={() => setShowTooltip(false)}
                >
                  {ethBalance !== null ? `${ethBalance.toFixed(4)} ETH` : '— ETH'}

                  {/* Hover tooltip */}
                  {showTooltip && (
                    <div className="absolute top-8 left-0 z-50 bg-popover border border-border rounded shadow-xl p-3 min-w-[200px] text-left pointer-events-none">
                      <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-2">Balances</div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-6">
                          <div className="flex items-center gap-1.5 text-white/70">
                            <TokenIcon symbol="ETH" size={12} />
                            <span>ETH <span className="text-[9px] text-muted-foreground">(Base)</span></span>
                          </div>
                          <span className="text-white font-bold">{ethBalance?.toFixed(4) ?? '—'}</span>
                        </div>
                        <div className="flex items-center justify-between gap-6">
                          <div className="flex items-center gap-1.5 text-white/70">
                            <TokenIcon symbol="wEMBR" size={12} />
                            <span>wEMBR <span className="text-[9px] text-muted-foreground">(Base)</span></span>
                          </div>
                          <span className="text-white font-bold">
                            {wembrWalletBalance !== null ? wembrWalletBalance.toFixed(4) : '—'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-6">
                          <div className="flex items-center gap-1.5 text-white/70">
                            <TokenIcon symbol="EMBR" size={12} />
                            <span>EMBR <span className="text-[9px] text-muted-foreground">(Emberchain)</span></span>
                          </div>
                          <span className={cn("font-bold", embrBalance !== null ? "text-white" : "text-muted-foreground")}>
                            {embrBalance !== null ? embrBalance.toFixed(4) : 'fetching…'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div
                  className="px-3 text-white flex items-center gap-2 cursor-pointer hover:bg-white/5 h-full transition-colors"
                  onClick={() => setIsWalletDropdownOpen(!isWalletDropdownOpen)}
                >
                  <div className="w-2 h-2 rounded-full bg-blue-500" title="Base Network" />
                  {truncateAddress(address || '')}
                  <ChevronDown className="w-3 h-3 text-muted-foreground" />
                </div>
              </div>

              {isWalletDropdownOpen && (
                <div className="absolute top-10 right-0 w-52 bg-card border border-border rounded shadow-xl py-1 z-50">
                  <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border">
                    <div className="flex justify-between items-center mb-1">
                      <span>Base Mainnet</span>
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                    </div>
                    <div className="font-mono text-white text-[11px] truncate">{address}</div>
                  </div>
                  <button
                    onClick={() => { handleCopyAddress(); setIsWalletDropdownOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 text-sm text-left transition-colors text-white"
                  >
                    <Copy className="w-4 h-4 text-muted-foreground" />
                    Copy Address
                  </button>
                  <a
                    href={`https://basescan.org/address/${address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 text-sm text-left transition-colors text-white"
                    onClick={() => setIsWalletDropdownOpen(false)}
                  >
                    <ExternalLink className="w-4 h-4 text-muted-foreground" />
                    View on Basescan
                  </a>
                  <button
                    onClick={() => { disconnectWallet(); setIsWalletDropdownOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-destructive/10 text-sm text-left transition-colors text-destructive"
                  >
                    <LogOut className="w-4 h-4" />
                    Disconnect
                  </button>
                </div>
              )}
            </div>
          )}

          <button
            className="md:hidden p-1.5 text-muted-foreground hover:text-white"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-card border-b border-border flex flex-col z-20">
          {navLinks.map(link => {
            const isActive = location === link.href;
            const isLaunchPaused = link.href === '/launch' && TOKEN_LAUNCH_DOWN;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                title={isLaunchPaused ? 'Token launch is paused' : undefined}
                className={cn(
                  "p-4 border-b border-border/50 text-sm font-medium flex items-center",
                  isLaunchPaused && "opacity-40",
                  isActive ? "text-primary bg-primary/5" : "text-foreground"
                )}
              >
                <link.icon className="w-5 h-5 mr-3 opacity-70" />
                {link.label}
              </Link>
            );
          })}
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative w-full h-full">
        {children}
      </main>
    </div>
  );
}
