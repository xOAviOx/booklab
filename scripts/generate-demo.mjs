import { mkdirSync, writeFileSync } from 'node:fs';
import { crc32 } from 'node:zlib';

let seed = 7921;
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
}

const depth = 25;
const duration = 12_000;
const times = new Set([0, 4000, 4250, duration]);
for (let time = 0; time < duration; time += 55 + Math.floor(random() * 150)) times.add(time);

function makeLevels(start, direction, time, side) {
  return Array.from({ length: depth }, (_, i) => {
    const price = (start + direction * i * 2).toFixed(2);
    const qty = side === 'asks' && i < 2 && time >= 4000 && time < 4360
      ? ['0.25000000', '0.50000000'][i]
      : (0.14 + (i % 5) * 0.12 + random() * 0.62).toFixed(8);
    return { price, qty };
  });
}

function changes(previous, next) {
  const active = new Set(next.map(({ price }) => price));
  return [...previous.filter(({ price }) => !active.has(price)).map(({ price }) => ({ price, qty: '0' })), ...next];
}

function digits(value) {
  return value.replace('.', '').replace(/^0+/, '');
}

let previous = { asks: [], bids: [] };
const lines = [JSON.stringify({ version: 1, source: 'synthetic', symbol: 'BTC/USD', depth })];
for (const time of [...times].sort((a, b) => a - b)) {
  const noise = Math.floor(random() * 3) - 1;
  const wave = Math.round(3 * Math.sin(time / 680) + 2 * Math.sin(time / 230) + time / 1420 + noise);
  const ask = time >= 4000 && time < 4360 ? (time < 4250 ? 100_000 : 100_004) : 99_997 + wave;
  const next = {
    asks: makeLevels(ask, 1, time, 'asks'),
    bids: makeLevels(ask - (2 + Math.floor(random() * 2)), -1, time, 'bids'),
  };
  const input = [...next.asks.slice(0, 10), ...next.bids.slice(0, 10)]
    .map(({ price, qty }) => digits(price) + digits(qty)).join('');
  const frame = JSON.stringify({
    channel: 'book',
    type: time === 0 ? 'snapshot' : 'update',
    data: [{ symbol: 'BTC/USD', asks: changes(previous.asks, next.asks), bids: changes(previous.bids, next.bids), checksum: crc32(input) }],
  });
  lines.push(JSON.stringify({ elapsed_us: time * 1000, frame }));
  previous = next;
}

const output = new URL('../public/recordings/', import.meta.url);
mkdirSync(output, { recursive: true });
writeFileSync(new URL('synthetic.ndjson', output), `${lines.join('\n')}\n`);
