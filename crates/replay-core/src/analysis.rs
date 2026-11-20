use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

use crate::{
    Replay,
    book::Book,
    decimal::{self, Units},
    fills::{Delta, Execution, Order, Side, delta, execute, market_levels},
};

const MAX_DELAY_US: u64 = 1_000_000;
const SIZE_SAMPLES: u128 = 96;

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
enum Sweep {
    Latency,
    Size,
}

#[derive(Deserialize)]
pub(crate) struct AnalysisRequest {
    kind: Sweep,
    order: Order,
}

#[derive(Serialize)]
pub(crate) struct FillPoint {
    pub filled: String,
    pub average: Option<String>,
}

impl From<Execution> for FillPoint {
    fn from(execution: Execution) -> Self {
        Self {
            filled: decimal::format(execution.filled.into(), 8),
            average: execution.average(),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LatencyPoint {
    pub delay_us: u64,
    pub fill: FillPoint,
    pub delta: Option<Delta>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LatencySweep {
    pub valid_through_us: u64,
    pub points: Vec<LatencyPoint>,
}

pub(crate) fn latency(replay: &Replay, order: &Order) -> Result<LatencySweep, String> {
    let qty = order.quantity()?;
    let start = order.playhead_us;
    let mut book = replay
        .book_at(start)
        .ok_or("Playhead is outside the recording")?;
    let mut remaining = &replay.frames[replay.index_at(start).unwrap() + 1..];
    let limit = (start + MAX_DELAY_US).min(replay.frames.last().unwrap().elapsed_us);
    let baseline = execute(&book, order.side, qty);
    let mut previous = baseline;
    let mut points = vec![LatencyPoint {
        delay_us: 0,
        fill: baseline.into(),
        delta: delta(baseline, baseline),
    }];

    while let Some(frame) = remaining.first().filter(|frame| frame.elapsed_us <= limit) {
        let time = frame.elapsed_us;
        let group = remaining.partition_point(|frame| frame.elapsed_us == time);
        for frame in &remaining[..group] {
            book.apply(&frame.changes, replay.depth);
        }
        remaining = &remaining[group..];
        let fill = execute(&book, order.side, qty);
        if fill != previous {
            points.push(LatencyPoint {
                delay_us: time - start,
                fill: fill.into(),
                delta: delta(baseline, fill),
            });
            previous = fill;
        }
    }
    Ok(LatencySweep {
        valid_through_us: limit - start,
        points,
    })
}

#[derive(Serialize)]
pub(crate) struct SizePoint {
    pub qty: String,
    pub baseline: FillPoint,
    pub delayed: Option<FillPoint>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SizeSweep {
    pub baseline_depth: String,
    pub delayed_depth: Option<String>,
    pub points: Vec<SizePoint>,
}

fn depth_thresholds(book: &Book, side: Side, samples: &mut BTreeSet<Units>) -> u128 {
    let mut depth = 0;
    for level in market_levels(book, side) {
        depth += u128::from(level.qty);
        samples.insert(depth.min(u128::from(Units::MAX)) as Units);
    }
    depth
}

pub(crate) fn size(replay: &Replay, order: &Order) -> Result<SizeSweep, String> {
    let selected = order.quantity()?;
    let baseline = replay
        .book_at(order.playhead_us)
        .ok_or("Playhead is outside the recording")?;
    let delayed = replay.book_at(order.delayed_time()?);
    let mut sizes = BTreeSet::from([1, selected]);
    let baseline_depth = depth_thresholds(&baseline, order.side, &mut sizes);
    let delayed_depth = delayed
        .as_ref()
        .map(|book| depth_thresholds(book, order.side, &mut sizes));
    let max_depth = baseline_depth.max(delayed_depth.unwrap_or_default());
    let end = (max_depth + max_depth.div_ceil(4))
        .min(u128::from(Units::MAX))
        .max(selected.into());
    for i in 1..=SIZE_SAMPLES {
        sizes.insert((i * end / SIZE_SAMPLES).max(1) as Units);
    }
    let points = sizes
        .into_iter()
        .map(|qty| SizePoint {
            qty: decimal::format(qty.into(), 8),
            baseline: execute(&baseline, order.side, qty).into(),
            delayed: delayed
                .as_ref()
                .map(|book| execute(book, order.side, qty).into()),
        })
        .collect();
    Ok(SizeSweep {
        baseline_depth: decimal::format(baseline_depth, 8),
        delayed_depth: delayed_depth.map(|depth| decimal::format(depth, 8)),
        points,
    })
}

pub(crate) fn analyze(replay: &Replay, request: AnalysisRequest) -> Result<String, String> {
    match request.kind {
        Sweep::Latency => serde_json::to_string(&latency(replay, &request.order)?),
        Sweep::Size => serde_json::to_string(&size(replay, &request.order)?),
    }
    .map_err(|error| error.to_string())
}
