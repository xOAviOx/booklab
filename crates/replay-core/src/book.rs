use std::{borrow::Cow, collections::BTreeMap};

use serde::Deserialize;
use serde_json::value::RawValue;

use crate::decimal::{self, Units};

#[derive(Clone)]
pub(crate) struct Level {
    pub price: Units,
    pub qty: Units,
    digits: String,
}

#[derive(Clone, Copy, PartialEq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Kind {
    Snapshot,
    Update,
}

#[derive(Deserialize)]
struct WireLevel<'a> {
    #[serde(borrow)]
    price: &'a RawValue,
    #[serde(borrow)]
    qty: &'a RawValue,
}

#[derive(Deserialize)]
struct WireBook<'a> {
    symbol: &'a str,
    checksum: u32,
    #[serde(borrow)]
    asks: Vec<WireLevel<'a>>,
    #[serde(borrow)]
    bids: Vec<WireLevel<'a>>,
}

#[derive(Deserialize)]
struct WireFrame<'a> {
    channel: &'a str,
    #[serde(rename = "type")]
    kind: Kind,
    #[serde(borrow)]
    data: [WireBook<'a>; 1],
}

pub(crate) struct Changes {
    pub kind: Kind,
    pub checksum: u32,
    asks: Vec<Level>,
    bids: Vec<Level>,
}

fn decimal_token(raw: &RawValue) -> Result<Cow<'_, str>, String> {
    let token = raw.get();
    if token.starts_with('"') {
        serde_json::from_str::<String>(token)
            .map(Cow::Owned)
            .map_err(|error| error.to_string())
    } else {
        Ok(Cow::Borrowed(token))
    }
}

fn level(raw: WireLevel<'_>) -> Result<Level, String> {
    let price_token = decimal_token(raw.price)?;
    let qty_token = decimal_token(raw.qty)?;
    let price = decimal::parse(&price_token).map_err(|error| format!("Invalid price: {error}"))?;
    let qty = decimal::parse(&qty_token).map_err(|error| format!("Invalid quantity: {error}"))?;
    if price == 0 {
        return Err("Book prices must be positive".into());
    }
    let digits = |token: &str| token.replace('.', "").trim_start_matches('0').to_owned();
    Ok(Level {
        price,
        qty,
        digits: digits(&price_token) + &digits(&qty_token),
    })
}

impl Changes {
    pub fn parse(raw: &str) -> Result<Self, String> {
        let frame: WireFrame = serde_json::from_str(raw).map_err(|error| error.to_string())?;
        let [book] = frame.data;
        if frame.channel != "book" || book.symbol != "BTC/USD" {
            return Err("Expected a BTC/USD book frame".into());
        }
        Ok(Self {
            kind: frame.kind,
            checksum: book.checksum,
            asks: book.asks.into_iter().map(level).collect::<Result<_, _>>()?,
            bids: book.bids.into_iter().map(level).collect::<Result<_, _>>()?,
        })
    }
}

#[derive(Clone, Default)]
pub(crate) struct Book {
    pub asks: BTreeMap<Units, Level>,
    pub bids: BTreeMap<Units, Level>,
}

fn apply_side(book: &mut BTreeMap<Units, Level>, changes: &[Level]) {
    for level in changes {
        if level.qty == 0 {
            book.remove(&level.price);
        } else {
            book.insert(level.price, level.clone());
        }
    }
}

impl Book {
    pub fn apply(&mut self, changes: &Changes, depth: usize) {
        apply_side(&mut self.asks, &changes.asks);
        apply_side(&mut self.bids, &changes.bids);
        while self.asks.len() > depth {
            self.asks.pop_last();
        }
        while self.bids.len() > depth {
            self.bids.pop_first();
        }
    }

    pub fn best_ask(&self) -> Option<Units> {
        self.asks.first_key_value().map(|(price, _)| *price)
    }

    pub fn best_bid(&self) -> Option<Units> {
        self.bids.last_key_value().map(|(price, _)| *price)
    }

    pub fn check(&self, expected: u32) -> Result<(), String> {
        if let (Some(bid), Some(ask)) = (self.best_bid(), self.best_ask())
            && bid > ask
        {
            return Err("Crossed order book".into());
        }
        let mut hasher = crc32fast::Hasher::new();
        for level in self
            .asks
            .values()
            .take(10)
            .chain(self.bids.values().rev().take(10))
        {
            hasher.update(level.digits.as_bytes());
        }
        let checksum = hasher.finalize();
        if checksum != expected {
            return Err(format!(
                "Checksum mismatch (expected {expected}, computed {checksum})"
            ));
        }
        Ok(())
    }
}
