import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import type { HandSample, Handedness, Point } from './mapping';

/**
 * MediaPipe lifecycle and the frame loop.
 *
 * Two things here are load-bearing for latency measurement:
 *
 * 1. requestVideoFrameCallback, where available, fires when a camera frame
 *    genuinely arrives rather than when the compositor feels like painting. That
 *    avoids running inference twice on the same frame, and its metadata carries
 *    captureTime — the only clock reference that makes a real camera-to-audio
 *    measurement possible.
 * 2. Where it is unavailable (Firefox, historically), we fall back to rAF and
 *    report captureTime as null, so the HUD can say the number is unavailable
 *    instead of quietly substituting a smaller, flattering one.
 */

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

/** Local copies written by `npm run fetch-assets`, preferred when present. */
const LOCAL_WASM_BASE = '/mediapipe/wasm';
const LOCAL_MODEL_URL = '/mediapipe/hand_landmarker.task';

export interface FrameResult {
  hands: HandSample[];
  /** performance.now()-domain capture time, or null if unmeasurable. */
  captureTime: number | null;
  inferenceMs: number;
}

export type FrameHandler = (result: FrameResult) => void;

interface VideoFrameMetadata {
  captureTime?: number;
  expectedDisplayTime: number;
  mediaTime: number;
  presentationTime: number;
}

type VideoWithRVFC = HTMLVideoElement & {
  requestVideoFrameCallback?: (
    cb: (now: number, metadata: VideoFrameMetadata) => void,
  ) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

async function headOk(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

export class HandTracker {
  private landmarker: HandLandmarker | null = null;
  private video: VideoWithRVFC | null = null;
  private stream: MediaStream | null = null;
  private rafHandle: number | null = null;
  private rvfcHandle: number | null = null;
  private running = false;
  private lastTimestamp = -1;
  private usingRvfc = false;

  /** True once a local vendored model was found and used. */
  assetsAreLocal = false;

  async init(): Promise<void> {
    // Prefer vendored assets so a demo does not depend on the venue's wifi.
    const localModel = await headOk(LOCAL_MODEL_URL);
    this.assetsAreLocal = localModel;

    const fileset = await FilesetResolver.forVisionTasks(
      localModel ? LOCAL_WASM_BASE : WASM_BASE,
    );

    this.landmarker = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: localModel ? LOCAL_MODEL_URL : MODEL_URL,
        // GPU is substantially faster; CPU is the safety net on machines where
        // WebGL init fails.
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    }).catch(async (gpuError: unknown) => {
      console.warn('GPU delegate failed, falling back to CPU', gpuError);
      const cpuFileset = await FilesetResolver.forVisionTasks(
        localModel ? LOCAL_WASM_BASE : WASM_BASE,
      );
      return HandLandmarker.createFromOptions(cpuFileset, {
        baseOptions: {
          modelAssetPath: localModel ? LOCAL_MODEL_URL : MODEL_URL,
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
      });
    });
  }

  async start(video: VideoWithRVFC, onFrame: FrameHandler): Promise<void> {
    if (!this.landmarker) throw new Error('HandTracker.init() must run before start()');

    // 640x480 on purpose: inference cost scales with pixels, and coarse hand
    // position does not get more accurate at 1080p.
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: false,
    });

    video.srcObject = this.stream;
    await video.play();

    this.video = video;
    this.running = true;
    this.usingRvfc = typeof video.requestVideoFrameCallback === 'function';

    if (this.usingRvfc) this.loopRvfc(onFrame);
    else this.loopRaf(onFrame);
  }

  get frameLoopKind(): 'rvfc' | 'raf' {
    return this.usingRvfc ? 'rvfc' : 'raf';
  }

  private loopRvfc(onFrame: FrameHandler): void {
    const video = this.video;
    if (!video?.requestVideoFrameCallback) return;

    const step = (now: number, metadata: VideoFrameMetadata) => {
      if (!this.running) return;
      // captureTime is optional even where rVFC exists; absent means we cannot
      // claim an end-to-end number.
      this.detect(video, now, metadata.captureTime ?? null, onFrame);
      this.rvfcHandle = video.requestVideoFrameCallback!(step);
    };

    this.rvfcHandle = video.requestVideoFrameCallback(step);
  }

  private loopRaf(onFrame: FrameHandler): void {
    const step = () => {
      if (!this.running || !this.video) return;
      this.detect(this.video, performance.now(), null, onFrame);
      this.rafHandle = requestAnimationFrame(step);
    };
    this.rafHandle = requestAnimationFrame(step);
  }

  private detect(
    video: HTMLVideoElement,
    now: number,
    captureTime: number | null,
    onFrame: FrameHandler,
  ): void {
    if (!this.landmarker || video.readyState < 2) return;

    // detectForVideo rejects non-monotonic timestamps; rAF and rVFC can
    // occasionally hand us the same millisecond twice.
    const timestamp = now <= this.lastTimestamp ? this.lastTimestamp + 1 : now;
    this.lastTimestamp = timestamp;

    const startedAt = performance.now();
    let result;
    try {
      result = this.landmarker.detectForVideo(video, timestamp);
    } catch (error) {
      console.warn('detectForVideo failed for one frame', error);
      return;
    }
    const inferenceMs = performance.now() - startedAt;

    const hands: HandSample[] = result.landmarks.map((landmarks, i) => ({
      landmarks: landmarks as Point[],
      handedness: (result.handedness[i]?.[0]?.categoryName as Handedness) ?? 'Right',
    }));

    onFrame({ hands, captureTime, inferenceMs });
  }

  stop(): void {
    this.running = false;

    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
    if (this.rvfcHandle !== null && this.video?.cancelVideoFrameCallback) {
      this.video.cancelVideoFrameCallback(this.rvfcHandle);
      this.rvfcHandle = null;
    }

    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;

    if (this.video) {
      this.video.srcObject = null;
      this.video = null;
    }
  }

  close(): void {
    this.stop();
    this.landmarker?.close();
    this.landmarker = null;
  }
}
