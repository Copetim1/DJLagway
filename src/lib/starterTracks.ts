import prisma from './prisma';

export const STARTER_TRACKS_URL_PATH = '/starter-tracks';

// The starter library every user sees. Files live in <repo>/starter-tracks.
// To add one: drop the MP3 in that folder and add an entry here with a new, fixed id.
// Ids must never change, since mix sessions reference them.
const STARTER_TRACKS = [
  {
    id: 'starter-boom-bap-old-school-hip-hop-beat',
    title: 'Boom Bap Old School Hip-Hop Beat',
    artist: 'Alex Morgan',
    duration: 130,
    file: 'Alex Morgan - Boom Bap Old School Hip-Hop Beat.mp3',
  },
  {
    id: 'starter-phonk-for-video',
    title: 'Phonk for Video',
    artist: 'Lite Saturation',
    duration: 90,
    file: 'Lite Saturation - Phonk for Video.mp3',
  },
  {
    id: 'starter-clarity',
    title: 'Clarity',
    artist: 'Mr Smith',
    album: 'A New Roar',
    duration: 105,
    file: 'Mr Smith - Clarity.mp3',
  },
  {
    id: 'starter-game',
    title: 'Game',
    artist: 'Play House',
    album: 'Songs',
    duration: 188,
    file: 'Play House - Game.mp3',
  },
  {
    id: 'starter-phonk-mix',
    title: 'Phonk Mix',
    artist: 'VibeDepot',
    duration: 157,
    file: 'VibeDepot - Phonk Mix.mp3',
  },
];

// Safe to run on every boot: upserts by fixed id, so restarts never duplicate tracks.
export async function seedStarterTracks() {
  for (const { file, ...track } of STARTER_TRACKS) {
    const data = {
      ...track,
      fileUrl: `${STARTER_TRACKS_URL_PATH}/${encodeURIComponent(file)}`,
      ownerId: null,
    };
    await prisma.track.upsert({ where: { id: track.id }, create: data, update: data });
  }
  console.log(`Starter library ready (${STARTER_TRACKS.length} tracks).`);
}
