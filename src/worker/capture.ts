import { Replay } from '../../crates/replay-core/pkg/replay_core.js';
import { MAX_RECORDING_BYTES, type Reply } from '../protocol';

const CAPTURE_MS = 60_000;
const SNAPSHOT_TIMEOUT_MS = 10_000;

export function startCapture(reply: (message: Reply) => void, onClose: () => void): () => void {
  const socket = new WebSocket('wss://ws.kraken.com/v2');
  const engine = Replay.start_capture();
  const header = `${JSON.stringify({ version: 1, source: 'kraken', symbol: 'BTC/USD', depth: 25 })}\n`;
  const lines = [header];
  const encoder = new TextEncoder();
  let bytes = header.length;
  let origin: number | null = null;
  let done = false;
  let timer = setTimeout(() => finish('Kraken did not send a snapshot in time.'), SNAPSHOT_TIMEOUT_MS);

  function finish(message: string) {
    if (done) return;
    done = true;
    clearTimeout(timer);
    socket.close();
    engine.free();
    onClose();
    reply({ type: 'capture-status', status: 'idle' });
    if (lines.length === 1) {
      reply({ type: 'capture-complete', message });
      return;
    }
    const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const file = { name: `Kraken BTC-USD ${stamp}`, blob: new Blob(lines, { type: 'application/x-ndjson' }) };
    reply({ type: 'capture-complete', file, message });
  }

  socket.addEventListener('open', () => {
    if (done) return;
    socket.send(JSON.stringify({
      method: 'subscribe',
      params: { channel: 'book', symbol: ['BTC/USD'], depth: 25, snapshot: true },
    }));
  });

  socket.addEventListener('message', ({ data }) => {
    const receivedAt = performance.now();
    if (done) return;
    try {
      if (typeof data !== 'string') throw new Error('Expected a text WebSocket frame');
      const frame = JSON.parse(data) as { channel?: string; method?: string; success?: boolean; error?: string };
      if (frame.method === 'subscribe' && frame.success === false) throw new Error(frame.error ?? 'Kraken rejected the subscription');
      if (frame.channel !== 'book') return;

      const elapsed = receivedAt - (origin ?? receivedAt);
      if (elapsed > CAPTURE_MS) return finish('Recording reached 60 seconds.');
      const elapsedUs = Math.floor(elapsed * 1000);
      const line = `${JSON.stringify({ elapsed_us: elapsedUs, frame: data })}\n`;
      bytes += encoder.encode(line).length;
      if (bytes > MAX_RECORDING_BYTES) return finish('Recording reached the 10 MiB limit.');
      engine.append_frame(BigInt(elapsedUs), data);
      lines.push(line);
      if (origin === null) {
        origin = receivedAt;
        clearTimeout(timer);
        timer = setTimeout(() => finish('Recording reached 60 seconds.'), CAPTURE_MS);
        reply({ type: 'capture-status', status: 'recording' });
      }
    } catch (error) {
      finish(`Capture stopped: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  socket.addEventListener('close', () => finish('Kraken connection closed.'));
  socket.addEventListener('error', () => finish('Could not connect to the Kraken feed.'));
  return () => finish(origin === null ? 'Recording canceled.' : 'Recording stopped.');
}
