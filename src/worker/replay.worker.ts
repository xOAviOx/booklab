import init, { Replay } from '../../crates/replay-core/pkg/replay_core.js';
import wasmUrl from '../../crates/replay-core/pkg/replay_core_bg.wasm?url';
import { MAX_RECORDING_BYTES, type Comparison, type LoadRequest, type Metadata, type Reply, type Request, type Sweep } from '../protocol';
import { startCapture } from './capture';

const worker = self as DedicatedWorkerGlobalScope;
const reply = (message: Reply) => worker.postMessage(message);
let initialized: ReturnType<typeof init> | undefined;
function initialize() {
  initialized ??= init({ module_or_path: wasmUrl }).catch((error: unknown) => {
    initialized = undefined;
    throw error;
  });
  return initialized;
}

let active: { id: number; replay: Replay } | undefined;
let demo: { url: string; file: { name: string; blob: Blob } } | undefined;
let newestLoad = 0;
let stopCapture: (() => void) | undefined;
let captureRequested = false;
let captureAttempt = 0;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function load(request: LoadRequest) {
  newestLoad = request.id;
  try {
    await initialize();
    let file;
    if ('url' in request.input) {
      const url = request.input.url;
      if (demo?.url === url) file = demo.file;
      else {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Demo could not be loaded (${response.status})`);
        file = { name: 'Synthetic session', blob: await response.blob() };
        demo = { url, file };
      }
    } else {
      file = request.input;
    }
    if (file.blob.size > MAX_RECORDING_BYTES) throw new Error('Recording exceeds 10 MiB');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.blob.arrayBuffer());
    if (request.id !== newestLoad) return;
    const next = Replay.load(text);
    let metadata: Metadata;
    try {
      metadata = JSON.parse(next.metadata()) as Metadata;
    } catch (error) {
      next.free();
      throw error;
    }
    active?.replay.free();
    active = { id: request.id, replay: next };
    reply({ type: 'loaded', id: request.id, metadata, file, demo: 'url' in request.input });
  } catch (error) {
    if (request.id === newestLoad) reply({ type: 'load-error', id: request.id, error: errorMessage(error) });
  }
}

worker.onmessage = async ({ data: request }: MessageEvent<Request>) => {
  switch (request.type) {
    case 'load':
      await load(request);
      break;
    case 'compare':
      try {
        if (active?.id !== request.recordingId) throw new Error('Recording selection changed');
        const input = JSON.stringify(request.order);
        reply({ type: 'comparison', request, value: JSON.parse(active.replay.compare(input)) as Comparison });
      } catch (error) {
        reply({ type: 'compare-error', request, error: errorMessage(error) });
      }
      break;
    case 'analysis':
      try {
        if (active?.id !== request.recordingId) throw new Error('Recording selection changed');
        const { kind, order } = request;
        const metrics = JSON.parse(active.replay.analyze(JSON.stringify({ kind, order })));
        reply({ type: 'analysis-result', request, value: { ...metrics, kind } as Sweep });
      } catch (error) {
        reply({ type: 'analysis-error', request, error: errorMessage(error) });
      }
      break;
    case 'start-capture':
      if (captureRequested) break;
      const attempt = ++captureAttempt;
      captureRequested = true;
      reply({ type: 'capture-status', status: 'connecting' });
      try {
        await initialize();
        if (!captureRequested || attempt !== captureAttempt) break;
        stopCapture = startCapture(reply, () => {
          captureRequested = false;
          stopCapture = undefined;
        });
      } catch (error) {
        if (!captureRequested || attempt !== captureAttempt) break;
        captureRequested = false;
        reply({ type: 'capture-status', status: 'idle' });
        reply({ type: 'capture-complete', message: errorMessage(error) });
      }
      break;
    case 'stop-capture':
      captureRequested = false;
      if (stopCapture) stopCapture();
      else reply({ type: 'capture-status', status: 'idle' });
      break;
  }
};
