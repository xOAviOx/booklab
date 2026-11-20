use super::*;
use crate::fills::Side;
use serde_json::json;

fn query(replay: &Replay, time: u64, delay: u64, side: Side, qty: &str) -> Comparison {
    replay
        .query(Order {
            playhead_us: time,
            delay_us: delay,
            side,
            qty: qty.into(),
        })
        .unwrap()
}

#[test]
fn validates_krakens_published_snapshot() {
    // https://docs.kraken.com/exchange/guides/websockets/book-checksum-v2#example
    let asks = [
        ("45285.2", "0.00100000"),
        ("45286.4", "1.54571953"),
        ("45286.6", "1.54571109"),
        ("45289.6", "1.54560911"),
        ("45290.2", "0.15890660"),
        ("45291.8", "1.54553491"),
        ("45294.7", "0.04454749"),
        ("45296.1", "0.35380000"),
        ("45297.5", "0.09945542"),
        ("45299.5", "0.18772827"),
    ];
    let bids = [
        ("45283.5", "0.10000000"),
        ("45283.4", "1.54582015"),
        ("45282.1", "0.10000000"),
        ("45281.0", "0.10000000"),
        ("45280.3", "1.54592586"),
        ("45279.0", "0.07990000"),
        ("45277.6", "0.03310103"),
        ("45277.5", "0.30000000"),
        ("45277.3", "1.54602737"),
        ("45276.6", "0.15445238"),
    ];
    let levels = |entries: &[(&str, &str)]| {
        entries
            .iter()
            .map(|(price, qty)| format!(r#"{{"price":{price},"qty":{qty}}}"#))
            .collect::<Vec<_>>()
            .join(",")
    };
    let raw = format!(
        r#"{{"channel":"book","type":"snapshot","data":[{{"symbol":"BTC/USD","asks":[{}],"bids":[{}],"checksum":3310070434}}]}}"#,
        levels(&asks),
        levels(&bids)
    );
    let mut replay = Replay::start_capture();
    replay.append_frame(0, &raw).unwrap();
    assert_eq!(replay.latest.asks.len(), 10);
    assert!(
        Replay::start_capture()
            .append_frame(0, &raw.replace("0.00100000", "0.001"))
            .is_err()
    );
}

#[test]
fn bundled_example_has_exact_golden_result_and_reversible_seek() {
    let replay = Replay::load(include_str!("../../../public/recordings/synthetic.ndjson")).unwrap();
    let result = query(&replay, 4_000_000, 250_000, Side::Buy, "0.75");
    let earlier = result.baseline.unwrap();
    let later = result.delayed.unwrap();
    assert_eq!(earlier.average.as_deref(), Some("100001.33"));
    assert_eq!(later.average.as_deref(), Some("100005.33"));
    assert_eq!(earlier.asks[0].taken, "0.25");
    assert_eq!(earlier.asks[1].taken, "0.5");
    assert_eq!(earlier.filled, "0.75");
    assert_eq!(earlier.unfilled, "0");
    assert_eq!(earlier.notional, "75001");
    assert_eq!(result.delta.unwrap().magnitude, "4.00");
    assert_eq!(
        query(&replay, 4_000_000, 0, Side::Buy, "0.75")
            .delta
            .unwrap()
            .sign,
        0
    );
    assert_eq!(
        query(&replay, 4_249_999, 0, Side::Buy, "0.75")
            .baseline
            .unwrap()
            .average,
        earlier.average
    );
    assert!(
        query(&replay, 12_000_000, 1, Side::Buy, "1")
            .delayed
            .is_none()
    );
    let sell = query(&replay, 4_250_000, 0, Side::Sell, "0.75")
        .baseline
        .unwrap();
    assert!(sell.bids[0].taken != "0" && sell.asks[0].taken == "0");
    assert_eq!(
        query(&replay, 4_000_000, 0, Side::Buy, "0.75")
            .baseline
            .unwrap()
            .average,
        earlier.average
    );
}

fn frame(kind: &str, asks: &[(&str, &str)], bids: &[(&str, &str)], checksum_input: &str) -> String {
    let levels = |entries: &[(&str, &str)]| {
        entries
            .iter()
            .map(|(price, qty)| json!({"price": price, "qty": qty}))
            .collect::<Vec<_>>()
    };
    json!({"type":kind,"channel":"book","data":[{"symbol":"BTC/USD", "asks":levels(asks), "bids":levels(bids), "checksum":crc32fast::hash(checksum_input.as_bytes())}]}).to_string()
}

#[test]
fn applies_whole_frames_in_order_and_prunes_stale_depth() {
    let mut replay = Replay::new(Source::Synthetic, 2);
    replay
        .append_frame(
            0,
            &frame(
                "snapshot",
                &[("102", "1"), ("100", "1")],
                &[("99", "2")],
                "10011021992",
            ),
        )
        .unwrap();
    let update = frame(
        "update",
        &[
            ("101", "1"),
            ("101", "2"),
            ("100", "0"),
            ("98", "0"),
            ("103", "1"),
        ],
        &[],
        "10121021992",
    );
    assert!(
        replay
            .append_frame(1, &update.replace("\"qty\":\"2\"", "\"qty\":\"3\""))
            .is_err()
    );
    replay.append_frame(1, &update).unwrap();
    let second = frame("update", &[("102", "0")], &[], "1012992");
    replay.append_frame(1, &second).unwrap();
    let result = query(&replay, 1, 0, Side::Buy, "4").baseline.unwrap();
    assert_eq!(result.asks.len(), 1);
    assert_eq!(result.asks[0].price, "101");
    assert_eq!(result.filled, "2");
    assert_eq!(result.unfilled, "2");
    assert!(replay.append_frame(0, &second).is_err());
    assert!(
        replay
            .append_frame(2, &frame("snapshot", &[], &[], ""))
            .is_err()
    );
}

#[test]
fn handles_empty_liquidity_invalid_decimals_and_subcent_changes() {
    let mut replay = Replay::start_capture();
    replay
        .append_frame(0, &frame("snapshot", &[("100.001", "1")], &[], "1000011"))
        .unwrap();
    replay
        .append_frame(
            1,
            &frame(
                "update",
                &[("100.001", "0"), ("100.004", "1")],
                &[],
                "1000041",
            ),
        )
        .unwrap();
    let delta = query(&replay, 0, 1, Side::Buy, "1").delta.unwrap();
    assert_eq!((delta.sign, delta.magnitude.as_str()), (1, "0.00"));
    let zero = query(&replay, 0, 1, Side::Sell, "1");
    assert!(zero.delta.is_none());
    assert!(zero.baseline.unwrap().average.is_none());
    assert!(decimal::parse("0.123456789").is_err());
    assert!(decimal::parse("1e-3").is_err());
    assert_eq!(decimal::parse("1.123456780").unwrap(), 112_345_678);
    assert!(
        replay
            .append_frame(2, &frame("update", &[], &[("110", "1")], "10000411101"))
            .unwrap_err()
            .contains("Crossed")
    );
}

#[test]
fn rejects_invalid_recordings_without_publishing_a_prefix() {
    let demo = include_str!("../../../public/recordings/synthetic.ndjson");
    assert!(Replay::load(&(demo.to_owned() + "{\"elapsed_us\":0}\n")).is_err());
    assert!(Replay::load(&demo.replacen("\"version\":1", "\"version\":2", 1)).is_err());
    assert!(Replay::load(demo.lines().next().unwrap()).is_err());
}

#[test]
fn seeks_across_a_checkpoint_in_both_directions() {
    let mut replay = Replay::start_capture();
    replay
        .append_frame(0, &frame("snapshot", &[("100", "1")], &[], "1001"))
        .unwrap();
    let checkpoint = CHECKPOINT_INTERVAL as u64;
    for time in 1..=checkpoint + 2 {
        let size = (time + 1).to_string();
        let update = frame("update", &[("100", &size)], &[], &format!("100{size}"));
        replay.append_frame(time, &update).unwrap();
    }
    for time in [
        checkpoint + 2,
        0,
        checkpoint,
        checkpoint - 1,
        checkpoint + 1,
    ] {
        let result = query(&replay, time, 0, Side::Buy, "1000").baseline.unwrap();
        assert_eq!(result.filled, (time + 1).to_string());
    }
}

#[test]
fn latency_sweep_uses_exact_grouped_updates_and_stops_at_the_recording_end() {
    let mut replay = Replay::start_capture();
    replay
        .append_frame(
            0,
            &frame("snapshot", &[("100", "1"), ("102", "2")], &[], "10011022"),
        )
        .unwrap();
    replay
        .append_frame(
            125_001,
            &frame("update", &[("100", "0.5")], &[], "10051022"),
        )
        .unwrap();
    replay
        .append_frame(125_001, &frame("update", &[("100", "0")], &[], "1022"))
        .unwrap();
    replay
        .append_frame(350_001, &frame("update", &[("102", "0")], &[], ""))
        .unwrap();

    let order = Order {
        playhead_us: 0,
        delay_us: 0,
        side: Side::Buy,
        qty: "0.75".into(),
    };
    let sweep = analysis::latency(&replay, &order).unwrap();
    assert_eq!(replay.describe().update_times, vec![0, 125_001, 350_001]);
    assert_eq!(sweep.valid_through_us, 350_001);
    assert_eq!(
        sweep
            .points
            .iter()
            .map(|point| point.delay_us)
            .collect::<Vec<_>>(),
        vec![0, 125_001, 350_001]
    );
    let selection = query(&replay, 0, 125_001, Side::Buy, "0.75");
    assert_eq!(sweep.points[1].delta, selection.delta);
    assert_eq!(sweep.points[1].fill.average.as_deref(), Some("102.00"));
    assert_eq!(sweep.points[2].fill.filled, "0");
    assert_eq!(sweep.points[2].delta, None);
    let changes = selection.changes.unwrap();
    assert_eq!(changes.asks.len(), 1);
    assert_eq!(
        (&*changes.asks[0].price, &*changes.asks[0].qty_delta),
        ("100", "-1")
    );
    assert!(
        query(&replay, 0, 350_002, Side::Buy, "0.75")
            .changes
            .is_none()
    );
}

#[test]
fn size_sweep_includes_both_depth_limits_and_agrees_with_the_order_estimate() {
    let mut replay = Replay::start_capture();
    replay
        .append_frame(
            0,
            &frame(
                "snapshot",
                &[("100", "1")],
                &[("99", "1"), ("98", "0.5")],
                "1001991985",
            ),
        )
        .unwrap();
    replay
        .append_frame(
            100_000,
            &frame(
                "update",
                &[],
                &[("99", "0.5"), ("97", "0.25")],
                "10019959859725",
            ),
        )
        .unwrap();
    let order = Order {
        playhead_us: 0,
        delay_us: 100_000,
        side: Side::Sell,
        qty: "2".into(),
    };
    let sweep = analysis::size(&replay, &order).unwrap();
    assert_eq!(sweep.baseline_depth, "1.5");
    assert_eq!(sweep.delayed_depth.as_deref(), Some("1.25"));
    for threshold in ["0.5", "1", "1.25", "1.5"] {
        assert!(sweep.points.iter().any(|point| point.qty == threshold));
    }
    let selected = sweep.points.iter().find(|point| point.qty == "2").unwrap();
    let comparison = query(&replay, 0, 100_000, Side::Sell, "2");
    assert_eq!(
        selected.baseline.average,
        comparison.baseline.unwrap().average
    );
    assert_eq!(
        selected.delayed.as_ref().unwrap().average.as_deref(),
        Some("98.20")
    );
    let changes = comparison.changes.unwrap();
    assert!(changes.asks.is_empty());
    assert_eq!(
        changes
            .bids
            .iter()
            .map(|level| level.qty_delta.as_str())
            .collect::<Vec<_>>(),
        ["+0.25", "-0.5"]
    );
    let unavailable = analysis::size(
        &replay,
        &Order {
            delay_us: 1_000_000,
            ..order
        },
    )
    .unwrap();
    assert!(unavailable.delayed_depth.is_none());
    assert!(
        unavailable
            .points
            .iter()
            .all(|point| point.delayed.is_none())
    );
}
