export type Token = {
  symbol: string;
  name: string;
  nativeChain: string;
  price: number; // in ETH
  change24h: number;
  volume24h: number; // in ETH
  marketCap: number; // in ETH
};

export type Order = {
  id: string;
  side: 'buy' | 'sell';
  price: number;
  amount: number;
  total: number;
  filled: number;
};

export type Trade = {
  id: string;
  time: string;
  side: 'buy' | 'sell';
  price: number;
  amount: number;
  total: number;
};

export type Candle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export const MOCK_TOKENS: Token[] = [
  { symbol: 'wEMBR', name: 'Emberchain', nativeChain: 'Emberchain', price: 0.000152, change24h: 12.5, volume24h: 45.2, marketCap: 1520.5 },
  { symbol: 'wPEPE', name: 'Pepecoin', nativeChain: 'Pepecoin', price: 0.00000042, change24h: -5.2, volume24h: 120.4, marketCap: 8400.1 },
  { symbol: 'wKAS', name: 'Kaspa', nativeChain: 'Kaspa', price: 0.000041, change24h: 3.1, volume24h: 310.2, marketCap: 95000.0 },
  { symbol: 'wLTC', name: 'Litecoin', nativeChain: 'Litecoin', price: 0.0241, change24h: 1.2, volume24h: 845.1, marketCap: 450200.0 },
  { symbol: 'wDOGE', name: 'Dogecoin', nativeChain: 'Dogecoin', price: 0.000054, change24h: 8.4, volume24h: 1540.2, marketCap: 750000.0 },
  { symbol: 'wBCH', name: 'Bitcoin Cash', nativeChain: 'Bitcoin Cash', price: 0.0712, change24h: -1.1, volume24h: 210.5, marketCap: 120500.0 },
  { symbol: 'wZEC', name: 'Zcash', nativeChain: 'Zcash', price: 0.0084, change24h: -0.5, volume24h: 54.2, marketCap: 42000.0 },
  { symbol: 'wRVN', name: 'Ravencoin', nativeChain: 'Ravencoin', price: 0.0000091, change24h: 4.7, volume24h: 21.8, marketCap: 18500.0 },
];

export const generateOrderBook = (currentPrice: number): { asks: Order[], bids: Order[] } => {
  const asks: Order[] = [];
  const bids: Order[] = [];
  
  let currentAsk = currentPrice * 1.001;
  for (let i = 0; i < 25; i++) {
    const amount = Math.random() * 10000 + 100;
    asks.push({
      id: `ask-${i}`,
      side: 'sell',
      price: currentAsk,
      amount,
      total: currentAsk * amount,
      filled: 0
    });
    currentAsk *= (1 + Math.random() * 0.005);
  }

  let currentBid = currentPrice * 0.999;
  for (let i = 0; i < 25; i++) {
    const amount = Math.random() * 10000 + 100;
    bids.push({
      id: `bid-${i}`,
      side: 'buy',
      price: currentBid,
      amount,
      total: currentBid * amount,
      filled: 0
    });
    currentBid *= (1 - Math.random() * 0.005);
  }

  return { asks: asks.reverse(), bids };
};

export const generateTradeHistory = (currentPrice: number): Trade[] => {
  const trades: Trade[] = [];
  let price = currentPrice;
  let now = new Date();
  
  for (let i = 0; i < 40; i++) {
    const side = Math.random() > 0.5 ? 'buy' : 'sell';
    const amount = Math.random() * 5000 + 50;
    
    trades.push({
      id: `trade-${i}`,
      time: now.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      side,
      price,
      amount,
      total: price * amount
    });
    
    price = side === 'buy' ? price * (1 - Math.random() * 0.002) : price * (1 + Math.random() * 0.002);
    now = new Date(now.getTime() - Math.random() * 60000);
  }
  
  return trades;
};

export const generateCandles = (currentPrice: number, points: number = 60): Candle[] => {
  const candles: Candle[] = [];
  let p = currentPrice * 0.8;
  let now = new Date();
  now.setMinutes(now.getMinutes() - points * 15);
  
  for (let i = 0; i < points; i++) {
    const open = p;
    const high = open * (1 + Math.random() * 0.02);
    const low = open * (1 - Math.random() * 0.02);
    const close = low + Math.random() * (high - low);
    const volume = Math.random() * 50000;
    
    candles.push({
      time: now.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' }),
      open,
      high,
      low,
      close,
      volume
    });
    
    p = close;
    now.setMinutes(now.getMinutes() + 15);
  }
  
  return candles;
};
