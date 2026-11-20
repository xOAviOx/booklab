pub(crate) type Units = u64;
pub(crate) const SCALE: Units = 100_000_000;
pub(crate) const UNITS_PER_CENT: Units = SCALE / 100;

pub(crate) fn parse(value: &str) -> Result<Units, &'static str> {
    let (whole, fraction) = value.split_once('.').unwrap_or((value, ""));
    if whole.is_empty()
        || !whole.bytes().all(|digit| digit.is_ascii_digit())
        || !fraction.bytes().all(|digit| digit.is_ascii_digit())
        || value.ends_with('.')
    {
        return Err("expected a nonnegative decimal");
    }
    let fraction = fraction.trim_end_matches('0');
    if fraction.len() > 8 {
        return Err("expected at most eight decimal places");
    }

    let whole: Units = whole.parse().map_err(|_| "decimal is out of range")?;
    let fractional_units: Units = fraction.parse().unwrap_or(0);
    whole
        .checked_mul(SCALE)
        .and_then(|units| {
            units.checked_add(fractional_units * 10_u64.pow(8 - fraction.len() as u32))
        })
        .ok_or("decimal is out of range")
}

pub(crate) fn format(units: u128, places: u32) -> String {
    let scale = 10_u128.pow(places);
    let whole = units / scale;
    let fraction = units % scale;
    if fraction == 0 {
        return whole.to_string();
    }
    let digits = format!("{fraction:0width$}", width = places as usize);
    format!("{whole}.{}", digits.trim_end_matches('0'))
}

pub(crate) fn format_cents(cents: &str) -> String {
    if cents.len() <= 2 {
        return format!("0.{cents:0>2}");
    }
    let (whole, fraction) = cents.split_at(cents.len() - 2);
    format!("{whole}.{fraction}")
}
