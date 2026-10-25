import { useEffect, useRef, type RefObject } from 'react';
import { HandLandmarker } from '@mediapipe/tasks-vision';
import type { HandSample } from '../tracking/mapping';

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>;
  hands: HandSample[];
  /** Must match MappingOptions.mirrored, or the overlay drifts from the video. */
  mirrored: boolean;
  active: boolean;
}

/**
 * Camera preview with a landmark overlay.
 *
 * The overlay is a separate canvas sized to its display box rather than the
 * camera resolution — drawing the skeleton is cosmetic and should not cost
 * inference time or force a large readback.
 */
export function CameraView({ videoRef, hands, mirrored, active }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const { clientWidth: w, clientHeight: h } = canvas;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    ctx.clearRect(0, 0, w, h);
    if (!active) return;

    const px = (x: number) => (mirrored ? 1 - x : x) * w;
    const py = (y: number) => y * h;

    for (const hand of hands) {
      const lm = hand.landmarks;
      const tint = hand.handedness === 'Right' ? '#38bdf8' : '#fb923c';

      ctx.strokeStyle = tint;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (const { start, end } of HandLandmarker.HAND_CONNECTIONS) {
        const a = lm[start];
        const b = lm[end];
        if (!a || !b) continue;
        ctx.moveTo(px(a.x), py(a.y));
        ctx.lineTo(px(b.x), py(b.y));
      }
      ctx.stroke();

      ctx.fillStyle = tint;
      for (const p of lm) {
        ctx.beginPath();
        ctx.arc(px(p.x), py(p.y), 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [hands, mirrored, active]);

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-edge bg-black">
      <video
        ref={videoRef}
        playsInline
        muted
        className="h-full w-full object-cover"
        style={{ transform: mirrored ? 'scaleX(-1)' : undefined }}
      />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {!active && (
        <div className="absolute inset-0 grid place-items-center text-sm text-slate-500">
          Camera off
        </div>
      )}
    </div>
  );
}
