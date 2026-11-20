import { useId, useState, type CSSProperties } from 'react';
import { grouped, seconds } from './format';
import type { BookChanges, DepthChange, Level, Scenario } from './protocol';

type Props = {
  title: string;
  timeUs: number;
  scenario: Scenario | null | undefined;
  depthScale: number;
  delayed?: boolean;
  emptyMessage: string;
  changes?: BookChanges | null;
};

function visibleLevels(levels: Level[], expanded: boolean) {
  if (expanded) return levels;
  const lastConsumed = levels.findLastIndex((level) => level.taken !== '0');
  return levels.slice(0, Math.max(5, lastConsumed + 1));
}

function rows(levels: Level[], side: 'ask' | 'bid', depthScale: number, changes?: DepthChange[]) {
  const byPrice = changes && new Map(changes.map((change) => [change.price, change]));
  return levels.map((level) => {
    const change = byPrice?.get(level.price);
    return (
      <tr key={level.price} className={level.taken !== '0' ? 'consumed' : undefined}>
        <td className={`level-price ${side}`}>{grouped(level.price, 2)}</td>
        <td className="level-size" style={{ '--depth': Number(level.qty) / depthScale } as CSSProperties}>
          <span>{grouped(level.qty, 4)}</span>
        </td>
        <td className="level-taken">{level.taken === '0' ? <span className="dash">—</span> : grouped(level.taken, 4)}</td>
        {changes && <td className="level-change">
          {change ? <span className={change.qtyDelta.startsWith('+') ? 'depth-gain' : 'depth-loss'}>
            {change.before === '0' ? <small>Added</small> : change.after === '0' ? <small>Removed</small> : null}
            <span>{change.qtyDelta.startsWith('+') ? '+' : '−'}{grouped(change.qtyDelta.slice(1))}</span>
          </span> : <span className="dash">—</span>}
        </td>}
      </tr>
    );
  });
}

export function BookPanel({ title, timeUs, scenario, depthScale, delayed = false, emptyMessage, changes }: Props) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const asks = scenario ? visibleLevels(scenario.asks, expanded) : [];
  const bids = scenario ? visibleLevels(scenario.bids, expanded) : [];
  const hidden = scenario ? scenario.asks.length + scenario.bids.length - asks.length - bids.length : 0;
  const columns = changes ? 4 : 3;

  return (
    <section className={`book-panel panel${delayed ? ' delayed' : ''}`} aria-labelledby={id}>
      <header className="book-header">
        <h2 id={id}><span className="time-marker" aria-hidden="true" />{title}</h2>
        <span className="book-time mono">{seconds(timeUs)}</span>
      </header>
      {scenario ? (
        <>
          <dl className="book-summary">
            <div><dt>Avg. fill <span>USD/BTC</span></dt><dd>{scenario.average === null ? '—' : `$${grouped(scenario.average, 2)}`}</dd></div>
            <div><dt>Filled</dt><dd>{grouped(scenario.filled)} <small>BTC</small></dd></div>
            <div><dt>Unfilled</dt><dd>{grouped(scenario.unfilled)} <small>BTC</small></dd></div>
          </dl>
          {scenario.unfilled !== '0' && <p className="liquidity-message">Insufficient displayed liquidity</p>}
          <table className={`book-table${changes ? ' with-changes' : ''}`}>
            <caption className="sr-only">{title} order book</caption>
            <thead><tr><th scope="col">Price <span>USD</span></th><th scope="col">Size <span>BTC</span></th><th scope="col">Taken <span>BTC</span></th>{changes && <th scope="col">Change <span>BTC</span></th>}</tr></thead>
            <tbody className="ask-rows">
              <tr className="side-label"><th colSpan={columns} scope="rowgroup">Asks</th></tr>
              {asks.length ? rows([...asks].reverse(), 'ask', depthScale, changes?.asks) : <tr><td colSpan={columns}>No displayed asks</td></tr>}
            </tbody>
            <tbody><tr className="spread"><td colSpan={columns}>Spread <strong>{scenario.spread === null ? '—' : `$${grouped(scenario.spread, 2)}`}</strong></td></tr></tbody>
            <tbody className="bid-rows">
              <tr className="side-label"><th colSpan={columns} scope="rowgroup">Bids</th></tr>
              {bids.length ? rows(bids, 'bid', depthScale, changes?.bids) : <tr><td colSpan={columns}>No displayed bids</td></tr>}
            </tbody>
          </table>
          {(expanded || hidden > 0) && <button className="expand-book" type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Show fewer levels' : `Show ${hidden} more levels`}</button>}
        </>
      ) : <p className="book-empty">{emptyMessage}</p>}
    </section>
  );
}
