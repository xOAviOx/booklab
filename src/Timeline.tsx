import { useEffect, useRef } from 'react';
import { seconds } from './format';
import type { ChartPoint } from './protocol';

type PlotProps = {
  points: ChartPoint[];
  endUs: number;
  playheadUs: number;
  delayedUs: number;
  onSeek: (time: number) => void;
};

function plot(canvas: HTMLCanvasElement, points: ChartPoint[], endUs: number, playheadUs: number, delayedUs: number) {
  const { width, height } = canvas.getBoundingClientRect();
  if (!width || !height) return;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  const context = canvas.getContext('2d');
  if (!context) return;
  context.scale(pixelRatio, pixelRatio);
  const values = points.flatMap(({ bid, ask }) => [bid, ask].flatMap((price) => price === null ? [] : [Number(price)]));
  const low = Math.min(...values);
  const high = Math.max(...values);
  const padding = Math.max((high - low) * 0.14, 0.01);
  const top = 9;
  const bottom = height - 9;
  const x = (time: number) => (time / Math.max(endUs, 1)) * (width - 1) + 0.5;
  const y = (price: number) => bottom - (price - low + padding) / (high - low + padding * 2) * (bottom - top);

  context.strokeStyle = '#e4e3d9';
  context.lineWidth = 1;
  context.beginPath();
  const gridLines = 6;
  for (let i = 0; i <= gridLines; i++) {
    const column = x(i * endUs / gridLines);
    context.moveTo(column, 0);
    context.lineTo(column, height);
  }
  for (let i = 0; i <= 3; i++) {
    const row = Math.floor(top + i * (bottom - top) / 3) + 0.5;
    context.moveTo(0, row);
    context.lineTo(width, row);
  }
  context.stroke();
  const start = x(playheadUs);
  const end = x(Math.min(delayedUs, endUs));
  context.fillStyle = '#f1dcc0';
  context.fillRect(start, 0, Math.max(end - start, 0), height);

  for (const [side, color] of [['ask', '#a25848'], ['bid', '#39766b']] as const) {
    let previous: number | null = null;
    context.strokeStyle = color;
    context.lineWidth = 1.5;
    context.beginPath();
    for (const point of points) {
      const price = point[side];
      const position = x(point.elapsedUs);
      if (previous !== null) context.lineTo(position, previous);
      if (price === null) {
        previous = null;
        continue;
      }
      const target = y(Number(price));
      if (previous === null) context.moveTo(position, target);
      else context.lineTo(position, target);
      previous = target;
    }
    context.stroke();
  }

  for (const [time, color] of [[playheadUs, '#25342c'], [delayedUs, '#a85719']] as const) {
    if (time > endUs) continue;
    const position = x(time);
    context.fillStyle = color;
    context.fillRect(position - 0.75, 0, 1.5, height);
    context.fillRect(Math.max(0, Math.min(position - 3, width - 6)), 0, 6, 4);
  }
}

export function Timeline({ points, endUs, playheadUs, delayedUs, onSeek }: PlotProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const redraw = () => plot(element, points, endUs, playheadUs, delayedUs);
    const observer = new ResizeObserver(redraw);
    observer.observe(element);
    redraw();
    return () => observer.disconnect();
  }, [delayedUs, endUs, playheadUs, points]);

  const marks = [0, 1, 2, 3, 4, 5, 6];
  return (
    <>
      <canvas
        ref={canvas}
        className="timeline-plot"
        role="img"
        aria-label={`Best bid and ask over time. Playhead at ${seconds(playheadUs)}. Delayed order at ${seconds(delayedUs)}.`}
        onPointerDown={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          onSeek(Math.round(endUs * Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))));
        }}
      />
      <input
        className="scrubber"
        type="range"
        min={0}
        max={endUs}
        step={1}
        value={playheadUs}
        aria-label="Replay playhead"
        aria-valuetext={seconds(playheadUs)}
        disabled={endUs === 0}
        onChange={(event) => onSeek(event.currentTarget.valueAsNumber)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          const amount = (event.shiftKey ? 250_000 : 10_000) * (event.key === 'ArrowLeft' ? -1 : 1);
          onSeek(Math.min(endUs, Math.max(0, playheadUs + amount)));
        }}
      />
      <div className="timeline-ticks mono" aria-hidden="true">
        {marks.map((mark) => <span key={mark}>{(endUs / 1_000_000 * mark / 6).toFixed(endUs < 6_000_000 ? 2 : 0)}s</span>)}
      </div>
    </>
  );
}
