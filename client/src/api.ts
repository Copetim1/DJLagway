// Requests use relative paths; Vite's dev proxy forwards them to the backend
// (see vite.config.ts, which reads VITE_API_URL).

export type Role = 'Beginner' | 'Experienced';

export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string | null;
  duration: number;
  /** Path on the API server, e.g. /starter-tracks/Clarity.mp3 */
  fileUrl: string;
  artworkUrl?: string | null;
  /** null = starter track visible to everyone; otherwise the owner's user id. */
  ownerId?: string | null;
}

/** Kept as an alias so existing deck code (DeckPanel, DjSpike) still compiles. */
export type StarterTrack = Track;

export interface User {
  id: string;
  email: string;
  username: string;
  role: Role;
  createdAt?: string;
}

export interface MixSessionTrack {
  title: string;
  artist: string;
  artworkUrl?: string | null;
}

export interface MixSession {
  id: string;
  trackAId: string;
  trackBId: string;
  trackA: MixSessionTrack | null;
  trackB: MixSessionTrack | null;
  startedAt: string;
  endedAt: string | null;
  effectUsed: string | null;
}

export interface UserSettings {
  userId: string;
  preferredEffect: string;
  gestureSensitivity: number;
  swapHands: boolean;
  mirrored: boolean;
  smoothing: number;
}

const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Pull a human-readable message out of an error response, falling back to the status. */
async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    if (data && typeof data.error === 'string') return data.error;
  } catch {
    // no JSON body
  }
  return `${fallback} (${res.status})`;
}

// ---- Tracks -------------------------------------------------------------

/** The starter library only. Public, no login needed. */
export async function fetchStarterTracks(): Promise<Track[]> {
  const res = await fetch('/tracks/starter');
  if (!res.ok) throw new Error(`GET /tracks/starter failed: ${res.status}`);
  return res.json();
}

/** Starter library + the logged-in user's own uploads. */
export async function fetchTracks(token: string): Promise<Track[]> {
  const res = await fetch('/tracks', { headers: authHeader(token) });
  if (!res.ok) throw new Error(await errorMessage(res, 'Failed to load tracks'));
  return res.json();
}

export async function fetchTrackAudio(track: Track): Promise<ArrayBuffer> {
  const res = await fetch(track.fileUrl);
  if (!res.ok) throw new Error(`Audio download failed: ${res.status}`);
  return res.arrayBuffer();
}

export interface UploadFields {
  title?: string;
  artist?: string;
}

/**
 * Upload a track with progress. fetch() can't report upload progress, so this
 * uses XMLHttpRequest. Backend contract (see note to backend team):
 *   POST /tracks  (multipart/form-data, Bearer auth)
 *     fields: file (required), title, artist
 *     201 -> created Track JSON
 *     400 -> { error } for a rejected/unsupported file
 */
export function uploadTrack(
  token: string,
  file: File,
  fields: UploadFields = {},
  onProgress?: (fraction: number) => void,
): Promise<Track> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    if (fields.title) form.append('title', fields.title);
    if (fields.artist) form.append('artist', fields.artist);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/tracks');
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (onProgress && e.lengthComputable) onProgress(e.loaded / e.total);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error('Upload succeeded but the response was not valid JSON'));
        }
        return;
      }
      let message = `Upload failed (${xhr.status})`;
      try {
        const data = JSON.parse(xhr.responseText);
        if (data && typeof data.error === 'string') message = data.error;
      } catch {
        // keep the status-based message
      }
      reject(new Error(message));
    };

    xhr.onerror = () => reject(new Error('Could not reach the server during upload'));
    xhr.send(form);
  });
}

/** DELETE /tracks/:id (Bearer auth). Backend must reject deleting starter tracks. */
export async function deleteTrack(token: string, id: string): Promise<void> {
  const res = await fetch(`/tracks/${id}`, { method: 'DELETE', headers: authHeader(token) });
  if (!res.ok) throw new Error(await errorMessage(res, 'Failed to delete track'));
}

// ---- Mix sessions -------------------------------------------------------

export async function fetchMixSessions(token: string): Promise<MixSession[]> {
  const res = await fetch('/mix-sessions', { headers: authHeader(token) });
  if (!res.ok) throw new Error(await errorMessage(res, 'Failed to load mix history'));
  return res.json();
}

// ---- Auth / profile -----------------------------------------------------

export async function fetchMe(token: string): Promise<User> {
  const res = await fetch('/auth/me', { headers: authHeader(token) });
  if (!res.ok) throw new Error(await errorMessage(res, 'Failed to load profile'));
  return res.json();
}

/** PATCH /auth/role -> { user, token }. Caller must store the new token. */
export async function switchRole(token: string, role: Role): Promise<{ user: User; token: string }> {
  const res = await fetch('/auth/role', {
    method: 'PATCH',
    headers: { ...authHeader(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, 'Failed to switch role'));
  return res.json();
}

// ---- Settings -----------------------------------------------------------

export async function fetchSettings(token: string): Promise<UserSettings> {
  const res = await fetch('/settings', { headers: authHeader(token) });
  if (!res.ok) throw new Error(await errorMessage(res, 'Failed to load settings'));
  return res.json();
}

export async function updateSettings(
  token: string,
  patch: Partial<Pick<UserSettings, 'preferredEffect' | 'gestureSensitivity' | 'swapHands' | 'mirrored' | 'smoothing'>>,
): Promise<UserSettings> {
  const res = await fetch('/settings', {
    method: 'PUT',
    headers: { ...authHeader(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await errorMessage(res, 'Failed to save settings'));
  return res.json();
}
