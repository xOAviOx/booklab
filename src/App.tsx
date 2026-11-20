import { useEffect, useRef, useState } from 'react';
import { BookPanel } from './BookPanel';
import { MAX_DELAY_US, parseDelay, qtyError, readDemoLink, updateNeighbors } from './experiment';
import { milliseconds, priceDelta, seconds } from './format';
import { ReplayAnalysis } from './ReplayAnalysis';
import { Timeline } from './Timeline';
import { exportRecording } from './recordings';
import { useReplay } from './useReplay';
import type { Comparison, Loaded, Order, Side, SweepKind } from './protocol';

type Lab = ReturnType<typeof useReplay>;

function RecordingMenu({ lab }: { lab: Lab }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const selectedFile = lab.recording?.file;
  const closeMenu = () => { if (menu.current) menu.current.open = false; };

  return (
    <div className="header-actions">
      <input
        ref={fileInput}
        hidden
        type="file"
        accept=".ndjson,.jsonl,application/x-ndjson"
        aria-label="Import recording file"
        onChange={(event) => {
          const [file] = event.currentTarget.files ?? [];
          if (file) lab.load({ name: file.name, blob: file }, true);
          event.currentTarget.value = '';
        }}
      />
      <details className="recordings-menu" ref={menu} onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) closeMenu();
      }} onKeyDown={(event) => {
        if (event.key !== 'Escape' || !event.currentTarget.open) return;
        closeMenu();
        event.currentTarget.querySelector('summary')?.focus();
      }}>
        <summary><span className="recording-name">{selectedFile?.name ?? 'Recordings'}</span><span className="chevron" aria-hidden="true" /></summary>
        <div className="recordings-popover">
          <button type="button" onClick={() => { closeMenu(); lab.openDemo(); }}>Synthetic session</button>
          <button type="button" onClick={() => { closeMenu(); fileInput.current?.click(); }}>Import recording</button>
          {selectedFile && <button type="button" onClick={() => { closeMenu(); exportRecording(selectedFile); }}>Export current recording</button>}
          {lab.library.length > 0 && (
            <div className="recordings-library">
              <p>Saved on this device</p>
              {lab.library.map((file) => <button type="button" key={file.id} onClick={() => { closeMenu(); lab.load(file); }}>{file.name}</button>)}
            </div>
          )}
        </div>
      </details>
      <button className={`record-button${lab.capture !== 'idle' ? ' capturing' : ''}`} type="button" onClick={lab.toggleCapture}>
        <span className="record-dot" aria-hidden="true" />
        {lab.capture === 'recording' ? 'Stop recording' : lab.capture === 'connecting' ? 'Cancel connection' : 'Record Kraken feed'}
      </button>
    </div>
  );
}

function PriceDifference({ delta, side, available }: { delta: Comparison['delta'] | undefined; side: Side; available: boolean }) {
  const label = delta?.sign === 0 ? 'Same average price'
    : side === 'buy' ? (delta?.sign === 1 ? 'More expensive' : 'Cheaper')
      : (delta?.sign === 1 ? 'Higher proceeds per BTC' : 'Lower proceeds per BTC');
  return (
    <section className="difference" aria-label="Average fill price difference">
      <div className="difference-heading">Avg. fill price change <span>USD/BTC</span></div>
      <output className="difference-value" aria-label="Price difference" aria-live="off">{priceDelta(delta)}</output>
      <span className="difference-caption">{delta ? label : available ? 'No comparable fill' : 'Comparison unavailable'}</span>
    </section>
  );
}

function Experiment({ recording, lab }: { recording: Loaded; lab: Lab }) {
  const { metadata, id } = recording;
  const { endUs } = metadata;
  const [initial] = useState<Order>(() => {
    const delayUs = Math.min(250_000, endUs);
    const startUs = metadata.source === 'synthetic' ? Math.min(4_000_000, endUs - delayUs) : 0;
    return (recording.demo && readDemoLink(endUs)) || { playheadUs: startUs, qty: '0.75', delayUs, side: 'buy' };
  });
  const [playheadUs, setPlayhead] = useState(initial.playheadUs);
  const [qty, setQty] = useState(initial.qty);
  const [delay, setDelay] = useState(String(initial.delayUs / 1000));
  const [side, setSide] = useState<Side>(initial.side);
  const [playing, setPlaying] = useState(false);
  const [sweepMode, setSweepMode] = useState<SweepKind | null>(null);
  const [showChanges, setShowChanges] = useState(false);
  const clock = useRef(playheadUs);
  const delayUs = parseDelay(delay);
  const invalidQty = qtyError(qty);
  const delayedUs = playheadUs + (delayUs ?? 0);
  const order: Order | null = delayUs === null || invalidQty ? null : { playheadUs, delayUs, side, qty };
  const { compare, analyze } = lab;
  const previousSweep = lab.analysis?.request;
  const validSweepContext = previousSweep?.recordingId === id && previousSweep.kind === sweepMode
    && previousSweep.order.playheadUs === playheadUs && previousSweep.order.side === side;
  const sweepResult = lab.analysis?.type === 'analysis-result' ? lab.analysis.value : undefined;
  const sweepDelay = sweepMode === 'latency' && delayUs !== null ? 0 : delayUs;
  const validSweepInputs = Boolean(validSweepContext && (sweepMode === 'latency' ? previousSweep.order.qty === qty
    : previousSweep.order.delayUs === delayUs && (previousSweep.order.qty === qty
      || (sweepResult?.kind === 'size' && Number(qty) <= Number(sweepResult.points.at(-1)?.qty)))));

  useEffect(() => {
    compare(id, delayUs === null || invalidQty ? null : { playheadUs, delayUs, side, qty });
  }, [compare, delayUs, id, invalidQty, playheadUs, qty, side]);

  useEffect(() => {
    if (playing || !sweepMode || sweepDelay === null || invalidQty) {
      analyze(id, null, null);
      return;
    }
    if (validSweepInputs) return;
    const timer = setTimeout(() => analyze(id, sweepMode, { playheadUs, delayUs: sweepDelay, side, qty }), 100);
    return () => clearTimeout(timer);
  }, [analyze, id, invalidQty, playing, playheadUs, qty, side, sweepDelay, sweepMode, validSweepInputs]);

  useEffect(() => {
    if (!playing) return;
    const start = performance.now();
    const origin = clock.current;
    let frame = 0;
    let lastRender = start;
    const tick = (time: number) => {
      const position = Math.min(endUs, origin + Math.round(Math.max(0, time - start) * 1000));
      if (position === endUs || time - lastRender >= 40) {
        clock.current = position;
        setPlayhead(position);
        lastRender = time;
      }
      if (position < endUs) frame = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [endUs, playing]);

  function seek(time: number) {
    setPlaying(false);
    clock.current = time;
    setPlayhead(time);
  }

  function togglePlaying() {
    if (playing) setPlaying(false);
    else {
      if (playheadUs === endUs) seek(0);
      setPlaying(true);
    }
  }

  function selectDelay(us: number) {
    setDelay(String(us / 1000));
  }

  const updates = updateNeighbors(metadata.updateTimes, playheadUs);

  const received = lab.result?.request;
  const currentResult = received?.recordingId === id && received.order.qty === qty
    && received.order.delayUs === delayUs && received.order.side === side ? lab.result?.value : undefined;
  const comparison = order ? currentResult : undefined;
  const levels = [comparison?.baseline, comparison?.delayed].flatMap((scenario) => scenario ? [...scenario.asks, ...scenario.bids] : []);
  const depthScale = Math.max(Number.MIN_VALUE, ...levels.map((level) => Number(level.qty)));
  const baseline = comparison?.baseline;
  const later = comparison?.delayed;
  const missingInputs = !order;
  const noBook = missingInputs ? 'Enter a valid size and delay to compare fills.' : 'Calculating estimate…';
  const laterUnavailable = (comparison?.delayedUs ?? delayedUs) > endUs;

  return (
    <>
      <section className="timeline panel" aria-label="Replay timeline">
        <div className="timeline-heading">
          <div className="transport">
            <div className="transport-buttons">
              <button className="step-button previous" type="button" aria-label="Previous book update" title="Previous book update" disabled={updates.previous === undefined} onClick={() => seek(updates.previous)}><span aria-hidden="true" /></button>
              <button className="play-button" type="button" aria-label={playing ? 'Pause replay' : 'Play replay'} onClick={togglePlaying} disabled={endUs === 0}>
                <span className={playing ? 'pause-icon' : 'play-icon'} aria-hidden="true" />
              </button>
              <button className="step-button" type="button" aria-label="Next book update" title="Next book update" disabled={updates.next === undefined} onClick={() => seek(updates.next)}><span aria-hidden="true" /></button>
            </div>
            <div>
              <h2>Replay timeline</h2>
              <p className="timeline-source">{metadata.source === 'synthetic' ? 'Synthetic timeline' : 'Browser receipt time'} <span>·</span> {metadata.depth} levels per side</p>
            </div>
          </div>
          <div className="timeline-key">
            <span><i className="key-mark" /> <span className="key-label">Playhead</span> <b className="mono">{seconds(playheadUs)}</b></span>
            <span><i className="key-mark later-mark" /> <span className="key-label">Delayed</span> <b className="mono">{delayUs === null ? '—' : seconds(delayedUs)}</b></span>
          </div>
        </div>
        <Timeline points={metadata.chart} endUs={endUs} playheadUs={playheadUs} delayedUs={delayedUs} onSeek={seek} />
        <div className="plot-legend"><span><i className="ask-line" />Best ask</span><span><i className="bid-line" />Best bid</span></div>
      </section>

      <div className="experiment-controls">
        <section className="order-controls panel" aria-label="Hypothetical market order">
          <h2>Market order</h2>
          <div className="order-fields">
            <fieldset>
              <legend>Side</legend>
              <div className="side-options">
                {(['buy', 'sell'] as const).map((choice) => (
                  <label key={choice} className={choice}><input type="radio" name="order-side" checked={side === choice} onChange={() => setSide(choice)} /><span>{choice === 'buy' ? 'Buy' : 'Sell'}</span></label>
                ))}
              </div>
            </fieldset>
            <div className="quantity-field">
              <label htmlFor="quantity">Quantity</label>
              <div className="unit-field"><input id="quantity" inputMode="decimal" autoComplete="off" maxLength={30} value={qty} aria-invalid={Boolean(invalidQty)} aria-describedby={invalidQty ? 'qty-error' : undefined} onChange={(event) => setQty(event.currentTarget.value)} /><span>BTC</span></div>
            </div>
            <div className="delay-field">
              <label htmlFor="delay-number">Arrival delay</label>
              <div className="delay-inputs">
                <input aria-label="Arrival delay slider" aria-valuetext={`${milliseconds(delayUs ?? 0)} milliseconds`} type="range" min={0} max={1000} step={0.001} value={(delayUs ?? 0) / 1000} onChange={(event) => setDelay(event.currentTarget.value)} onKeyDown={(event) => {
                  const direction = ['ArrowLeft', 'ArrowDown'].includes(event.key) ? -1 : ['ArrowRight', 'ArrowUp'].includes(event.key) ? 1 : 0;
                  if (!direction) return;
                  event.preventDefault();
                  const change = (event.shiftKey ? 25_000 : 1000) * direction;
                  selectDelay(Math.min(MAX_DELAY_US, Math.max(0, (delayUs ?? 0) + change)));
                }} />
                <div className="unit-field"><input id="delay-number" type="number" min={0} max={1000} step={0.001} value={delay} aria-invalid={delayUs === null} aria-describedby={delayUs === null ? 'delay-error' : undefined} onChange={(event) => setDelay(event.currentTarget.value)} /><span>ms</span></div>
              </div>
            </div>
          </div>
          {invalidQty && <p className="field-error" id="qty-error">{invalidQty}</p>}
          {delayUs === null && <p className="field-error" id="delay-error">Enter 0 to 1,000 ms, with up to three decimal places.</p>}
        </section>
        <PriceDifference delta={comparison?.delta} side={side} available={Boolean(baseline && later)} />
      </div>

      <ReplayAnalysis mode={sweepMode} setMode={setSweepMode} sweep={validSweepInputs ? sweepResult : undefined}
        order={order} playing={playing} error={validSweepInputs && lab.analysis?.type === 'analysis-error' ? lab.analysis.error : undefined}
        showChanges={showChanges} setShowChanges={setShowChanges} changes={comparison?.changes ?? null}
        demo={recording.demo} selectDelay={selectDelay} selectQty={setQty} />
      <div className="books">
        <BookPanel title="At playhead" timeUs={baseline?.atUs ?? playheadUs} scenario={baseline} depthScale={depthScale} emptyMessage={noBook} changes={showChanges ? comparison?.changes : null} />
        <BookPanel title={delayUs === null ? 'Delayed order' : `${milliseconds(delayUs)} ms later`} timeUs={later?.atUs ?? delayedUs} scenario={later} depthScale={depthScale} delayed emptyMessage={missingInputs ? noBook : laterUnavailable ? `This recording ends at ${seconds(endUs)}.` : noBook} changes={showChanges ? comparison?.changes : null} />
      </div>
      <footer className="method-note"><strong>Estimated fills against displayed liquidity.</strong> Historical book updates stay fixed. Estimates exclude fees, hidden liquidity, and other traders’ reactions.</footer>
    </>
  );
}

export function App() {
  const lab = useReplay();

  return (
    <>
      <header className="masthead">
        <div className="masthead-inner">
          <div className="wordmark"><span className="lab-mark" aria-hidden="true"><i /><i /><i /></span> Book Lab</div>
          <RecordingMenu lab={lab} />
        </div>
      </header>
      <main className="workspace">
        <div className="page-heading">
          <div><h1>Order book replay</h1><p>Compare the same market order at two moments.</p></div>
          <div className="pair"><span className="bitcoin" aria-hidden="true">₿</span><strong>BTC<span>/</span>USD</strong></div>
        </div>
        {lab.error && <p className="notice error" role="alert">{lab.error}</p>}
        {lab.notice && <p className="notice" role="status">{lab.notice}</p>}
        {lab.loading && <p className="notice" role="status">Loading and checking recording…</p>}
        {lab.recording && <Experiment key={lab.recording.id} recording={lab.recording} lab={lab} />}
      </main>
    </>
  );
}
