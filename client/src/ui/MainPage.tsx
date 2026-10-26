import DjSpike from './DjSpike';

interface Props {
  onLogOut: () => void;
  /** Called while the user is DJing without touching the mouse or keyboard. */
  onActivity: () => void;
}

export function MainPage({ onLogOut, onActivity }: Props) {
  return <DjSpike onLogOut={onLogOut} onActivity={onActivity} />;
}
