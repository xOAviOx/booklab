# Order Book Replay Lab

Pause a BTC/USD order book, enter a hypothetical market order, and compare its estimated fill at the playhead with the same order 250 ms later. The lab shows which displayed price levels each order would consume, how much would fill, and how the volume-weighted average price changes.

The app opens on a bundled synthetic recording with a `+$4.00` average price change for a 0.75 BTC buy delayed by 250 ms. Use the recording picker to import, export, or reopen local NDJSON files. **Record Kraken feed** captures up to 60 seconds or 10 MiB of public Level 2 data and saves it in this browser.

In the analysis toolbar, use **Latency sweep** to find the delay at which a fill changes, **Book changes** to see the displayed BTC added or removed by price, and **Size sweep** to find each book’s displayed liquidity limit. The timeline buttons step to the previous or next recorded update. **Copy experiment link** restores the bundled demo’s playhead, side, quantity, and delay on the same site.

Results are estimates against displayed liquidity. The replay holds historical updates fixed, so it cannot show how market participants would have responded to the hypothetical order. Kraken captures use the time updates were observed by the browser. [HftBacktest order-fill model](https://hft.readthedocs.io/en/latest/order_fill.html)

The browser app uses React, TypeScript, and Vite. A dedicated Web Worker hosts the Rust/WebAssembly engine. IndexedDB stores recordings locally. The production build is a static `dist/` directory.

## Run locally

Use Node `20.19+` or `22.12+` and stable Rust with `rustup`. The project installs `wasm-pack` through npm. The initial Wasm build downloads its build tools.

```sh
rustup target add wasm32-unknown-unknown
npm ci
npm run dev
```

```sh
npm run test:core  # Native reconstruction, checksum, seek, and fill tests
npm run build      # Wasm build, TypeScript checks, and static output
npm run preview    # Serve the production build locally
```

`node scripts/generate-demo.mjs` regenerates the bundled synthetic recording with deterministic inputs.

## Project documents

| Document | What it answers |
| --- | --- |
| [AGENTS.md](AGENTS.md) | What an agent reads before making changes |
| [Product](docs/PRODUCT.md) | What visitors can do and how the interface should feel |
| [Architecture](docs/ARCHITECTURE.md) | What runs where and why the stack fits |
| [Replay model](docs/REPLAY.md) | How recordings, reconstruction, timing, and fills work |
| [Roadmap](docs/ROADMAP.md) | What to build first and how to verify each milestone |
| [Progress](docs/PROGRESS.md) | What exists today and where to pick up |
