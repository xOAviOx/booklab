import type { PriceDelta } from './protocol';

export function grouped(value: string, minimumPlaces = 0): string {
  const [whole, fraction = ''] = value.split('.');
  const digits = fraction.padEnd(minimumPlaces, '0');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${digits ? `.${digits}` : ''}`;
}

export function seconds(microseconds: number): string {
  const fraction = microseconds % 1_000_000;
  const whole = (microseconds - fraction) / 1_000_000;
  const digits = String(fraction).padStart(6, '0').replace(/0{1,3}$/, '');
  return `${whole}.${digits} s`;
}

export function milliseconds(microseconds: number): string {
  return grouped(String(microseconds / 1000));
}

export function priceDelta(delta: PriceDelta | null | undefined): string {
  if (!delta) return '—';
  const sign = delta.sign === 1 ? '+' : delta.sign === -1 ? '−' : '';
  return delta.sign !== 0 && delta.magnitude === '0.00'
    ? `${sign}< $0.01` : `${sign}$${grouped(delta.magnitude, 2)}`;
}
