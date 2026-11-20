import { useEffect, useRef } from 'react';

export interface Trace { color: string; values: (number | null)[] }

export interface Track {
  title: string;
  traces: Trace[];
  startAtZero?: boolean;
  symmetric?: boolean;
  format: (value: number) => string;
}

interface PlotProps {
  domain: number;
  positions: number[];
  tracks: Track[];
  selection: number;
  validThrough?: number;
  xLabel: (x: number) => string;
  description: string;
  select: (x: number) => void;
}

function plotBounds(width: number) {
  return { left: width < 480 ? 64 : 83, right: width - (width < 480 ? 28 : 39) };
}

function draw(canvas: HTMLCanvasElement, { domain, positions, tracks, selection, validThrough, xLabel }: PlotProps) {
  const { width, height } = canvas.getBoundingClientRect();
  if (!width || !height) return;
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(scale, scale);
  const { left, right } = plotBounds(width);
  const x = (value: number) => left + value / domain * (right - left);
  const tickCount = width < 480 ? 4 : 8;
  const trackHeight = (height - 27) / tracks.length;
  const step = validThrough !== undefined;
  ctx.font = '10px "IBM Plex Mono", monospace';
  ctx.lineWidth = 1;

  for (const [index, track] of tracks.entries()) {
    const top = index * trackHeight + 21;
    const bottom = (index + 1) * trackHeight - 3;
    let lo = Infinity;
    let hi = -Infinity;
    for (const trace of track.traces) {
      for (const value of trace.values) {
        if (value === null) continue;
        lo = Math.min(lo, value);
        hi = Math.max(hi, value);
      }
    }
    if (track.symmetric) {
      hi = Math.max(Math.abs(lo === Infinity ? 0 : lo), hi, 0.01);
      lo = -hi;
    } else if (track.startAtZero) {
      lo = 0;
      hi = Math.max(hi, 0.00000001);
    } else if (lo === hi || lo === Infinity) {
      const center = lo === Infinity ? 0 : lo;
      lo = center - 0.01;
      hi = center + 0.01;
    }
    const y = (value: number) => bottom - (value - lo) / (hi - lo) * (bottom - top);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#364237';
    ctx.fillText(track.title, left, top - 8);
    if (step && validThrough < domain) {
      ctx.fillStyle = '#f3ebda';
      ctx.fillRect(x(validThrough), top, right - x(validThrough), bottom - top);
    }

    ctx.strokeStyle = '#dfded1';
    ctx.beginPath();
    for (let i = 0; i <= tickCount; i++) {
      const column = x(i * domain / tickCount);
      ctx.moveTo(column, top);
      ctx.lineTo(column, bottom);
    }
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.fillStyle = '#596158';
    for (const fraction of [0, 0.5, 1]) {
      const price = lo + (hi - lo) * fraction;
      const row = y(price);
      ctx.strokeStyle = track.symmetric && fraction === 0.5 ? '#aaa899' : '#dfded1';
      ctx.beginPath();
      ctx.moveTo(left, row);
      ctx.lineTo(right, row);
      ctx.stroke();
      ctx.fillText(track.format(price), left - 7, row + 3, left - 10);
    }

    if (lo !== Infinity) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(left - 1, top - 1, right - left + 2, bottom - top + 2);
      ctx.clip();
      for (const trace of track.traces) {
        let prior: number | null = null;
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = trace.color;
        ctx.beginPath();
        for (const [i, value] of trace.values.entries()) {
          const at = x(positions[i]);
          if (step && prior !== null) ctx.lineTo(at, y(prior));
          if (value !== null) {
            if (prior === null) ctx.moveTo(at, y(value));
            else ctx.lineTo(at, y(value));
          }
          prior = value;
        }
        if (step && prior !== null) ctx.lineTo(x(validThrough), y(prior));
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.strokeStyle = '#a26422';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 2]);
    ctx.beginPath();
    ctx.moveTo(x(selection), top);
    ctx.lineTo(x(selection), bottom);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = '#596158';
  for (let i = 0; i <= tickCount; i++) {
    const value = i * domain / tickCount;
    ctx.fillText(xLabel(value), x(value), height - 9);
  }
}

export function SweepPlot(props: PlotProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const redraw = () => draw(element, props);
    const observer = new ResizeObserver(redraw);
    observer.observe(element);
    redraw();
    return () => observer.disconnect();
  }, [props]);

  return (
    <canvas ref={canvas} className="sweep-plot" role="img" aria-label={props.description} onClick={(event) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      const { left, right } = plotBounds(bounds.width);
      const fraction = (event.clientX - bounds.left - left) / (right - left);
      props.select(props.domain * Math.min(1, Math.max(fraction, 0)));
    }} />
  );
}
