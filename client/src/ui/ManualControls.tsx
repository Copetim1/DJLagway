import { cutoffToHz, type ControlState } from '../control/types';
import type { MappingOptions } from '../tracking/mapping';
import type { OneEuroOptions } from '../tracking/oneEuro';

function Slider({
  label,
  value,
  onChange,
  readout,
  disabled,
  min = 0,
  max = 1,
  step = 0.001,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  readout: string;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="block py-1.5">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs text-slate-400">{label}</span>
        <span className="tnum text-xs text-slate-300">{readout}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-sky-400 disabled:opacity-40"
      />
    </label>
  );
}

interface Props {
  control: ControlState;
  onControl: (next: Partial<ControlState>) => void;
  /** Sliders go read-only while gestures drive, so the two cannot fight. */
  gesturesActive: boolean;
  mapping: MappingOptions;
  onMapping: (next: Partial<MappingOptions>) => void;
  smoothing: OneEuroOptions;
  onSmoothing: (next: Partial<OneEuroOptions>) => void;
}

export function ManualControls({
  control,
  onControl,
  gesturesActive,
  mapping,
  onMapping,
  smoothing,
  onSmoothing,
}: Props) {
  return (
    <section className="rounded-xl border border-edge bg-panel p-4">
      <header className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-slate-200">Controls</h2>
        <span className="text-[10px] uppercase tracking-wider text-slate-500">
          {gesturesActive ? 'driven by gestures' : 'manual'}
        </span>
      </header>

      <Slider
        label="Crossfade  A ↔ B"
        value={control.crossfade}
        onChange={(v) => onControl({ crossfade: v })}
        readout={control.crossfade < 0.5 ? `A ${Math.round((1 - control.crossfade) * 100)}%` : `B ${Math.round(control.crossfade * 100)}%`}
        disabled={gesturesActive}
      />
      <Slider
        label="Volume"
        value={control.volume}
        onChange={(v) => onControl({ volume: v })}
        readout={`${Math.round(control.volume * 100)}%`}
        disabled={gesturesActive}
      />
      <Slider
        label="Lowpass cutoff"
        value={control.cutoff}
        onChange={(v) => onControl({ cutoff: v })}
        readout={`${Math.round(cutoffToHz(control.cutoff))} Hz`}
        disabled={gesturesActive}
      />

      <hr className="my-3 border-edge" />

      <h3 className="mb-1 text-xs font-semibold text-slate-300">Tuning</h3>
      <p className="mb-2 text-[11px] leading-relaxed text-slate-500">
        Lower min cutoff steadies a resting hand but adds lag. Raise beta to claw that lag
        back while moving. Find the point where the audio stops trembling but still feels
        immediate, then record it.
      </p>

      <Slider
        label="Smoothing — min cutoff"
        value={smoothing.minCutoff}
        onChange={(v) => onSmoothing({ minCutoff: v })}
        readout={smoothing.minCutoff.toFixed(2)}
        min={0.1}
        max={6}
        step={0.05}
      />
      <Slider
        label="Smoothing — beta"
        value={smoothing.beta}
        onChange={(v) => onSmoothing({ beta: v })}
        readout={smoothing.beta.toFixed(3)}
        min={0}
        max={0.2}
        step={0.001}
      />

      <div className="mt-3 flex flex-col gap-2">
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={mapping.mirrored}
            onChange={(e) => onMapping({ mirrored: e.target.checked })}
            className="accent-sky-400"
          />
          Mirror preview (selfie view)
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={mapping.swapHands}
            onChange={(e) => onMapping({ swapHands: e.target.checked })}
            className="accent-sky-400"
          />
          Swap hand roles
          <span className="text-[10px] text-slate-600">if crossfade feels backwards</span>
        </label>
      </div>
    </section>
  );
}
