const SUPPORTED_EFFECTS = ['lowpass', 'highpass', 'echo'] as const;

export function isSupportedEffect(value: unknown): value is (typeof SUPPORTED_EFFECTS)[number] {
  return typeof value === 'string' && SUPPORTED_EFFECTS.some((effect) => effect === value);
}
