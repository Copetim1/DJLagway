// Requests use relative paths; Vite's dev proxy forwards them to the backend
// (see vite.config.ts, which reads VITE_API_URL).

export interface StarterTrack {
  id: string;
  title: string;
  artist: string;
  duration: number;
  /** Path on the API server, e.g. /starter-tracks/Clarity.mp3 */
  fileUrl: string;
}

export async function fetchStarterTracks(): Promise<StarterTrack[]> {
  const res = await fetch('/tracks/starter');
  if (!res.ok) throw new Error(`GET /tracks/starter failed: ${res.status}`);
  return res.json();
}

export async function fetchTrackAudio(track: StarterTrack): Promise<ArrayBuffer> {
  const res = await fetch(track.fileUrl);
  if (!res.ok) throw new Error(`Audio download failed: ${res.status}`);
  return res.arrayBuffer();
}
