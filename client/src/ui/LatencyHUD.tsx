import { verdictFor, type LatencySnapshot } from '../metrics/latency';

const VERDICT_COPY = {
  go: 'GO: responsive enough to build on',
  tune: 'TUNE: usable, but needs tuning',
  stop: 'STOP: too slow, rethink before building on it',
  unknown: 'Not enough data yet',
} as const;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1 text-sm">
      <span className="text-neutral-500">{label}</span>
      <span className="tnum">{value}</span>
    </div>
  );
}

const ms = (n: number) => `${n.toFixed(1)} ms`;

interface Props {
  snapshot: LatencySnapshot;
}

export function LatencyHUD({ snapshot }: Props) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{VERDICT_COPY[verdictFor(snapshot)]}</p>
      <div className="divide-y divide-neutral-200">
        <Row
          label="Inference (median / p95)"
          value={`${ms(snapshot.inferenceMs)} / ${ms(snapshot.inferenceP95Ms)}`}
        />
        <Row
          label="Camera → audio (median / p95)"
          value={
            snapshot.pipelineMeasurable
              ? `${ms(snapshot.pipelineMs)} / ${ms(snapshot.pipelineP95Ms)}`
              : 'Chrome only'
          }
        />
        <Row label="Update rate" value={`${snapshot.updateHz} Hz`} />
        <Row label="Audio output" value={ms(snapshot.outputLatencyMs)} />
      </div>
      <p className="mt-2 text-sm text-neutral-500">
        Camera and driver delays happen outside the browser, so the real total is a bit higher.
      </p>
    </div>
  );
}
