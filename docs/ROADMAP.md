# Weekend roadmap

Ship the bundled experiment first, then use the same pipeline for saved recordings and live capture. Each milestone ends with behavior that can be checked on its own.

## 1. Prove the replay engine and build path

- [x] Scaffold Vite/React/TypeScript and the Rust crate. Add an npm script for Wasm generation and prove a worker can initialize it in the production preview.
- [x] Implement exact decimal decoding, reconstruction, checksum verification, time queries, and market fills in Rust. Validate the [golden examples](REPLAY.md#golden-examples).
- [x] Cover snapshot and update checksums, duplicate levels, deletion, depth truncation, equal timestamps, inclusive seek boundaries, precision, and integrity failures. Cover Buy and Sell traversal, zero delay, partial and zero fill, and history remaining immutable.
- [x] Run the verified synthetic fixture through the worker. Confirm the browser receives the Rust result for the 250 ms comparison.

## 2. Make the synthetic replay usable

- [x] Build the [experiment flow](PRODUCT.md#the-experiment) with a paused example, play/pause, scrubbing, an editable size and delay, two order books, and accessible fill highlights.
- [x] Verify the same experiment at desktop and phone widths. Confirm the 250 ms answer, zero-delay result, backward seek, invalid quantity, and unavailable delayed result. Check keyboard controls. After loading the bundled demo and its assets, put the browser offline and verify that scrubbing and editing an order still recalculate the comparison.

## 3. Record and reopen local sessions

- [x] Implement NDJSON import and export, save and reopen in IndexedDB, and show errors without clearing the loaded book.
- [x] Add the public Kraken capture flow with snapshot wait, recording limits, stop, and local save. Verify that a short real session can be captured, reopened after reload, and exported with the same simulated result.
- [x] Inject a checksum failure and a storage failure. Verify that capture stops on the corrupted frame and offers the verified prefix, and an unsaved recording remains exportable.

## 4. Release the static demo

- [ ] Verify Wasm, worker, and recording assets on the selected public static host, and confirm the start state has a complete comparison.
- [x] Measure input-to-result latency on a representative 60-second recording. Record the observed timing in [Progress](PROGRESS.md).
- [x] Document install, development, test, and build commands in [README](../README.md).

## Replay analysis

- [x] Add linked latency and size sweeps, including exact fill changes and displayed depth limits.
- [x] Add the book-change overlay and previous and next recorded update controls.
- [x] Add versioned demo share links with exact order settings.

## After the weekend

- Consider a Kraken exchange-timestamp mode once its ordering, clock assumptions, and data quality can be shown clearly.
- Consider a deeper recording subscription after measuring storage and seek costs on longer captures.
