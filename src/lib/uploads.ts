import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import multer from 'multer';

/** URL prefix uploaded audio is served from, e.g. /uploads/<uuid>.mp3 */
export const UPLOADS_URL_PATH = '/uploads';

/** Where uploaded audio is stored. Resolves to <repo>/uploads from both src/ and dist/. */
export const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, '..', '..', 'uploads');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

// Extension and the browser-reported MIME type must both match. This is only a first
// pass, since the client controls both; the route parses the file to confirm it is audio.
const ALLOWED_TYPES: Record<string, string[]> = {
  '.mp3': ['audio/mpeg', 'audio/mp3'],
  '.wav': ['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave'],
};

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    // Never use the client's filename on disk: it can collide or contain path tricks.
    filename: (_req, file, cb) => cb(null, randomUUID() + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = ALLOWED_TYPES[path.extname(file.originalname).toLowerCase()];
    cb(null, allowed?.includes(file.mimetype) ?? false);
  },
});

/**
 * Accepts one audio file in the multipart field "file" and turns multer's errors into
 * JSON responses. A rejected type leaves req.file undefined; the route answers that.
 */
export function receiveAudioUpload(req: Request, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File must be 20MB or smaller' });
      }
      return res.status(400).json({ error: err.message });
    }
    if (err) return next(err);
    next();
  });
}

/** Absolute path of an uploaded file from its fileUrl. basename() keeps it inside UPLOADS_DIR. */
export function uploadedFilePath(fileUrl: string): string {
  return path.join(UPLOADS_DIR, path.basename(fileUrl));
}

/** Delete a file, treating "already gone" as success. */
export async function removeFile(filePath: string): Promise<void> {
  try {
    await fs.promises.unlink(filePath);
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error;
  }
}
