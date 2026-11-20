# Book Lab

Book Lab is an interactive BTC/USD order book replay. Pick a moment, enter a hypothetical market order, and see how its estimated fill changes when the order arrives later. The two books show the price levels consumed, the quantity filled, and the volume-weighted average price.

## Try the demo

The bundled synthetic session opens on a **0.75 BTC market buy**. A **250 ms** delay raises the estimated average fill from **$100,001.33** to **$100,005.33**, a difference of **$4.00 per BTC**. Set the delay to zero, open **Latency sweep**, then select **Next fill change** to find that breakpoint.

## What you can do

- Scrub the timeline or step forward and backward one recorded update at a time.
- Sweep arrival delays from 0 to 1,000 ms, or vary order size to see where each book runs out of displayed liquidity.
- Turn on **Book changes** to see displayed BTC added, removed, or resized at each price.
- Record up to 60 seconds or 10 MiB from Kraken’s public Level 2 feed. Save sessions in the browser and import or export them as NDJSON. Share synthetic experiments with a link that restores the order and playhead.

## Run locally

Use Node.js 22.12 or later and stable Rust installed through `rustup`.

```sh
rustup target add wasm32-unknown-unknown
npm ci
npm run dev
```

## Test and deploy

```sh
npm run test:core
npm run build
npm run preview
```

Publish the contents of `dist/` to a static host. The build includes the WebAssembly engine, worker, and synthetic recording.

## How replay works

React and TypeScript drive the interface. A Rust engine compiled to WebAssembly runs in a dedicated worker. It preserves decimal precision, checks each frame’s CRC32 over the top 10 price levels per side, and computes fills from the reconstructed book. Recordings are stored locally in IndexedDB. [Kraken’s order book checksum guide](https://docs.kraken.com/exchange/guides/websockets/book-checksum-v2)

Live captures use the browser’s receive clock. Fill estimates use displayed liquidity and hold recorded updates fixed. Fees, hidden liquidity, and other traders’ reactions are outside the model.
