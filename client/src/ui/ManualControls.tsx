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
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span>{label}</span>
        <span className="tnum text-neutral-500">{readout}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-neutral-900 disabled:opacity-40"
      />
    </label>
  );
}

interface MixProps {
  control: ControlState;
  onControl: (next: Partial<ControlState>) => void;
  /** Sliders go read-only while gestures drive, so the two cannot fight. */
  gesturesActive: boolean;
}

export function MixControls({ control, onControl, gesturesActive }: MixProps) {
  return (
    <section className="flex flex-col gap-4 self-start rounded-lg border border-neutral-200 p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-medium">Mix</h2>
        <span className="text-sm text-neutral-500">
          {gesturesActive ? 'Controlled by your hands' : 'Manual'}
        </span>
      </div>

      <Slider
        label="Crossfade (A ↔ B)"
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
        label="Filter"
        value={control.cutoff}
        onChange={(v) => onControl({ cutoff: v })}
        readout={`${Math.round(cutoffToHz(control.cutoff))} Hz`}
        disabled={gesturesActive}
      />
    </section>
  );
}

interface SettingsProps {
  mapping: MappingOptions;
  onMapping: (next: Partial<MappingOptions>) => void;
  smoothing: OneEuroOptions;
  onSmoothing: (next: Partial<OneEuroOptions>) => void;
}

export function TrackingSettings({ mapping, onMapping, smoothing, onSmoothing }: SettingsProps) {
  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={mapping.mirrored}
          onChange={(e) => onMapping({ mirrored: e.target.checked })}
          className="accent-neutral-900"
        />
        Mirror camera
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={mapping.swapHands}
          onChange={(e) => onMapping({ swapHands: e.target.checked })}
          className="accent-neutral-900"
        />
        Swap hands (if the crossfade moves the wrong way)
      </label>

      <Slider
        label="Smoothing: min cutoff"
        value={smoothing.minCutoff}
        onChange={(v) => onSmoothing({ minCutoff: v })}
        readout={smoothing.minCutoff.toFixed(2)}
        min={0.1}
        max={6}
        step={0.05}
      />
      <Slider
        label="Smoothing: beta"
        value={smoothing.beta}
        onChange={(v) => onSmoothing({ beta: v })}
        readout={smoothing.beta.toFixed(3)}
        min={0}
        max={0.2}
        step={0.001}
      />
      <p className="text-sm text-neutral-500">
        Lower min cutoff steadies a still hand but adds lag. Higher beta makes fast movement
        more responsive.
      </p>
    </div>
  );
}
