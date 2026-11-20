import { useCallback, useEffect, useRef, useState } from 'react';
import { type AnalysisRequest, type CaptureStatus, type CompareRequest, type Comparison, type Loaded, type Order, type RecordingFile, type Reply, type Request, type SweepKind } from './protocol';
import { saveRecording, savedRecordings, type SavedRecording } from './recordings';

type Result = { request: CompareRequest; value: Comparison };

export function useReplay() {
  const worker = useRef<Worker | null>(null);
  const sequence = useRef(0);
  const latestLoad = useRef(0);
  const latestQuery = useRef(0);
  const latestAnalysis = useRef(0);
  const queryInFlight = useRef(false);
  const queuedQuery = useRef<CompareRequest | null>(null);
  const queuedAnalysis = useRef<AnalysisRequest | null>(null);
  const saveOnLoad = useRef(false);
  const [recording, setRecording] = useState<Loaded | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [analysis, setAnalysis] = useState<Extract<Reply, { type: 'analysis-result' | 'analysis-error' }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [capture, setCapture] = useState<CaptureStatus>('idle');
  const [library, setLibrary] = useState<SavedRecording[]>([]);

  const post = useCallback((message: Request) => worker.current?.postMessage(message), []);
  const load = useCallback((input: { url: string } | RecordingFile, save = false) => {
    latestLoad.current = ++sequence.current;
    saveOnLoad.current = save;
    setLoading(true);
    setError(null);
    setNotice(null);
    post({ type: 'load', id: latestLoad.current, input });
  }, [post]);

  const openDemo = useCallback(() => {
    load({ url: new URL('recordings/synthetic.ndjson', document.baseURI).href });
  }, [load]);

  const flushQuery = useCallback(() => {
    const next = queuedQuery.current ?? queuedAnalysis.current;
    if (queryInFlight.current || !next) return;
    if (next.type === 'compare') queuedQuery.current = null;
    else queuedAnalysis.current = null;
    queryInFlight.current = true;
    post(next);
  }, [post]);

  const compare = useCallback((recordingId: number, order: Order | null) => {
    const id = ++sequence.current;
    latestQuery.current = id;
    queuedQuery.current = order ? { type: 'compare', id, recordingId, order } : null;
    flushQuery();
  }, [flushQuery]);

  const analyze = useCallback((recordingId: number, kind: SweepKind | null, order: Order | null) => {
    const id = ++sequence.current;
    latestAnalysis.current = id;
    queuedAnalysis.current = kind && order ? { type: 'analysis', id, recordingId, kind, order } : null;
    flushQuery();
  }, [flushQuery]);

  useEffect(() => {
    const instance = new Worker(new URL('./worker/replay.worker.ts', import.meta.url), { type: 'module' });
    worker.current = instance;
    let mounted = true;
    instance.onmessage = ({ data }: MessageEvent<Reply>) => {
      switch (data.type) {
        case 'loaded':
          if (data.id !== latestLoad.current) break;
          latestQuery.current = ++sequence.current;
          latestAnalysis.current = sequence.current;
          queuedQuery.current = null;
          queuedAnalysis.current = null;
          setRecording(data);
          setResult(null);
          setAnalysis(null);
          setLoading(false);
          setError(null);
          if (saveOnLoad.current) {
            void saveRecording(data.file).then((saved) => {
              if (mounted) setLibrary((files) => [saved, ...files]);
            }).catch(() => {
              if (mounted) setNotice('Local storage could not save this recording. Export it to keep a copy.');
            });
          }
          break;
        case 'load-error':
          if (data.id !== latestLoad.current) break;
          setLoading(false);
          setError(data.error);
          break;
        case 'comparison':
        case 'compare-error':
          queryInFlight.current = false;
          if (data.request.id === latestQuery.current) {
            if (data.type === 'comparison') setResult(data);
            else {
              setResult(null);
              setNotice(data.error);
            }
          }
          flushQuery();
          break;
        case 'analysis-result':
        case 'analysis-error':
          queryInFlight.current = false;
          if (data.request.id === latestAnalysis.current) setAnalysis(data);
          flushQuery();
          break;
        case 'capture-status':
          setCapture(data.status);
          break;
        case 'capture-complete':
          if (data.file) load(data.file, true);
          setNotice(data.file ? `${data.message} Verified frames are available in this recording.` : data.message);
          break;
      }
    };
    instance.onerror = () => {
      setLoading(false);
      setError('The replay worker could not start. Reload the page to retry.');
    };
    void savedRecordings().then((files) => {
      if (mounted) setLibrary((current) => [...current, ...files.filter(({ id }) => !current.some((entry) => entry.id === id))]);
    }).catch(() => {
      if (mounted) setNotice('The local recording library is unavailable. You can still import and export files.');
    });
    openDemo();
    return () => {
      mounted = false;
      instance.terminate();
      worker.current = null;
      queryInFlight.current = false;
      queuedQuery.current = null;
      queuedAnalysis.current = null;
    };
  }, [flushQuery, load, openDemo]);

  function toggleCapture() {
    if (capture === 'idle') {
      setNotice(null);
      setCapture('connecting');
      post({ type: 'start-capture' });
    } else {
      post({ type: 'stop-capture' });
    }
  }

  return { recording, result, analysis, loading, error, notice, capture, library, compare, analyze, load, openDemo, toggleCapture };
}
