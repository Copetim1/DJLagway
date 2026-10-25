import { verdictFor, type LatencySnapshot } from '../metrics/latency';

const VERDICT_COPY = {
  go: { label: 'GO', tone: '#4ade80', note: 'Responsive enough to build on.' },
  tune: { label: 'TUNE', tone: '#facc15', note: 'Usable, but budget tuning time.' },
  stop: { label: 'STOP', tone: '#f87171', note: 'Rethink before committing the schedule.' },
  unknown: { label: '—', tone: '#64748b', note: 'Not enough data yet.' },
} as const;

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-xs text-slate-400">
        {label}
        {hint && <span className="ml-1 text-[10px] text-slate-600">{hint}</span>}
      </span>
      <span className="tnum text-sm text-slate-100">{value}</span>
    </div>
  );
}

const ms = (n: number) => `${n.toFixed(1)} ms`;

interface Props {
  snapshot: LatencySnapshot;
  frameLoop: 'rvfc' | 'raf';
}

export function LatencyHUD({ snapshot, frameLoop }: Props) {
  const verdict = VERDICT_COPY[verdictFor(snapshot)];

  return (
    <section className="rounded-xl border border-edge bg-panel p-4">
      <header className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-slate-200">Latency</h2>
        <span
          className="rounded px-2 py-0.5 text-xs font-bold"
          style={{ background: `${verdict.tone}22`, color: verdict.tone }}
        >
          {verdict.label}
        </span>
      </header>

      <div className="divide-y divide-edge">
        <Row label="Inference" value={ms(snapshot.inferenceMs)} hint="median" />
        <Row label="Inference" value={ms(snapshot.inferenceP95Ms)} hint="p95" />
        {snapshot.pipelineMeasurable ? (
          <>
            <Row label="Camera → audio" value={ms(snapshot.pipelineMs)} hint="median" />
            <Row label="Camera → audio" value={ms(snapshot.pipelineP95Ms)} hint="p95" />
          </>
        ) : (
          <Row label="Camera → audio" value="unavailable" hint={frameLoop} />
        )}
        <Row label="Update rate" value={`${snapshot.updateHz} Hz`} />
        <Row label="Audio output" value={ms(snapshot.outputLatencyMs)} hint="reported" />
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        {verdict.note}
        {!snapshot.pipelineMeasurable && (
          <>
            {' '}
            This browser does not expose per-frame <code>captureTime</code>, so end-to-end
            timing cannot be measured here. Use Chrome for the real number.
          </>
        )}
      </p>

      <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
        These are the measurable segments only. Camera exposure and driver buffering sit
        outside the browser's reach, so true glass-to-ear latency is higher than any single
        figure above.
      </p>
    </section>
  );
}
