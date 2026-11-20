mod analysis;
mod book;
mod decimal;
mod fills;

use book::{Book, Changes, Kind};
use serde::{Deserialize, Serialize};

use crate::fills::{Comparison, Order, simulate};

const MAX_BYTES: usize = 10 * 1024 * 1024;
const MAX_SAFE_INTEGER: u64 = (1 << 53) - 1;
const CHECKPOINT_INTERVAL: usize = 128;
const CHART_SAMPLES: usize = 640;

#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
enum Source {
    Kraken,
    Synthetic,
}

#[derive(Deserialize)]
struct Header {
    version: u8,
    source: Source,
    symbol: String,
    depth: usize,
}

#[derive(Deserialize)]
struct Record {
    elapsed_us: u64,
    frame: String,
}

struct Frame {
    elapsed_us: u64,
    changes: Changes,
    best_bid: Option<u64>,
    best_ask: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ChartPoint {
    elapsed_us: u64,
    bid: Option<String>,
    ask: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Metadata {
    source: Source,
    depth: usize,
    frame_count: usize,
    end_us: u64,
    chart: Vec<ChartPoint>,
    update_times: Vec<u64>,
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen::prelude::wasm_bindgen)]
pub struct Replay {
    source: Source,
    depth: usize,
    latest: Book,
    frames: Vec<Frame>,
    checkpoints: Vec<Book>,
}

impl Replay {
    fn new(source: Source, depth: usize) -> Self {
        Self {
            source,
            depth,
            latest: Book::default(),
            frames: Vec::new(),
            checkpoints: Vec::new(),
        }
    }

    fn from_ndjson(input: &str) -> Result<Self, String> {
        if input.len() > MAX_BYTES {
            return Err("Recording exceeds 10 MiB".into());
        }
        let mut lines = input.lines();
        let header_line = lines.next().ok_or("Recording is empty")?;
        let header: Header = serde_json::from_str(header_line)
            .map_err(|error| format!("Invalid recording header: {error}"))?;
        if header.version != 1 || header.symbol != "BTC/USD" || header.depth != 25 {
            return Err("Expected a version 1 BTC/USD recording with depth 25".into());
        }
        let mut replay = Self::new(header.source, header.depth);
        for (index, line) in lines.enumerate() {
            let result = serde_json::from_str::<Record>(line)
                .map_err(|error| error.to_string())
                .and_then(|record| replay.push_frame(record.elapsed_us, &record.frame));
            result.map_err(|error| format!("Line {}: {error}", index + 2))?;
        }
        if replay.frames.is_empty() {
            return Err("Recording has no initial snapshot".into());
        }
        Ok(replay)
    }

    fn push_frame(&mut self, elapsed_us: u64, raw: &str) -> Result<(), String> {
        if elapsed_us > MAX_SAFE_INTEGER {
            return Err("Frame time exceeds the safe integer range".into());
        }
        let changes = Changes::parse(raw)?;
        match self.frames.last() {
            None if changes.kind != Kind::Snapshot || elapsed_us != 0 => {
                return Err("The first frame must be a snapshot at time zero".into());
            }
            Some(last) if changes.kind != Kind::Update || elapsed_us < last.elapsed_us => {
                return Err("Expected an update in chronological recording order".into());
            }
            _ => {}
        }

        let mut candidate = self.latest.clone();
        candidate.apply(&changes, self.depth);
        candidate.check(changes.checksum)?;
        if self.frames.len().is_multiple_of(CHECKPOINT_INTERVAL) {
            self.checkpoints.push(candidate.clone());
        }
        self.frames.push(Frame {
            elapsed_us,
            changes,
            best_bid: candidate.best_bid(),
            best_ask: candidate.best_ask(),
        });
        self.latest = candidate;
        Ok(())
    }

    fn index_at(&self, elapsed_us: u64) -> Option<usize> {
        let last = self.frames.last()?;
        if elapsed_us > last.elapsed_us {
            return None;
        }
        Some(
            self.frames
                .partition_point(|frame| frame.elapsed_us <= elapsed_us)
                - 1,
        )
    }

    fn book_at(&self, elapsed_us: u64) -> Option<Book> {
        let index = self.index_at(elapsed_us)?;
        let checkpoint = index / CHECKPOINT_INTERVAL;
        let mut book = self.checkpoints[checkpoint].clone();
        let next = checkpoint * CHECKPOINT_INTERVAL + 1;
        for frame in &self.frames[next..index + 1] {
            book.apply(&frame.changes, self.depth);
        }
        Some(book)
    }

    fn describe(&self) -> Metadata {
        let to_point = |frame: &Frame| ChartPoint {
            elapsed_us: frame.elapsed_us,
            bid: frame.best_bid.map(|price| decimal::format(price.into(), 8)),
            ask: frame.best_ask.map(|price| decimal::format(price.into(), 8)),
        };
        let stride = self.frames.len().div_ceil(CHART_SAMPLES).max(1);
        let mut chart: Vec<_> = self.frames.iter().step_by(stride).map(to_point).collect();
        let end_us = self.frames.last().map_or(0, |frame| frame.elapsed_us);
        if let Some(last) = self.frames.last()
            && !(self.frames.len() - 1).is_multiple_of(stride)
        {
            chart.push(to_point(last));
        }
        let mut update_times: Vec<_> = self.frames.iter().map(|frame| frame.elapsed_us).collect();
        update_times.dedup();
        Metadata {
            source: self.source,
            depth: self.depth,
            frame_count: self.frames.len(),
            end_us,
            chart,
            update_times,
        }
    }

    fn query(&self, order: Order) -> Result<Comparison, String> {
        Ok(simulate(
            self,
            order.playhead_us,
            order.delayed_time()?,
            order.side,
            order.quantity()?,
        ))
    }
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen::prelude::wasm_bindgen)]
impl Replay {
    pub fn load(input: &str) -> Result<Replay, String> {
        Self::from_ndjson(input)
    }

    pub fn start_capture() -> Replay {
        Self::new(Source::Kraken, 25)
    }

    pub fn append_frame(&mut self, elapsed_us: u64, raw: &str) -> Result<(), String> {
        self.push_frame(elapsed_us, raw)
    }

    pub fn metadata(&self) -> Result<String, String> {
        serde_json::to_string(&self.describe()).map_err(|error| error.to_string())
    }

    pub fn compare(&self, input: &str) -> Result<String, String> {
        let order =
            serde_json::from_str(input).map_err(|error| format!("Invalid order: {error}"))?;
        serde_json::to_string(&self.query(order)?).map_err(|error| error.to_string())
    }

    pub fn analyze(&self, input: &str) -> Result<String, String> {
        let request: analysis::AnalysisRequest = serde_json::from_str(input)
            .map_err(|error| format!("Invalid sweep request: {error}"))?;
        analysis::analyze(self, request)
    }
}

#[cfg(test)]
mod tests;
