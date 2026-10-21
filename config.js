// ─────────────────────────────────────────────────────────────
//  BILLION MACHINE — site config. Edit these values, nothing else.
//  Leave a value as '' to show the "awaiting" state on the site.
// ─────────────────────────────────────────────────────────────
export const CONFIG = {
  NAME: 'Billion Machine',
  TICKER: 'BILLION',
  CA: '8meyGYBfo79x6MyANkWGiinhbqhDLQ3KC4Fyooc6pump',            // token mint address. '' → "AWAITING CA", market cap shows $0 · PRE-LAUNCH
  BUY_URL: '',       // e.g. 'https://pump.fun/coin/<CA>'. '' → derived from CA if set
  X_URL: 'https://x.com/billionmachinex',         // e.g. 'https://x.com/billionmachine'
  TREASURY: '7LpS1zDBGyU8QW7g25mK75iK7NeomCnZDhbdYshyu9Aw', // treasury wallet (PUBLIC address only)
  CYCLE_MINUTES: 60, // how often the machine runs a cycle (shown on site)

  // ── live data ──
  // Public Solana mainnet RPCs, tried in order (the last one that worked is tried first next time).
  // Put a private RPC (Helius/QuickNode/etc.) at the top of this list for production traffic.
  RPC_URLS: [
    'https://solana-rpc.publicnode.com',
    'https://api.mainnet-beta.solana.com',
    'https://solana.leorpc.com/?api_key=FREE',
    'https://solana.api.onfinality.io/public',
  ],
  POLL_SECONDS: 45,  // treasury + market cap refresh interval (30–60 recommended)
  TX_LIMIT: 8,       // how many recent treasury transactions to show
  DEXSCREENER: 'https://api.dexscreener.com/latest/dex/tokens/', // + CA. Only used when CA is set.
  // Real on-chain totals the machine has executed. Stay 0 until the machine runs.
  BURNED_TOTAL: 0,
  CYCLES_RUN: 0,
};
