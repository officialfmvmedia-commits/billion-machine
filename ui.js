// DOM-side UI: config wiring, floors climb, receipts feed, mode panels.
import { CONFIG } from './config.js';

export const FLOORS = [
  { v: 1e6,   amt: '$1M',   ev: 'First Light',        d: 'The first public burn of everything the machine has bought so far.' },
  { v: 5e6,   amt: '$5M',   ev: 'Bigger Lungs',       d: 'DEFEND per-cycle spend cap steps up. Deeper dips, bigger answers.' },
  { v: 1e7,   amt: '$10M',  ev: 'Dividend Dose',      d: 'A one-off SOL payout to holders from the treasury, by snapshot.' },
  { v: 5e7,   amt: '$50M',  ev: 'Deep Burn',          d: 'One large burn. Supply takes a visible step down.' },
  { v: 1e8,   amt: '$100M', ev: 'Overclock',          d: 'Buyback budget expands for every mode that spends.' },
  { v: 2.5e8, amt: '$250M', ev: 'Second Dose',        d: 'A second holder payout, bigger than the first.' },
  { v: 5e8,   amt: '$500M', ev: 'Last Burn Before',   d: 'The largest single burn the machine is allowed to make.' },
  { v: 1e9,   amt: '$1B',   ev: 'The Number',         d: 'The one instruction, complete. What the machine does next is sealed until it gets here.' },
];

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmtUSD = (n) => '$' + Math.round(n).toLocaleString('en-US');

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 1800);
}

function wireConfig() {
  const ca = (CONFIG.CA || '').trim();
  const buy = (CONFIG.BUY_URL || '').trim() || (ca ? `https://pump.fun/coin/${ca}` : '');
  $$('[data-ticker]').forEach((e) => (e.textContent = CONFIG.TICKER));
  $$('[data-cycle-min]').forEach((e) => (e.textContent = CONFIG.CYCLE_MINUTES));
  $$('[data-ca-chip]').forEach((chip) => {
    const txt = $('[data-ca-text]', chip);
    if (ca) {
      chip.classList.add('live');
      txt.textContent = chip.classList.contains('ca-chip') ? ca.slice(0, 4) + '…' + ca.slice(-4) : ca;
      chip.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(ca); toast('CA copied'); } catch { toast(ca); }
      });
    } else {
      txt.textContent = 'AWAITING CA';
      chip.addEventListener('click', () => toast('CA drops at launch'));
    }
  });
  const link = (sel, url, label) => $$(sel).forEach((a) => {
    if (url) { a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.removeAttribute('aria-disabled'); }
    else { a.addEventListener('click', (e) => { e.preventDefault(); toast(label); }); }
  });
  link('[data-buy]', buy, 'Buying opens at launch');
  link('[data-x]', CONFIG.X_URL, 'X link coming at launch');
  const tr = (CONFIG.TREASURY || '').trim();
  link('[data-treasury]', tr ? `https://solscan.io/account/${tr}` : '', 'Treasury wallet published at launch');
  if (!tr) $$('[data-treasury]').forEach((a) => (a.textContent = 'Treasury · awaiting'));
  wireTreasury();
}

// ── live state (shared with the 3D screen in main.js) ──
export const LIVE = {
  sol: null,          // treasury SOL balance (null = not loaded yet)
  mcap: 0,            // real market cap in USD (0 until CA + DexScreener)
  floor: 0,           // floors cleared by the REAL market cap
  burned: +CONFIG.BURNED_TOTAL || 0,
  cycles: +CONFIG.CYCLES_RUN || 0,
  rpc: '',            // endpoint that answered last
  ok: false,
};
const TR = (CONFIG.TREASURY || '').trim();
const short = (a) => a.slice(0, 4) + '…' + a.slice(-4);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtSOL = (n) => n.toLocaleString('en-US', { minimumFractionDigits: n === 0 ? 2 : 2, maximumFractionDigits: n !== 0 && Math.abs(n) < 0.01 ? 6 : 4 });

// ── treasury chips: short address + copy + Solscan ──
function wireTreasury() {
  $$('[data-tr-chip]').forEach((el) => {
    if (!TR) { el.innerHTML = '<span class="tr-addr">AWAITING TREASURY</span>'; return; }
    el.classList.add('is-set');
    el.innerHTML = `<a class="tr-addr" href="https://solscan.io/account/${TR}" target="_blank" rel="noopener" title="${TR}">${short(TR)}<span class="ext">↗</span></a><button type="button" class="tr-copy">COPY</button>`;
    el.querySelector('.tr-copy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(TR); toast('Treasury address copied'); } catch { toast(TR); }
    });
  });
}

// ── floors: scroll-scrubbed climb (decorative) + real market cap line (live) ──
let floorEls = [], meterVal, meterFill, meterFloor, meterHere, lastFloorTxt = '', lastHit = -1;
function buildFloors() {
  const list = $('#floor-list');
  list.innerHTML = FLOORS.map((f, i) => `
    <li class="floor${i === FLOORS.length - 1 ? ' final' : ''}">
      <span class="f-no mono">F${String(i + 1).padStart(2, '0')}</span>
      <span class="f-amt">${f.amt}</span>
      <span class="f-st mono">LOCKED</span>
      <span class="f-ev">UNLOCK · ${f.ev}</span>
      <span class="f-d">${f.d}</span>
      <span class="f-here mono">YOU ARE HERE</span>
    </li>`).join('');
  floorEls = $$('.floor', list);
  meterVal = $('#meter-value'); meterFill = $('#meter-fill'); meterFloor = $('#meter-floor'); meterHere = $('#meter-here');
  renderFloors();
  updateFloors();
}
const pctOf = (v) => (v > 0 ? Math.log10(1 + v) / 9 * 100 : 0);
// scroll → simulated market cap (identical curve to the original version)
function updateFloors() {
  if (!floorEls.length) return;
  const mid = innerHeight * 0.55;
  const c = floorEls.map((el) => { const r = el.getBoundingClientRect(); return r.top + r.height * 0.5; });
  let value;
  if (mid <= c[0]) {
    const span = Math.max(1, innerHeight * 0.5);
    const t = Math.min(1, Math.max(0, 1 - (c[0] - mid) / span));
    value = FLOORS[0].v * t * t;
  } else if (mid >= c[c.length - 1]) value = FLOORS[FLOORS.length - 1].v;
  else {
    let i = 0; while (i < c.length - 1 && mid > c[i + 1]) i++;
    const t = (mid - c[i]) / (c[i + 1] - c[i]);
    const a = Math.log(FLOORS[i].v), b = Math.log(FLOORS[i + 1].v);
    value = Math.exp(a + (b - a) * t);
  }
  let hit = 0;
  floorEls.forEach((el, i) => { if (value >= FLOORS[i].v * 0.999) hit = i + 1; });
  if (hit !== lastHit) {
    lastHit = hit;
    floorEls.forEach((el, i) => {
      const on = i < hit, nx = i === hit;
      el.classList.toggle('hit', on); el.classList.toggle('next', nx);
      el.querySelector('.f-st').textContent = on ? 'CLEARED' : nx ? 'NEXT' : 'LOCKED';
    });
    const nf = FLOORS[hit];
    $('#meter-next').textContent = nf ? `NEXT FLOOR · ${nf.amt} · ${nf.ev.toUpperCase()}` : 'ALL FLOORS CLEARED · THE NUMBER';
  }
  meterVal.textContent = fmtUSD(value);
  meterFill.style.width = pctOf(value).toFixed(2) + '%';
  const ft = `FLOOR ${String(hit).padStart(2, '0')} / 08`;
  if (ft !== lastFloorTxt) { meterFloor.textContent = ft; lastFloorTxt = ft; }
  // "you are here": lights up once the scrub has reached the real market cap
  const reached = value >= (LIVE.mcap || 0) * 0.999;
  meterHere.classList.toggle('on', reached);
}
// real market cap → live line, real floor, "you are here" placement
function renderFloors() {
  const v = LIVE.mcap || 0;
  let hit = 0; FLOORS.forEach((f, i) => { if (v >= f.v) hit = i + 1; });
  LIVE.floor = hit;
  const ca = (CONFIG.CA || '').trim();
  const state = !ca ? 'PRE-LAUNCH' : LIVE.mcapOk ? 'LIVE · DEXSCREENER' : 'AWAITING FIRST TRADE';
  $('#meter-live').innerHTML = `<i class="live"></i>LIVE MC · <b>${fmtUSD(v)}</b> · ${state}`;
  // real floor card (only once a floor is genuinely cleared)
  floorEls.forEach((el, i) => el.classList.toggle('here', hit > 0 && i === hit - 1));
  if (meterHere) meterHere.style.left = pctOf(v).toFixed(2) + '%';
  const sf = $('#st-floor'); if (sf) sf.textContent = String(hit).padStart(2, '0') + ' / 08';
}
async function pollMcap() {
  const ca = (CONFIG.CA || '').trim();
  if (!ca) { LIVE.mcap = 0; LIVE.mcapOk = false; renderFloors(); return; }
  try {
    const r = await fetchT(CONFIG.DEXSCREENER + ca, {}, 8000);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const pairs = (j.pairs || []).filter((p) => p.chainId === 'solana');
    const best = pairs.map((p) => +(p.marketCap || p.fdv || 0)).filter(Number.isFinite).sort((a, b) => b - a)[0];
    if (best > 0) { LIVE.mcap = best; LIVE.mcapOk = true; }
  } catch (e) { console.info('[mcap] unavailable:', e.message); }
  renderFloors();
}

// ── Solana JSON-RPC with fallback + last-good memory ──
function fetchT(url, opts, ms) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  return fetch(url, { ...opts, signal: c.signal }).finally(() => clearTimeout(t));
}
const RPCS = (CONFIG.RPC_URLS || []).filter(Boolean);
let rpcStart = 0;
try { const s = +sessionStorage.getItem('bm-rpc'); if (s >= 0 && s < RPCS.length) rpcStart = s; } catch {}
async function rpc(method, params) {
  let lastErr;
  for (let k = 0; k < RPCS.length; k++) {
    const i = (rpcStart + k) % RPCS.length, url = RPCS[i];
    try {
      const r = await fetchT(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }, 9000);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (j.error) throw new Error('RPC ' + (j.error.code || '') + ' ' + (j.error.message || ''));
      if (i !== rpcStart) { rpcStart = i; try { sessionStorage.setItem('bm-rpc', i); } catch {} }
      LIVE.rpc = new URL(url).host;
      return j.result;
    } catch (e) { lastErr = e; console.info(`[rpc] ${new URL(url).host} ${method} failed: ${e.message}`); }
  }
  throw lastErr || new Error('no RPC configured');
}

// ── live receipts: real treasury transactions ──
const txCache = new Map(); // signature → parsed detail (or null if not fetched)
async function txDetail(sig) {
  if (txCache.has(sig)) return txCache.get(sig);
  let d = null;
  try {
    let tx;
    try { tx = await rpc('getTransaction', [sig, { encoding: 'json', maxSupportedTransactionVersion: 1, commitment: 'confirmed' }]); }
    catch { tx = await rpc('getTransaction', [sig, { encoding: 'json', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }]); }
    if (tx && tx.meta) {
      const m = tx.transaction.message;
      const keys = [...(m.accountKeys || []).map((k) => (typeof k === 'string' ? k : k.pubkey)),
        ...((tx.meta.loadedAddresses && tx.meta.loadedAddresses.writable) || []), ...((tx.meta.loadedAddresses && tx.meta.loadedAddresses.readonly) || [])];
      const ix = keys.indexOf(TR);
      const delta = ix >= 0 ? (tx.meta.postBalances[ix] - tx.meta.preBalances[ix]) / 1e9 : 0;
      d = { delta, fee: tx.meta.fee / 1e9, payer: ix === 0 };
      txCache.set(sig, d);
    }
  } catch { /* amounts optional — row still renders with link */ }
  return d;
}
function rowHTML(s, d) {
  const t = s.blockTime ? new Date(s.blockTime * 1000) : null;
  const when = t ? t.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : 'pending';
  const failed = !!s.err;
  let kind = 'TX', amt = '—', cls = '';
  if (d) {
    if (d.delta > 0) { kind = 'FEE IN'; amt = '+' + fmtSOL(d.delta) + ' SOL'; cls = 'pos'; }
    else if (d.delta < 0) { kind = 'OUT'; amt = '−' + fmtSOL(-d.delta) + ' SOL'; cls = 'neg'; }
    else { kind = 'TX'; amt = '0 SOL'; }
  }
  return `<a class="rcpt live-row" href="https://solscan.io/tx/${esc(s.signature)}" target="_blank" rel="noopener">
    <div class="rcpt-top"><span>${esc(when)}</span><span class="rcpt-mode m-${kind === 'FEE IN' ? 'CHARGE' : kind === 'OUT' ? 'BURN' : 'TX'}">${kind}</span></div>
    <div class="rcpt-amt ${cls}">${amt}</div>
    <div class="rcpt-tx"><span>tx: ${esc(short(s.signature))}</span><span>${failed ? 'FAILED' : esc((s.confirmationStatus || 'confirmed').toUpperCase())} · Solscan ↗</span></div>
  </a>`;
}
function emptyHTML() {
  return `<div class="rcpt rcpt-empty">
    <div class="rcpt-top"><span>TREASURY · ${TR ? esc(short(TR)) : '—'}</span><span class="rcpt-mode m-ARMED">ARMED</span></div>
    <div class="empty-big">TREASURY ARMED · ${LIVE.cycles} CYCLES RUN</div>
    <div class="rcpt-why">Awaiting first fee. The first creator fee that lands in the treasury prints here — live from Solana mainnet, linked to Solscan.</div>
    <div class="rcpt-tx"><span>0 transactions on-chain</span><span>checked ${new Date().toLocaleTimeString('en-US', { hour12: false })}</span></div>
  </div>`;
}
function errorHTML(msg) {
  return `<div class="rcpt rcpt-empty rcpt-err">
    <div class="rcpt-top"><span>SOLANA MAINNET</span><span class="rcpt-mode m-WAIT">RECONNECTING</span></div>
    <div class="empty-big">RPC busy · retrying</div>
    <div class="rcpt-why">Public RPCs are rate-limited. The feed will reconnect on its own. You can always check the treasury directly on <a href="https://solscan.io/account/${esc(TR)}" target="_blank" rel="noopener">Solscan ↗</a>.</div>
    <div class="rcpt-tx"><span>${esc(msg).slice(0, 60)}</span><span>next try in ${CONFIG.POLL_SECONDS || 45}s</span></div>
  </div>`;
}
function setTag(state) {
  const tag = $('#log-tag'), st = $('#st-tag');
  const map = { connecting: ['CONNECTING…', 'tag'], live: ['LIVE · SOLANA MAINNET', 'tag ok'], stale: ['STALE · RETRYING', 'tag warn'], down: ['RPC UNREACHABLE · RETRYING', 'tag warn'] };
  const [t, c] = map[state];
  if (tag) { tag.textContent = t; tag.className = c; }
  if (st) { st.textContent = state === 'live' ? 'LIVE' : state === 'connecting' ? 'CONNECTING' : 'RETRYING'; st.className = c; }
  document.body.dataset.feed = state;
}
let polling = false, hadData = false;
async function pollTreasury() {
  if (!TR || polling) return; polling = true;
  const list = $('#log-list');
  try {
    const bal = await rpc('getBalance', [TR, { commitment: 'confirmed' }]);
    LIVE.sol = (bal && typeof bal.value === 'number' ? bal.value : 0) / 1e9; LIVE.ok = true;
    $('#st-treasury').textContent = fmtSOL(LIVE.sol) + ' SOL';
    $$('[data-tr-bal]').forEach((e) => (e.textContent = fmtSOL(LIVE.sol) + ' SOL'));
    const sigs = await rpc('getSignaturesForAddress', [TR, { limit: CONFIG.TX_LIMIT || 8, commitment: 'confirmed' }]) || [];
    $('#st-txs').textContent = sigs.length >= (CONFIG.TX_LIMIT || 8) ? sigs.length + '+' : String(sigs.length);
    if (!sigs.length) list.innerHTML = emptyHTML();
    else {
      // amounts: fetch details sequentially (gentle on public RPC rate limits)
      for (const s of sigs) { if (!txCache.has(s.signature)) { await txDetail(s.signature); await new Promise((r) => setTimeout(r, 120)); } }
      list.innerHTML = sigs.map((s) => rowHTML(s, txCache.get(s.signature))).join('');
    }
    hadData = true;
    $('#st-checked').textContent = new Date().toLocaleTimeString('en-US', { hour12: false });
    $('#st-rpc').textContent = LIVE.rpc;
    setTag('live');
  } catch (e) {
    LIVE.ok = false;
    console.warn('[treasury] all RPCs failed:', e.message);
    if (!hadData) { list.innerHTML = errorHTML(e.message); $('#st-treasury').textContent = '— SOL'; setTag('down'); }
    else setTag('stale');
  } finally { polling = false; }
}
function startLive() {
  const P = Math.min(60, Math.max(30, +CONFIG.POLL_SECONDS || 45));
  $('#st-mode').textContent = LIVE.cycles > 0 ? 'RUNNING' : 'ARMED';
  $('#st-burned').textContent = Math.round(LIVE.burned).toLocaleString('en-US');
  $('#st-cycles').textContent = LIVE.cycles.toLocaleString('en-US');
  if (!TR) { $('#log-list').innerHTML = '<div class="rcpt rcpt-empty"><div class="empty-big">TREASURY PUBLISHED AT LAUNCH</div></div>'; return; }
  setTag('connecting');
  $('#log-list').innerHTML = '<div class="rcpt rcpt-empty"><div class="rcpt-top"><span>SOLANA MAINNET</span><span class="rcpt-mode m-WAIT">READING</span></div><div class="empty-big">Reading treasury…</div></div>';
  pollTreasury(); pollMcap();
  let next = P;
  setInterval(() => {
    if (document.hidden) return; // don't hammer RPCs from background tabs
    next--;
    if (next <= 0) { next = P; pollTreasury(); pollMcap(); }
    $('#st-next').textContent = '00:' + String(next).padStart(2, '0');
  }, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && LIVE.ok === false) { pollTreasury(); } });
}

// ── mode panels: active class ──
let modeEls = [];
function updateModes() {
  const mid = innerHeight * 0.5;
  modeEls.forEach((el) => {
    const r = el.getBoundingClientRect();
    const on = r.top < mid + innerHeight * 0.22 && r.bottom > mid - innerHeight * 0.22;
    if (el._on !== on) { el._on = on; el.classList.toggle('on', on); }
  });
}

export function initUI({ reduced }) {
  wireConfig();
  buildFloors();
  modeEls = $$('.mode');
  startLive();
  const nav = $('.nav');
  return function frameUI() {
    nav.classList.toggle('scrolled', scrollY > 40);
    updateModes();
    const fr = $('#floors').getBoundingClientRect();
    if (fr.top < innerHeight && fr.bottom > 0) updateFloors();
  };
}
