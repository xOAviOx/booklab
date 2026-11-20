# Progress

**2026-11-21 · Local MVP and analysis tools implemented and verified.**

The production build opens on a synthetic 12-second BTC/USD session at a paused 4.000 s. The timeline, buy/sell controls, exact delay input, and side-by-side fills use the same Rust engine as imported and captured recordings. The local library stores verified recordings in IndexedDB. The Kraken recorder stops at 60 seconds, 10 MiB, or an integrity or connection failure.

The analysis toolbar adds latency and order size sweeps plus the displayed depth change overlay. The timeline can step by recorded update. The bundled demo shares the current order settings and playhead via a versioned URL fragment.

## Verification

- `cargo test --locked` passed eight native tests, including the published Kraken snapshot CRC, the synthetic `+$4.00` comparison, checkpoint seeking, grouped update times, both liquidity limits, and recorded depth changes.
- `cargo clippy --locked --all-targets -- -D warnings` and `npm run build` passed. Static output loaded from both `/` and `/lab/` in Chromium, including the worker, Wasm, and recording assets.
- Playwright checked the initial comparison at desktop and 390 px phone widths, plus zero delay, invalid quantity, partial fills, keyboard seeks, offline scrubbing, and playback. A rejected import left the current recording open. Exported bytes matched the imported file and the file reopened from IndexedDB after reload.
- A short real Kraken capture yielded 1,182 verified frames and reopened after reload with the same comparison. A test socket with a corrupted checksum exported only the two good frames. Blocking IndexedDB left the loaded recording playable and exportable.
- Playwright verified clicking the sweeps and navigating with the keyboard, exact update and fill-change jumps, offline size sweeps, overlay values, and a clipboard link that restores a fractional millisecond delay. The replay, export, and live capture smoke flow passed again with the analysis build.
- In local Chromium, a 59.994-second Kraken recording measured 31.9 ms median and 32.3 ms maximum across 12 scripted seek bursts, measured through the animation frame after the updated book time appeared.
- The GitHub source history was prepared as 15 commits on `main` using Avi Shukla's configured Git identity. Before pushing, all commit messages and author fields were checked for Codex co-author attribution; `cargo test --locked`, Clippy with warnings denied, and the production build passed again.

**Next session.** Choose a static host and verify its production URL against [milestone 4](ROADMAP.md#4-release-the-static-demo).

When updating this file, record the latest verified milestone, verification commands or browser flow, and any changed assumption. Keep future deliverables in [Roadmap](ROADMAP.md).
