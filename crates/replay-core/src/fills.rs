use std::cmp::Ordering;

use num_bigint::BigUint;
use serde::{Deserialize, Serialize};

use crate::{
    Replay,
    book::{Book, Level},
    decimal::{self, UNITS_PER_CENT, Units},
};

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Side {
    Buy,
    Sell,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Order {
    pub playhead_us: u64,
    pub delay_us: u64,
    pub side: Side,
    pub qty: String,
}

impl Order {
    pub fn quantity(&self) -> Result<Units, String> {
        let qty = decimal::parse(&self.qty).map_err(|error| format!("Order size: {error}"))?;
        if qty == 0 {
            return Err("Order size must be greater than zero".into());
        }
        Ok(qty)
    }

    pub fn delayed_time(&self) -> Result<u64, String> {
        self.playhead_us
            .checked_add(self.delay_us)
            .ok_or_else(|| "Delay is out of range".into())
    }
}

#[derive(Serialize)]
pub(crate) struct Row {
    pub price: String,
    pub qty: String,
    pub taken: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Scenario {
    pub at_us: u64,
    pub asks: Vec<Row>,
    pub bids: Vec<Row>,
    pub spread: Option<String>,
    pub filled: String,
    pub unfilled: String,
    pub notional: String,
    pub average: Option<String>,
    #[serde(skip)]
    execution: Execution,
}

#[derive(Serialize, PartialEq, Debug)]
pub(crate) struct Delta {
    pub magnitude: String,
    pub sign: i8,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Comparison {
    pub baseline: Option<Scenario>,
    pub delayed: Option<Scenario>,
    pub delayed_us: u64,
    pub delta: Option<Delta>,
    pub changes: Option<BookChanges>,
}

#[derive(Serialize)]
pub(crate) struct BookChanges {
    pub asks: Vec<DepthChange>,
    pub bids: Vec<DepthChange>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DepthChange {
    pub price: String,
    pub before: String,
    pub after: String,
    pub qty_delta: String,
}

#[derive(Clone, Copy, Default, PartialEq, Eq)]
pub(crate) struct Execution {
    pub filled: Units,
    notional: u128,
}

impl Execution {
    fn take(&mut self, level: &Level, qty: Units) -> Units {
        let taken = level.qty.min(qty - self.filled);
        self.filled += taken;
        // Filled quantity is at most one u64 order, and each price is a u64.
        self.notional += u128::from(level.price) * u128::from(taken);
        taken
    }

    pub fn average(self) -> Option<String> {
        (self.filled > 0).then(|| {
            let divisor = u128::from(self.filled) * u128::from(UNITS_PER_CENT);
            let cents = self.notional / divisor
                + u128::from(self.notional % divisor >= divisor.div_ceil(2));
            decimal::format_cents(&cents.to_string())
        })
    }
}

pub(crate) fn market_levels(book: &Book, side: Side) -> impl Iterator<Item = &Level> {
    let (asks, bids) = match side {
        Side::Buy => (Some(book.asks.values()), None),
        Side::Sell => (None, Some(book.bids.values().rev())),
    };
    asks.into_iter().flatten().chain(bids.into_iter().flatten())
}

pub(crate) fn execute(book: &Book, side: Side, qty: Units) -> Execution {
    let mut execution = Execution::default();
    for level in market_levels(book, side) {
        execution.take(level, qty);
        if execution.filled == qty {
            break;
        }
    }
    execution
}

fn side_rows<'a>(
    levels: impl Iterator<Item = &'a Level>,
    qty: Units,
    execution: &mut Execution,
) -> Vec<Row> {
    levels
        .map(|level| Row {
            price: decimal::format(level.price.into(), 8),
            qty: decimal::format(level.qty.into(), 8),
            taken: decimal::format(execution.take(level, qty).into(), 8),
        })
        .collect()
}

fn estimate(book: &Book, at_us: u64, side: Side, qty: Units) -> Scenario {
    let mut ask_fill = Execution::default();
    let mut bid_fill = Execution::default();
    let (ask_qty, bid_qty) = match side {
        Side::Buy => (qty, 0),
        Side::Sell => (0, qty),
    };
    let asks = side_rows(book.asks.values(), ask_qty, &mut ask_fill);
    let bids = side_rows(book.bids.values().rev(), bid_qty, &mut bid_fill);
    let execution = match side {
        Side::Buy => ask_fill,
        Side::Sell => bid_fill,
    };
    let spread = book
        .best_ask()
        .zip(book.best_bid())
        .map(|(ask, bid)| decimal::format((ask - bid).into(), 8));
    Scenario {
        at_us,
        asks,
        bids,
        spread,
        filled: decimal::format(execution.filled.into(), 8),
        unfilled: decimal::format((qty - execution.filled).into(), 8),
        notional: decimal::format(execution.notional, 16),
        average: execution.average(),
        execution,
    }
}

pub(crate) fn delta(baseline: Execution, delayed: Execution) -> Option<Delta> {
    if baseline.filled == 0 || delayed.filled == 0 {
        return None;
    }
    // Cross-products can exceed u128 even when both exact notionals fit.
    let later = BigUint::from(delayed.notional) * baseline.filled;
    let earlier = BigUint::from(baseline.notional) * delayed.filled;
    let (difference, sign) = match later.cmp(&earlier) {
        Ordering::Greater => (later - earlier, 1),
        Ordering::Less => (earlier - later, -1),
        Ordering::Equal => {
            return Some(Delta {
                magnitude: "0.00".into(),
                sign: 0,
            });
        }
    };
    let divisor = BigUint::from(baseline.filled) * delayed.filled * UNITS_PER_CENT;
    let cents = (difference + (&divisor >> 1_usize)) / divisor;
    Some(Delta {
        magnitude: decimal::format_cents(&cents.to_string()),
        sign,
    })
}

fn depth_changes(
    before: &std::collections::BTreeMap<Units, Level>,
    after: &std::collections::BTreeMap<Units, Level>,
) -> Vec<DepthChange> {
    let mut prices: Vec<_> = before.keys().chain(after.keys()).copied().collect();
    prices.sort_unstable();
    prices.dedup();
    prices
        .into_iter()
        .filter_map(|price| {
            let first = before.get(&price).map_or(0, |level| level.qty);
            let last = after.get(&price).map_or(0, |level| level.qty);
            (first != last).then(|| DepthChange {
                price: decimal::format(price.into(), 8),
                before: decimal::format(first.into(), 8),
                after: decimal::format(last.into(), 8),
                qty_delta: format!(
                    "{}{}",
                    if last > first { "+" } else { "-" },
                    decimal::format(first.abs_diff(last).into(), 8)
                ),
            })
        })
        .collect()
}

pub(crate) fn simulate(
    replay: &Replay,
    at_us: u64,
    delayed_us: u64,
    side: Side,
    qty: Units,
) -> Comparison {
    let before = replay.book_at(at_us);
    let after = replay.book_at(delayed_us);
    let changes = before
        .as_ref()
        .zip(after.as_ref())
        .map(|(first, last)| BookChanges {
            asks: depth_changes(&first.asks, &last.asks),
            bids: depth_changes(&first.bids, &last.bids),
        });
    let baseline = before.as_ref().map(|book| estimate(book, at_us, side, qty));
    let delayed = after
        .as_ref()
        .map(|book| estimate(book, delayed_us, side, qty));
    let delta = baseline
        .as_ref()
        .zip(delayed.as_ref())
        .and_then(|(a, b)| delta(a.execution, b.execution));
    Comparison {
        baseline,
        delayed,
        delayed_us,
        delta,
        changes,
    }
}
