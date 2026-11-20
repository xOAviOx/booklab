export type Side = 'buy' | 'sell';

export interface Order {
  playheadUs: number;
  delayUs: number;
  side: Side;
  qty: string;
}

export interface ChartPoint {
  elapsedUs: number;
  bid: string | null;
  ask: string | null;
}

export interface Metadata {
  source: 'synthetic' | 'kraken';
  depth: number;
  frameCount: number;
  endUs: number;
  chart: ChartPoint[];
  updateTimes: number[];
}

export interface Level {
  price: string;
  qty: string;
  taken: string;
}

export interface Scenario {
  atUs: number;
  asks: Level[];
  bids: Level[];
  spread: string | null;
  filled: string;
  unfilled: string;
  notional: string;
  average: string | null;
}

export interface Comparison {
  baseline: Scenario | null;
  delayed: Scenario | null;
  delayedUs: number;
  delta: PriceDelta | null;
  changes: BookChanges | null;
}

export interface PriceDelta { magnitude: string; sign: -1 | 0 | 1 }

export interface DepthChange {
  price: string;
  before: string;
  after: string;
  qtyDelta: string;
}

export interface BookChanges { asks: DepthChange[]; bids: DepthChange[] }

export type SweepKind = 'latency' | 'size';

export interface FillPoint { filled: string; average: string | null }

export interface LatencyPoint { delayUs: number; fill: FillPoint; delta: PriceDelta | null }

export interface SizePoint { qty: string; baseline: FillPoint; delayed: FillPoint | null }

export type Sweep =
  | { kind: 'latency'; validThroughUs: number; points: LatencyPoint[] }
  | { kind: 'size'; baselineDepth: string; delayedDepth: string | null; points: SizePoint[] };

export interface RecordingFile {
  name: string;
  blob: Blob;
}

export type LoadRequest = {
  type: 'load';
  id: number;
  input: { url: string } | RecordingFile;
};

export type CompareRequest = {
  type: 'compare';
  id: number;
  recordingId: number;
  order: Order;
};

export type AnalysisRequest = {
  type: 'analysis';
  id: number;
  recordingId: number;
  kind: SweepKind;
  order: Order;
};

export type Request = LoadRequest | CompareRequest | AnalysisRequest | { type: 'start-capture' | 'stop-capture' };

export interface Loaded {
  type: 'loaded';
  id: number;
  metadata: Metadata;
  file: RecordingFile;
  demo: boolean;
}

export type CaptureStatus = 'idle' | 'connecting' | 'recording';

export type Reply =
  | Loaded
  | { type: 'load-error'; id: number; error: string }
  | { type: 'comparison'; request: CompareRequest; value: Comparison }
  | { type: 'compare-error'; request: CompareRequest; error: string }
  | { type: 'analysis-result'; request: AnalysisRequest; value: Sweep }
  | { type: 'analysis-error'; request: AnalysisRequest; error: string }
  | { type: 'capture-status'; status: CaptureStatus }
  | { type: 'capture-complete'; file?: RecordingFile; message: string };

export const MAX_RECORDING_BYTES = 10 * 1024 * 1024;
