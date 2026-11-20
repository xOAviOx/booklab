import type { Order } from './protocol';

export const MAX_DELAY_US = 1_000_000;

export function qtyError(value: string): string | null {
  if (!/^\d+(\.\d{1,8})?$/.test(value) || !/[1-9]/.test(value)) return 'Enter a positive BTC amount with up to 8 decimal places.';
  const [whole, fraction = ''] = value.split('.');
  const significantWhole = whole.replace(/^0+/, '');
  if (significantWhole.length > 12 || BigInt(significantWhole + fraction.padEnd(8, '0')) > (1n << 64n) - 1n) {
    return 'Quantity is out of range.';
  }
  return null;
}

export function parseDelay(value: string): number | null {
  if (!/^\d+(\.\d{1,3})?$/.test(value)) return null;
  const us = Math.round(Number(value) * 1000);
  return us <= MAX_DELAY_US ? us : null;
}

export function updateNeighbors(times: number[], playhead: number) {
  let low = 0;
  let high = times.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (times[middle] < playhead) low = middle + 1;
    else high = middle;
  }
  return { previous: times[low - 1], next: times[times[low] === playhead ? low + 1 : low] };
}

export function readDemoLink(endUs: number): Order | null {
  const query = new URLSearchParams(window.location.hash.slice(1));
  if (query.get('demo') !== '1') return null;
  const time = query.get('t') ?? '';
  const delay = query.get('d') ?? '';
  const side = query.get('side');
  const qty = query.get('qty') ?? '';
  if (!/^\d+$/.test(time) || !/^\d+$/.test(delay) || qty.length > 30 || qtyError(qty) || (side !== 'buy' && side !== 'sell')) return null;
  const playheadUs = Number(time);
  const delayUs = Number(delay);
  if (playheadUs > endUs || delayUs > MAX_DELAY_US) return null;
  return { playheadUs, delayUs, side, qty };
}

export function makeDemoLink({ playheadUs, delayUs, side, qty }: Order): string {
  const url = new URL(window.location.href);
  url.hash = new URLSearchParams({ demo: '1', t: String(playheadUs), d: String(delayUs), side, qty }).toString();
  return url.href;
}
