import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchStarterTracks, fetchTrackAudio, type StarterTrack } from '../api';
import { AudioEngine } from '../audio/engine';
import type { DeckInfo } from '../audio/deck';
import { DEFAULT_CONTROL_STATE, type ControlState } from '../control/types';
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
import { MixControls /* , TrackingSettings: hidden until next sprint */ } from './ManualControls';

type DeckId = 'A' | 'B';

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

interface Props {
  onLogOut: () => void;
  /** Reports activity that isn't mouse or keyboard: hands in view, music playing. */
  onActivity: () => void;
}

export default function DjSpike({ onLogOut, onActivity }: Props) {
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
  const [mapping /* , setMapping: hidden until next sprint */] = useState<MappingOptions>({ ...DEFAULT_MAPPING });
  const [smoothing /* , setSmoothing: hidden until next sprint */] = useState<OneEuroOptions>({ ...DEFAULT_ONE_EURO });
  const [hands, setHands] = useState<HandSample[]>([]);
  const [deckA, setDeckA] = useState<DeckInfo>(EMPTY_DECK);
  const [deckB, setDeckB] = useState<DeckInfo>(EMPTY_DECK);
  const [snapshot, setSnapshot] = useState<LatencySnapshot>(EMPTY_SNAPSHOT);
  const [gesturesActive, setGesturesActive] = useState(false);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [tracks, setTracks] = useState<StarterTrack[]>([]);
  const [tracksError, setTracksError] = useState(false);
  const [selected, setSelected] = useState<Record<DeckId, string>>({ A: '', B: '' });
  const [loadingDeck, setLoadingDeck] = useState<Record<DeckId, boolean>>({ A: false, B: false });

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
      if (handsRef.current.length > 0 || e?.deckA.info.playing || e?.deckB.info.playing) {
        onActivity();
      }
    }, UI_TICK_MS);
    return () => window.clearInterval(id);
  }, [onActivity]);

  const startGestures = useCallback(async () => {
    setBusy(true);
    setStatus('');
    try {
      await engine().resume();

      const tracker = new HandTracker();
      await tracker.init();
      trackerRef.current = tracker;

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

      gesturesActiveRef.current = true;
      setGesturesActive(true);
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
    setStatus('');
  }, []);

  // Retry until the backend answers, so starting it after the client still works.
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const load = () => {
      fetchStarterTracks()
        .then((list) => {
          if (cancelled) return;
          setTracks(list);
          setTracksError(false);
        })
        .catch(() => {
          if (cancelled) return;
          setTracksError(true);
          timer = window.setTimeout(load, 3000);
        });
    };
    load();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  const loadTrack = useCallback(async (which: DeckId, track: StarterTrack) => {
    const e = engine();
    await e.resume();
    // Re-apply on first load: a fresh graph sits at default gains until told
    // otherwise, which would ignore wherever the crossfader already is.
    e.apply(controlRef.current);
    setSelected((prev) => ({ ...prev, [which]: track.id }));
    setLoadingDeck((prev) => ({ ...prev, [which]: true }));
    try {
      const bytes = await fetchTrackAudio(track);
      await (which === 'A' ? e.deckA : e.deckB).load(bytes, track.title);
      setStatus('');
    } catch (error) {
      console.error(error);
      setStatus(`Could not load ${track.title}.`);
    } finally {
      setLoadingDeck((prev) => ({ ...prev, [which]: false }));
    }
  }, []);

  const toggleDeck = useCallback(async (which: DeckId) => {
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
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">DJLagway</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={gesturesActive ? stopGestures : startGestures}
            disabled={busy}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            {busy ? 'Starting…' : gesturesActive ? 'Stop camera' : 'Start camera'}
          </button>
          <button
            type="button"
            onClick={onLogOut}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100"
          >
            Log out
          </button>
        </div>
      </header>

      {tracksError && (
        <p className="mb-4 text-sm text-red-700">
          Can't reach the backend, so no tracks are available. Start it with{' '}
          <code>npm run dev</code> in the repo root. This page will pick it up automatically.
        </p>
      )}
      {status && <p className="mb-4 text-sm text-neutral-600">{status}</p>}

      <div className="grid gap-6 md:grid-cols-[3fr_2fr]">
        <CameraView
          videoRef={videoRef}
          hands={hands}
          mirrored={mapping.mirrored}
          active={gesturesActive}
        />
        <MixControls control={control} onControl={onManualControl} gesturesActive={gesturesActive} />
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        {(['A', 'B'] as const).map((which) => (
          <DeckPanel
            key={which}
            label={which}
            info={which === 'A' ? deckA : deckB}
            tracks={tracks}
            unavailable={tracksError}
            selectedId={selected[which]}
            loading={loadingDeck[which]}
            onSelect={(track) => void loadTrack(which, track)}
            onToggle={() => void toggleDeck(which)}
          />
        ))}
      </div>

      <p className="mt-6 text-sm text-neutral-500">
        Right hand left/right: crossfade. Left hand up/down: volume. Left thumb-to-index pinch:
        filter.
      </p>

      {/* Hand tracking settings: hidden until next sprint.
      <details className="mt-6 border-t border-neutral-200 pt-4">
        <summary className="cursor-pointer text-sm font-medium">Hand tracking settings</summary>
        <div className="mt-4 max-w-md">
          <TrackingSettings
            mapping={mapping}
            onMapping={(next) => setMapping((prev) => ({ ...prev, ...next }))}
            smoothing={smoothing}
            onSmoothing={(next) => setSmoothing((prev) => ({ ...prev, ...next }))}
          />
        </div>
      </details>
      */}

      <details className="mt-4 border-t border-neutral-200 pt-4">
        <summary className="cursor-pointer text-sm font-medium">Latency</summary>
        <div className="mt-4 max-w-md">
          <LatencyHUD snapshot={snapshot} />
        </div>
      </details>
    </main>
  );
}
