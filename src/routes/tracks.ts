import{ Router, Response } from 'express';
import path from 'path';
import prisma from '../lib/prisma';
import{ requireAuth, AuthenticatedRequest } from '../middleware/auth';
import{ readAudioMetadata, AudioMetadata } from '../lib/audioMeta';
import{
  receiveAudioUpload,
  removeFile,
  uploadedFilePath,
  UPLOADS_URL_PATH,
} from '../lib/uploads';

const router = Router();

// GET /tracks/starter - public: the starter library, no login needed
router.get('/starter', async (_req, res: Response) =>{
  try{
    const tracks = await prisma.track.findMany({
      where:{ ownerId: null },
      orderBy:{ title: 'asc' },
    });

    return res.status(200).json(tracks);
  } catch (error){
    return res.status(500).json({ error: 'Failed to fetch starter tracks' });
  }
});

// GET /tracks - returns the starter library + the logged-in user's uploads
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) =>{
  try{
    const userId = req.user!.userId;

    const tracks = await prisma.track.findMany({
      where:{
        OR: [
         { ownerId: userId },       // User's own uploads
         { ownerId: null },         // Starter library
        ],
      },
      orderBy:{ title: 'asc' },
    });

    return res.status(200).json(tracks);
  } catch (error){
    return res.status(500).json({ error: 'Failed to fetch tracks' });
  }
});

/** Optional text field from the upload form, trimmed and capped. */
function textField(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().slice(0, 200);
  return trimmed || undefined;
}

// POST /tracks (what the Library page calls) or POST /tracks/upload - multipart form:
// "file" (MP3 or WAV, 20MB max), optional "title" and "artist" in any order.
router.post(['/', '/upload'], requireAuth, receiveAudioUpload, async (req: AuthenticatedRequest, res: Response) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'Upload an MP3 or WAV file in the "file" field' });
  }

  // The extension and MIME type come from the client, so parse the file to confirm it is audio.
  let metadata: AudioMetadata;
  try {
    metadata = await readAudioMetadata(file.path);
  } catch {
    await removeFile(file.path);
    return res.status(400).json({ error: 'File is not a readable MP3 or WAV' });
  }

  const duration = Math.round(metadata.duration ?? 0);
  if (!duration) {
    await removeFile(file.path);
    return res.status(400).json({ error: 'Could not read the length of this file' });
  }

  try {
    const track = await prisma.track.create({
      data: {
        title: textField(req.body?.title) ?? metadata.title ?? path.parse(file.originalname).name,
        artist: textField(req.body?.artist) ?? metadata.artist ?? 'Unknown artist',
        album: metadata.album,
        duration,
        fileUrl: `${UPLOADS_URL_PATH}/${file.filename}`,
        ownerId: req.user!.userId,
      },
    });

    return res.status(201).json(track);
  } catch (error) {
    await removeFile(file.path);
    return res.status(500).json({ error: 'Failed to save uploaded track' });
  }
});

// GET /tracks/:id - one of the user's own tracks or a starter track.
// Someone else's track is a 404, not a 403, so ids can't be probed.
router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const track = await prisma.track.findFirst({
      where: {
        id: req.params.id,
        OR: [{ ownerId: req.user!.userId }, { ownerId: null }],
      },
    });

    if (!track) {
      return res.status(404).json({ error: 'Track not found' });
    }
    return res.status(200).json(track);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch track' });
  }
});

// DELETE /tracks/:id - owner only. Also deletes the audio file and, through the schema's
// cascade, any mix sessions that used this track.
router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const track = await prisma.track.findUnique({ where: { id: req.params.id } });

    if (track && track.ownerId === null) {
      return res.status(403).json({ error: 'Starter tracks cannot be deleted' });
    }
    if (!track || track.ownerId !== req.user!.userId) {
      return res.status(404).json({ error: 'Track not found' });
    }

    await prisma.track.delete({ where: { id: track.id } });

    // The row is gone either way; a leftover file is logged rather than failing the request.
    try {
      await removeFile(uploadedFilePath(track.fileUrl));
    } catch (error) {
      console.error(`Deleted track ${track.id} but could not remove its file:`, error);
    }

    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error: 'Failed to delete track' });
  }
});

export default router;
