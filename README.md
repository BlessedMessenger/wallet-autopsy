# chain wrapped

> An honest, chain-agnostic, lifetime wrap of any crypto wallet. Runs entirely in your browser. No accounts. No tracking. No backend.

Paste any Bitcoin, Ethereum, Solana, Dogecoin, Litecoin, Bitcoin Cash, or EVM-L2 wallet address. In a few seconds you get a clean, well-written recap of what that wallet has done: how many transactions, how much burned in fees, how many tokens touched, how dormant, how old, how alive. With a profile. The scope is the wallet's full on-chain lifetime — not the last 12 months, not this calendar year. (Busy wallets are fetched up to provider limits; see [How it works](#how-it-works) for the exact caps.)

**Nothing reaches us — we have no backend.** Your address is sent directly from your browser to public block explorers (the same ones you'd use manually); we never see it. A small `localStorage` cache keeps repeated lookups cheap.

---

## Try it

**[blessedmessenger.github.io/chain-wrapped](https://blessedmessenger.github.io/chain-wrapped/)**

No install. Open the page, paste an address, press run.

---

## Why

Block explorers are great at raw data and bad at perspective. Portfolio trackers are good at balances and bad at honesty. This tool answers the question those two can't: *what is this wallet, really?*

It is deliberately not a trading tool, not a tax tool, and not a scam detector. It is a mirror.

---

## Features

- **12 chains** supported:
  - **UTXO (4)** — Bitcoin, Bitcoin Cash, Litecoin, Dogecoin
  - **EVM (7)** — Ethereum, Arbitrum, Optimism, Base, Polygon, BNB Chain, Avalanche C-Chain
  - **Solana (1)**
- **One page, no accounts, no backend.** Pure static site, hosted on GitHub Pages.
- **Client-side only.** All explorer calls are made directly from your browser to public APIs; we have no server that ever sees your address.
- **Deterministic analysis.** The same snapshot of on-chain facts always produces the same wrap, down to the punctuation — you can re-run and diff.
- **Selectable, copy-pasteable.** The wrap is plain text. Screenshot it, copy it, quote it.
- **Downloadable share card.** One click, 1200×630 PNG.
- **Keyboard-first.** `Enter` runs. `Tab` navigates. No modal traps.
- **Accessible.** Honest contrast, honored `prefers-reduced-motion`, semantic HTML.

---

## How it works

```
┌─────────────┐       ┌───────────────┐       ┌───────────────┐
│ address     │──────▶│ detect chain  │──────▶│ chain adapter │
└─────────────┘       └───────────────┘       └───────┬───────┘
                                                      │
                                                      ▼
                                              ┌───────────────┐
                                              │ fact sheet    │
                                              └───────┬───────┘
                                                      │
                                                      ▼
                                              ┌───────────────┐
                                              │ copy engine   │──────▶ wrap
                                              └───────────────┘
```

Four chain adapters cover all 12 networks:

| Adapter | Data source | Key required | Lifetime coverage |
|---|---|---|---|
| `btc-mempool` (BTC) | mempool.space (fallback: Blockchair) | no | total tx count / balance are exact; **fees are sampled from the latest ~100 txs** and extrapolated |
| `utxo` (BCH, LTC, DOGE) | Blockchair public API | no | same — total count / balance exact, fees sampled |
| `evm` (7 networks) | Etherscan V2 multichain | yes — your own free key | up to **10,000 tx per wallet** per call (free-tier limit) |
| `solana` | Public Solana RPC | no | latest **1,000 signatures** (public RPC limit); fees sampled from 100 |

For most wallets this is the full lifetime. For bot-scale wallets (10k+ on a single EVM chain, or 1k+ SOL signatures) the most recent chunk is used and fees shown as `~X BTC` or similar to flag the estimate.

The EVM adapter needs an Etherscan V2 API key because the free public RPCs don't expose historical `txlist`-style queries. The key is **yours, stays in your browser**, and a free one takes 30 seconds to get at [etherscan.io/myapikey](https://etherscan.io/myapikey). It's sent directly to `api.etherscan.io` as a URL query parameter (Etherscan's design, not ours) — treat it as a free rate-limited read token, nothing sensitive.

Prices come from [DefiLlama's Coins API](https://coins.llama.fi) — free, keyless, CORS-open.

---

## Privacy

- There is no server.
- There is no analytics.
- There is no telemetry.
- Your Etherscan API key, once pasted, is stored in your browser's `localStorage`. Nowhere else.
- Address lookups are cached locally for 15 minutes to avoid hammering free APIs when you refresh.

What the page does hit:

- `mempool.space` / `api.blockchair.com` — when you wrap a UTXO chain wallet
- `api.etherscan.io/v2` — when you wrap an EVM wallet (with your key)
- `api.mainnet-beta.solana.com` or `solana.drpc.org` — for Solana
- `coins.llama.fi` — for USD prices

All of those calls are made directly from your browser to the API, with no intermediary.

---

## Run it locally

You do not need to. This is a live page. But if you want to hack on it:

```bash
git clone https://github.com/BlessedMessenger/chain-wrapped.git
cd chain-wrapped
npm install
npm run dev      # Vite dev server on http://localhost:5173
```

Scripts:

```bash
npm run dev        # dev server
npm run build      # typecheck + production build to ./dist
npm run preview    # serve the production build
npm run typecheck  # tsc --noEmit
npm test           # vitest run
npm run test:watch # vitest watch mode
```

---

## License

[MIT](./LICENSE). Fork it. Ship your version. Keep it free.

---

## Tip

If this tool made you laugh, cry, or remember something you'd rather forget, you can tip:

```
btc  bc1qu70pezhg85wulg0pqhgjufaaymqv2pcs5tv7g3
```

A star on GitHub is also appreciated.
