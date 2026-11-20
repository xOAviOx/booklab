# Architecture and stack

The app runs as a static site. React owns the controls and rendering. A dedicated TypeScript module worker runs a single Rust/WebAssembly engine instance and handles file loading and optional capture. The engine can also be tested directly with native Cargo tests.

| Layer | Choice | Why it fits |
| --- | --- | --- |
| App and build | React, strict TypeScript, Vite, npm | One screen with component state, fast local iteration, and static build output. [Vite guide](https://vite.dev/guide/) |
| Interface | CSS custom properties and CSS grid, semantic HTML tables, Canvas plot | Control the data layout and keep controls accessible. A compact bid/ask trace needs only a small plot. |
| Engine | Rust, `wasm-bindgen`, `serde_json` with `raw_value`, `crc32fast` | Share one deterministic implementation between native tests and the browser. Keep feed decimals intact through decoding. [wasm-bindgen guide](https://wasm-bindgen.github.io/wasm-bindgen/) · [Serde RawValue](https://docs.rs/serde_json/latest/serde_json/value/struct.RawValue.html) |
| Worker | Dedicated module worker bundled by Vite | Move recording parsing, validation, seeking, and simulation off the UI thread. [Vite worker support](https://vite.dev/guide/features.html#web-workers) |
| Local storage | IndexedDB with the `idb` wrapper | Store and retrieve recording blobs asynchronously without a server. [IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) · [idb](https://github.com/jakearchibald/idb) |
| Verification | Cargo tests, TypeScript checks, Playwright | Test deterministic replay in Rust and prove the build, worker, UI, and storage work in a browser. |

## Boundaries

- **React** owns the playhead, selection, order input, and delay. It renders the two scenarios from one worker response so both books and summaries refer to the same inputs. Plot coordinates can use floats for rendering.
- **Worker** owns the loaded recording and responds to requests for load and comparison. Use typed messages with a request ID and recording ID. While dragging or playing, keep at most one comparison request in flight and retain the latest pending input. Drop stale replies after an input change or recording switch.
- **Rust** owns frame decoding, validation, book state, seek, and fill math. Two ordered maps hold exact prices and sizes. Binary search finds the target frame, then a verified in-memory checkpoint bounds how many changes must be applied. Chart samples are bounded. The engine returns exact decimal strings for level prices, quantities, and notional, and presentation strings for averages and their delta with the delta’s exact sign.
- **Persistence** stores each validated recording blob and its metadata in one IndexedDB transaction. Use the same bytes for export and import. Surface quota or save errors while keeping the recording exportable for the current session. The bundled demo loads directly from the static app assets.
- **Capture** owns one public WebSocket connection per recording. Time and validate frames in the worker, then save the bounded, verified recording. See [Replay model](REPLAY.md) for the file and failure behavior.

## Build and layout

The Vite app lives at the repository root, with browser code in `src/`, its worker in `src/worker/`, and the bundled recording in `public/recordings/`. The Rust crate at `crates/replay-core/` exposes the replay instance through a thin Wasm binding.

The build scripts in `package.json` generate web-target bindings with `wasm-pack` before Vite builds. Vite resolves the worker and Wasm assets with relative URLs. Serve `dist/` on a static HTTPS host that serves `.wasm` correctly. The lab uses static assets for replay and an outbound public WebSocket only during capture. [wasm-pack build](https://wasm-bindgen.github.io/wasm-pack/book/commands/build.html)
