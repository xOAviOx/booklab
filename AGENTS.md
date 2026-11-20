# Agent guide

Order Book Replay Lab is a browser experiment for comparing the estimated fill of one BTC/USD market order at two times in a recording.

## Before editing

1. Read [Progress](docs/PROGRESS.md) to see what exists and how it was last verified.
2. Read [Roadmap](docs/ROADMAP.md) when starting a milestone or changing release scope.
3. Read the contracts that cover the change.
   - **Replay** — read [Replay model](docs/REPLAY.md) before changing the recorder, format, checksum, clock, book, or fill calculation.
   - **Integration** — read [Architecture](docs/ARCHITECTURE.md) before changing toolchains, worker messages, storage, or build and hosting.
   - **Interface** — read [Product](docs/PRODUCT.md) before changing the experiment flow, tables, chart, controls, or result copy.

## While working

- Keep Rust authoritative for book reconstruction and fill math. Carry exact market values through worker and storage boundaries.
- Keep the historical book immutable during hypothetical fills. Evaluate both scenarios independently from verified replay state.
- Keep the synthetic comparison playable with the network disconnected after the static assets have loaded.
- Verify changed behavior at its boundary. Use deterministic Rust fixtures for engine behavior and a browser check for worker, storage, or interface changes.
- At the end of a work session, update [Progress](docs/PROGRESS.md) with the outcome, verification performed, and the next actionable step. Update the relevant contract when behavior changes.
