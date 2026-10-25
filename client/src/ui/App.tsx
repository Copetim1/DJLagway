import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioEngine } from '../audio/engine';
import type { DeckInfo } from '../audio/deck';
import {
  crossfadeGains,
  DEFAULT_CONTROL_STATE,
  type ControlState,
} from '../control/types';
import { LatencyTracker, type LatencySnapshot } from '../metrics/latency';
import { HandTracker } from '../tracking/handTracker';
import {
  DEFAULT_MAPPING,
  mapHands,
  mergeControl,
  type HandSample,
  type MappingOptions,
} from '../tracking/mapping';
import { DEFAULT_ONE_EURO, OneEuroFilter, type OneEuroOptions } from '../tracking/oneEuro';
import { CameraView } from './CameraView';
import { DeckPanel } from './DeckPanel';
import { LatencyHUD } from './LatencyHUD';
import { ManualControls } from './ManualControls';

const EMPTY_DECK: DeckInfo = {
  name: '',
  duration: 0,
  position: 0,
  playing: false,
  loaded: false,
};

const EMPTY_SNAPSHOT: LatencySnapshot = {
  inferenceMs: 0,
  inferenceP95Ms: 0,
  pipelineMs: 0,
  pipelineP95Ms: 0,
  updateHz: 0,
  outputLatencyMs: 0,
  pipelineMeasurable: false,
};

/** UI refresh rate. Display is decoupled from the control path on purpose. */
const UI_TICK_MS = 50;

export default function App() {
  const engineRef = useRef<AudioEngine | null>(null);
  const trackerRef = useRef<HandTracker | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const latencyRef = useRef(new LatencyTracker());

  /**
   * Authoritative control state lives in a ref, not React state.
   *
   * The gesture path writes here and calls engine.apply() synchronously inside the
   * frame callback. Routing control through setState would put a React render —
   * scheduling, reconciliation, commit — between the camera and the audio graph,
   * which is exactly the latency this spike exists to measure. React only ever
   * reads a throttled copy for display.
   */
  const controlRef = useRef<ControlState>({ ...DEFAULT_CONTROL_STATE });
  const mappingRef = useRef<MappingOptions>({ ...DEFAULT_MAPPING });
  const handsRef = useRef<HandSample[]>([]);
  const gesturesActiveRef = useRef(false);

  // One filter per parameter: they move independently and must not share state.
  const filtersRef = useRef({
    crossfade: new OneEuroFilter(),
    volume: new OneEuroFilter(),
    cutoff: new OneEuroFilter(),
  });

  const [control, setControl] = useState<ControlState>({ ...DEFAULT_CONTROL_STATE });
  const [mapping, setMapping] = useState<MappingOptions>({ ...DEFAULT_MAPPING });
  const [smoothing, setSmoothing] = useState<OneEuroOptions>({ ...DEFAULT_ONE_EURO });
  const [hands, setHands] = useState<HandSample[]>([]);
  const [deckA, setDeckA] = useState<DeckInfo>(EMPTY_DECK);
  const [deckB, setDeckB] = useState<DeckInfo>(EMPTY_DECK);
  const [snapshot, setSnapshot] = useState<LatencySnapshot>(EMPTY_SNAPSHOT);
  const [gesturesActive, setGesturesActive] = useState(false);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [frameLoop, setFrameLoop] = useState<'rvfc' | 'raf'>('raf');

  const engine = (): AudioEngine => {
    if (!engineRef.current) engineRef.current = new AudioEngine();
    return engineRef.current;
  };

  // Keep refs in step with the state the UI edits.
  useEffect(() => {
    mappingRef.current = mapping;
  }, [mapping]);

  useEffect(() => {
    const f = filtersRef.current;
    f.crossfade.setOptions(smoothing);
    f.volume.setOptions(smoothing);
    f.cutoff.setOptions(smoothing);
  }, [smoothing]);

  /** The single point where control reaches audio, from either producer. */
  const pushControl = useCallback((next: ControlState) => {
    controlRef.current = next;
    engineRef.current?.apply(next);
  }, []);

  const onManualControl = useCallback(
    (partial: Partial<ControlState>) => {
      if (gesturesActiveRef.current) return;
      pushControl({ ...controlRef.current, ...partial });
    },
    [pushControl],
  );

  /** Mirrors the audio graph's own math so the meters show real contribution. */
  const gains = crossfadeGains(control.crossfade);

  // Throttled UI sync. Reads refs; never drives audio.
  useEffect(() => {
    const id = window.setInterval(() => {
      setControl({ ...controlRef.current });
      setHands(handsRef.current);
      const e = engineRef.current;
      if (e) {
        setDeckA(e.deckA.info);
        setDeckB(e.deckB.info);
        setSnapshot(latencyRef.current.snapshot(e.outputLatencyMs));
      }
    }, UI_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const startGestures = useCallback(async () => {
    setBusy(true);
    setStatus('Loading hand model…');
    try {
      await engine().resume();

      const tracker = new HandTracker();
      await tracker.init();
      trackerRef.current = tracker;

      setStatus('Requesting camera…');
      const video = videoRef.current;
      if (!video) throw new Error('Video element not mounted');

      await tracker.start(video, ({ hands: detected, captureTime, inferenceMs }) => {
        handsRef.current = detected;
        latencyRef.current.recordInference(inferenceMs);

        const now = performance.now();
        const raw = mapHands(detected, mappingRef.current);
        const f = filtersRef.current;

        // Smooth only what this frame actually observed. Filtering a held-over
        // value would feed the filter its own output and drift.
        const smoothed: Partial<ControlState> = {};
        if (raw.crossfade !== undefined) smoothed.crossfade = f.crossfade.filter(raw.crossfade, now);
        if (raw.volume !== undefined) smoothed.volume = f.volume.filter(raw.volume, now);
        if (raw.cutoff !== undefined) smoothed.cutoff = f.cutoff.filter(raw.cutoff, now);

        pushControl(mergeControl(controlRef.current, smoothed));
        latencyRef.current.recordPipeline(captureTime, performance.now());
      });

      setFrameLoop(tracker.frameLoopKind);
      gesturesActiveRef.current = true;
      setGesturesActive(true);
      setStatus(
        `${tracker.assetsAreLocal ? 'Local assets' : 'CDN assets'} · ${
          tracker.frameLoopKind === 'rvfc'
            ? 'per-frame timing available'
            : 'no per-frame timing on this browser'
        }`,
      );
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : 'Failed to start gestures');
    } finally {
      setBusy(false);
    }
  }, [pushControl]);

  const stopGestures = useCallback(() => {
    trackerRef.current?.close();
    trackerRef.current = null;
    gesturesActiveRef.current = false;
    setGesturesActive(false);
    handsRef.current = [];
    setHands([]);
    const f = filtersRef.current;
    f.crossfade.reset();
    f.volume.reset();
    f.cutoff.reset();
    latencyRef.current.reset();
    setStatus('Gestures stopped. Sliders are live again.');
  }, []);

  const loadTrack = useCallback(async (which: 'A' | 'B', file: File) => {
    const e = engine();
    await e.resume();
    // Re-apply on first load: a fresh graph sits at default gains until told
    // otherwise, which would ignore wherever the crossfader already is.
    e.apply(controlRef.current);
    try {
      await (which === 'A' ? e.deckA : e.deckB).load(file);
      setStatus(`Loaded ${file.name} into deck ${which}`);
    } catch (error) {
      console.error(error);
      setStatus(`Could not decode ${file.name}. Try WAV, MP3, or M4A.`);
    }
  }, []);

  const toggleDeck = useCallback(async (which: 'A' | 'B') => {
    const e = engine();
    await e.resume();
    (which === 'A' ? e.deckA : e.deckB).toggle();
  }, []);

  useEffect(() => {
    return () => {
      trackerRef.current?.close();
      void engineRef.current?.close();
    };
  }, []);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-100">
            DJLagway <span className="font-normal text-slate-500">· gesture → audio spike</span>
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Week 1 feasibility test. No accounts, no uploads, no database — tracks stay on
            your machine.
          </p>
        </div>
        <button
          type="button"
          onClick={gesturesActive ? stopGestures : startGestures}
          disabled={busy}
          className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-stage transition hover:bg-sky-400 disabled:opacity-50"
        >
          {busy ? 'Starting…' : gesturesActive ? 'Stop gestures' : 'Start gestures'}
        </button>
      </header>

      {status && (
        <p className="mb-4 rounded-lg border border-edge bg-panel px-3 py-2 text-xs text-slate-400">
          {status}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="flex flex-col gap-4">
          <CameraView
            videoRef={videoRef}
            hands={hands}
            mirrored={mapping.mirrored}
            active={gesturesActive}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <DeckPanel
              label="A"
              info={deckA}
              gain={gains.a * control.volume}
              onLoad={(file) => void loadTrack('A', file)}
              onToggle={() => void toggleDeck('A')}
            />
            <DeckPanel
              label="B"
              info={deckB}
              gain={gains.b * control.volume}
              onLoad={(file) => void loadTrack('B', file)}
              onToggle={() => void toggleDeck('B')}
            />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <LatencyHUD snapshot={snapshot} frameLoop={frameLoop} />
          <ManualControls
            control={control}
            onControl={onManualControl}
            gesturesActive={gesturesActive}
            mapping={mapping}
            onMapping={(next) => setMapping((prev) => ({ ...prev, ...next }))}
            smoothing={smoothing}
            onSmoothing={(next) => setSmoothing((prev) => ({ ...prev, ...next }))}
          />
        </div>
      </div>
    </main>
  );
}
