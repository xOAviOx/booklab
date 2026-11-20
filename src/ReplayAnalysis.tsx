import { useRef, useState } from 'react';
import { makeDemoLink, MAX_DELAY_US } from './experiment';
import { grouped, milliseconds, priceDelta, seconds } from './format';
import { SweepPlot } from './SweepPlot';
import type { BookChanges, Order, Sweep, SweepKind } from './protocol';

const baselineColor = '#386355';
const delayedColor = '#ab5a20';
const btcAxis = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 4 });
const usdAxis = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

interface Props {
  mode: SweepKind | null;
  setMode: (mode: SweepKind | null) => void;
  sweep?: Sweep;
  order: Order | null;
  playing: boolean;
  error?: string;
  showChanges: boolean;
  setShowChanges: (show: boolean) => void;
  changes: BookChanges | null;
  demo: boolean;
  selectDelay: (delay: number) => void;
  selectQty: (qty: string) => void;
}

function ShareLink({ order }: { order: Order | null }) {
  const [copied, setCopied] = useState('');
  const [manual, setManual] = useState('');
  const manualField = useRef<HTMLInputElement>(null);
  const url = order ? makeDemoLink(order) : '';

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setManual('');
      setCopied(url);
    } catch {
      setManual(url);
      requestAnimationFrame(() => {
        manualField.current?.focus();
        manualField.current?.select();
      });
    }
  }

  return (
    <>
      <button className="analysis-button share-button" type="button" disabled={!order} onClick={() => void copy()}>
        {copied && copied === url ? 'Link copied' : 'Copy experiment link'}
      </button>
      <span className="sr-only" role="status">{copied && copied === url && 'Experiment link copied'}</span>
      {manual && manual === url && <input className="manual-share mono" ref={manualField} aria-label="Experiment link" readOnly value={manual} onFocus={(event) => event.currentTarget.select()} />}
    </>
  );
}

function LatencyPlot({ sweep, order, selectDelay }: { sweep: Extract<Sweep, { kind: 'latency' }>; order: Order; selectDelay: Props['selectDelay'] }) {
  const { points, validThroughUs } = sweep;
  const selected = order.delayUs <= validThroughUs ? points.findLast(({ delayUs }) => delayUs <= order.delayUs) : undefined;
  const before = points.findLast(({ delayUs }) => delayUs < order.delayUs);
  const after = points.find(({ delayUs }) => delayUs > order.delayUs);
  const change = selected ? priceDelta(selected.delta) : '—';
  return (
    <>
      <SweepPlot
        domain={MAX_DELAY_US}
        positions={points.map(({ delayUs }) => delayUs)}
        tracks={[
          { title: 'Avg. fill change · USD/BTC', symmetric: true, format: usdAxis.format, traces: [{ color: delayedColor, values: points.map(({ delta }) => delta ? Number(delta.magnitude) * delta.sign : null) }] },
          { title: 'Filled quantity · BTC', startAtZero: true, format: btcAxis.format, traces: [{ color: baselineColor, values: points.map(({ fill }) => Number(fill.filled)) }] },
        ]}
        selection={order.delayUs}
        validThrough={validThroughUs}
        xLabel={(us) => `${us / 1000} ms`}
        description="Estimated average price change and filled BTC by arrival delay. Use the arrival delay control or fill change buttons to inspect a point."
        select={(us) => selectDelay(Math.round(us))}
      />
      <div className="sweep-footer">
        <p className="sweep-selection">
          <strong className="mono">{milliseconds(order.delayUs)} ms</strong>
          {selected ? <> <span>{change} / BTC</span> <span>{grouped(selected.fill.filled)} BTC filled</span></> : <span>Beyond the recording</span>}
        </p>
        <div className="sweep-steps">
          <button className="analysis-button" type="button" disabled={!before} onClick={() => before && selectDelay(before.delayUs)}>Previous fill change</button>
          <button className="analysis-button" type="button" disabled={!after} onClick={() => after && selectDelay(after.delayUs)}>Next fill change</button>
        </div>
      </div>
      {validThroughUs < MAX_DELAY_US && <p className="sweep-limit">Recording ends at +{milliseconds(validThroughUs)} ms from the playhead.</p>}
    </>
  );
}

function SizePlot({ sweep, order, selectQty }: { sweep: Extract<Sweep, { kind: 'size' }>; order: Order; selectQty: Props['selectQty'] }) {
  const { points, baselineDepth, delayedDepth } = sweep;
  const positions = points.map(({ qty }) => Number(qty));
  const domain = positions.at(-1) ?? 1;
  const nearest = (qty: number) => {
    const next = positions.findIndex((position) => position >= qty);
    if (next === -1) return positions.length - 1;
    return next > 0 && qty - positions[next - 1] < positions[next] - qty ? next - 1 : next;
  };
  const selection = nearest(Number(order.qty));
  const traces = (field: 'average' | 'filled') => [
    { color: baselineColor, values: points.map(({ baseline }) => baseline[field] === null ? null : Number(baseline[field])) },
    { color: delayedColor, values: points.map(({ delayed }) => delayed?.[field] == null ? null : Number(delayed[field])) },
  ];
  return (
    <>
      <SweepPlot
        domain={domain}
        positions={positions}
        tracks={[
          { title: 'Avg. fill · USD/BTC', format: usdAxis.format, traces: traces('average') },
          { title: 'Filled quantity · BTC', startAtZero: true, format: btcAxis.format, traces: traces('filled') },
        ]}
        selection={Number(order.qty)}
        xLabel={(qty) => `${btcAxis.format(qty)} BTC`}
        description="Estimated average price and filled quantity by order size for both books. Explore order size to inspect a point."
        select={(qty) => selectQty(points[nearest(qty)].qty)}
      />
      <div className="sweep-footer size-footer">
        <p className="sweep-selection"><strong className="mono">{grouped(order.qty)} BTC</strong></p>
        <input type="range" min={0} max={points.length - 1} value={selection} disabled={points.length === 1} aria-label="Explore order size" aria-valuetext={`${order.qty} BTC`} onChange={(event) => selectQty(points[event.currentTarget.valueAsNumber].qty)} />
      </div>
      <p className="sweep-limit">
        Displayed liquidity <span className="series-label"><i className="series-baseline" />At playhead <strong>{grouped(baselineDepth)} BTC</strong></span>
        <span className="series-label"><i className="series-delayed" />{milliseconds(order.delayUs)} ms later <strong>{delayedDepth === null ? 'Unavailable' : `${grouped(delayedDepth)} BTC`}</strong></span>
      </p>
    </>
  );
}

function ChangeSummary({ changes }: { changes: BookChanges | null }) {
  if (!changes) return <p className="change-summary">Book changes are available when both snapshots are in the recording.</p>;
  const levels = [...changes.asks, ...changes.bids];
  if (levels.length === 0) return <p className="change-summary">No displayed liquidity changed between these snapshots.</p>;
  const added = levels.filter(({ before }) => before === '0').length;
  const removed = levels.filter(({ after }) => after === '0').length;
  return (
    <div className="change-summary">
      <span className="change-counts"><strong>{added}</strong> added <strong>{removed}</strong> removed <strong>{levels.length - added - removed}</strong> resized</span>
      <span>Changes reflect displayed depth, including levels entering or leaving the recorded range.</span>
    </div>
  );
}

export function ReplayAnalysis({ mode, setMode, sweep, order, playing, error, showChanges, setShowChanges, changes, demo, selectDelay, selectQty }: Props) {
  return (
    <section className="analysis-area" aria-label="Replay analysis">
      <div className="analysis-bar">
        <div className="analysis-modes">
          <button className="analysis-button" type="button" aria-pressed={mode === 'latency'} onClick={() => setMode(mode === 'latency' ? null : 'latency')}>Latency sweep</button>
          <button className="analysis-button" type="button" aria-pressed={mode === 'size'} onClick={() => setMode(mode === 'size' ? null : 'size')}>Size sweep</button>
          <button className="analysis-button change-button" type="button" aria-pressed={showChanges} onClick={() => setShowChanges(!showChanges)}>Book changes</button>
        </div>
        {demo && <ShareLink order={order} />}
      </div>
      {mode && (
        <section className="sweep panel" aria-label={mode === 'latency' ? 'Latency sweep' : 'Size sweep'}>
          <header className="sweep-heading">
            <h2>{mode === 'latency' ? 'Fill by arrival delay' : 'Fill by order size'}</h2>
            {order && <span className="mono">{mode === 'latency' ? `${grouped(order.qty)} BTC ` : ''}{order.side} · {seconds(order.playheadUs)}</span>}
          </header>
          {playing ? <p className="sweep-limit">Pause replay to inspect the sweep at a fixed time.</p>
            : !order ? <p className="sweep-limit">Enter a valid size and delay to view the sweep.</p>
              : error ? <p className="sweep-limit" role="alert">{error}</p>
                : sweep?.kind === 'latency' ? <LatencyPlot sweep={sweep} order={order} selectDelay={selectDelay} />
                  : sweep?.kind === 'size' ? <SizePlot sweep={sweep} order={order} selectQty={selectQty} />
                    : <p className="sweep-limit" role="status">Calculating sweep…</p>}
        </section>
      )}
      {showChanges && <ChangeSummary changes={changes} />}
    </section>
  );
}
