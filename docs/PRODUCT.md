# Product and interface

## The experiment

A visitor should be able to open the lab and answer a specific question in one interaction. If the same hypothetical BTC/USD market order arrived later on this recording’s timeline, how would the displayed fill change?

1. Open the synthetic example at a paused moment with a meaningful comparison already visible. Use a 0.75 BTC market buy and a 250 ms delay as the starting values.
2. Play, pause, or scrub a single timeline. Mark both the selected time and the delayed time on the same chart. Keep the order and delay fixed while the playhead moves.
3. Choose Buy or Sell, enter a BTC quantity, and adjust the delay from 0 to 1,000 ms. Pair the slider with an editable millisecond value for precise input. Recalculate as valid inputs change.
4. Compare two book snapshots, labeled “At playhead” and “250 ms later” at the default setting. In each, highlight the consumed levels and show exactly how much BTC was taken at each price. Show filled and unfilled quantity and the weighted average in USD per BTC.
5. Show the signed delayed-minus-baseline average price difference with “More expensive” or “Cheaper” for buys and “Lower proceeds per BTC” or “Higher proceeds per BTC” for sells. Use “Same average price” when both averages are equal. When fill sizes differ, make both fill amounts visible next to the averages so users can interpret the comparison.

Use the same flow for the bundled demo, an imported file, and a saved local capture. Keep recording, import, and the local library together under the recording selector. Label the source, time basis, and published depth near the replay controls. Live capture starts only when a visitor selects “Record Kraken feed.”

## Screen and visual direction

- Build one compact workbench. Put the pair and recording selector at the top, then the chart with transport controls, an order control row, the price difference, and the two synchronized book tables. The initial desktop view should show the comparison without a hero or onboarding modal.
- Use a warm off-white canvas, ink text, restrained bid and ask colors, and a distinct accent for consumed liquidity. Start with Geist for controls and IBM Plex Mono with tabular figures for prices and quantities. Use thin rules and whitespace to align the book columns and metrics.
- Use a shared depth-bar scale and the same column order in both books. Keep best-price and spread labels easy to find. A consumed row needs a text label or explicit “Taken” quantity as well as color. Make every consumed level inspectable, including levels beyond the initially visible rows.
- On narrow screens, stack the books with each scenario’s time and fill summary attached to it. Keep the delta above both panels. Preserve keyboard access, clear focus, readable contrast, and reduced motion preferences.
- Keep the timeline compact. A best-bid and best-ask trace plus the two time markers is enough to explain the move. Display the selected times as text as well as chart markers.

## Result states and language

Use the line “Estimated fills against displayed liquidity.” near the result. In a short explanation nearby, state that historical updates stay fixed, other traders’ responses are outside the model, and estimates exclude fees and hidden liquidity. For live captures, label the clock “Browser receipt time.” For the demo, use “Synthetic timeline.”

| Situation | Interface behavior |
| --- | --- |
| Zero delay | Show identical books, quantities, and prices. A filled order has a zero price difference. |
| Partial or zero fill | Show unfilled BTC and “Insufficient displayed liquidity.” Render an unavailable average and delta when a scenario filled zero. |
| Delay extends past the last verified event | Keep the baseline result visible, mark the delayed result unavailable, and explain where the recording ends. |
| Invalid quantity | Show the input error inline. Suppress estimates until the value is valid. |
| Invalid recording | Explain the import error and keep the current replay open. |
| Capture stops on an integrity or connection failure | Explain why it stopped and offer the verified prefix when one exists. |

The weekend release covers one pair, market orders sized in BTC, and local recordings. Limit orders, queue position, exchange arrival prediction, market impact, and live execution are outside this release. [HftBacktest order-fill model](https://hft.readthedocs.io/en/latest/order_fill.html)
