import DjSpike from './DjSpike';

/**
 * Legacy wrapper. Routing now sends /mix straight to <DjSpike />; this is kept
 * only so any stray imports keep compiling. Safe to delete once nothing uses it.
 */
export function MainPage() {
  return <DjSpike />;
}
