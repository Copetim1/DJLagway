import fs from 'fs';
import request from 'supertest';
import app from '../src/app';
import prisma from '../src/lib/prisma';
import { MAX_UPLOAD_BYTES, UPLOADS_DIR, uploadedFilePath } from '../src/lib/uploads';

// music-metadata is ESM-only and Jest runs CommonJS, so stand in for it. The stand-in
// times WAV files from their header and rejects anything else, like a parse failure would.
jest.mock('../src/lib/audioMeta', () => ({
  readAudioMetadata: jest.fn(async (filePath: string) => {
    const bytes = jest.requireActual<typeof import('fs')>('fs').readFileSync(filePath);
    if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') {
      throw new Error('Unsupported file');
    }
    const byteRate = bytes.readUInt32LE(28);
    const dataSize = bytes.readUInt32LE(40);
    return { duration: dataSize / byteRate, title: undefined, artist: undefined };
  }),
}));

/** A valid 16-bit mono PCM WAV of silence. */
function silentWav(seconds: number, sampleRate = 8000): Buffer {
  const dataSize = seconds * sampleRate * 2;
  const wav = Buffer.alloc(44 + dataSize);
  wav.write('RIFF', 0, 'ascii');
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write('WAVE', 8, 'ascii');
  wav.write('fmt ', 12, 'ascii');
  wav.writeUInt32LE(16, 16); // fmt chunk size
  wav.writeUInt16LE(1, 20); // PCM
  wav.writeUInt16LE(1, 22); // mono
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28); // byte rate
  wav.writeUInt16LE(2, 32); // block align
  wav.writeUInt16LE(16, 34); // bits per sample
  wav.write('data', 36, 'ascii');
  wav.writeUInt32LE(dataSize, 40);
  return wav;
}

const uploadCount = () => fs.readdirSync(UPLOADS_DIR).length;

describe('Track uploads', () => {
  const stamp = Date.now();
  const owner = { email: `owner_${stamp}@djlagway.dev`, username: `owner_${stamp}`, password: 'Password123!' };
  const other = { email: `other_${stamp}@djlagway.dev`, username: `other_${stamp}`, password: 'Password123!' };

  let ownerToken: string;
  let otherToken: string;
  let starterId: string;
  let uploaded: { id: string; fileUrl: string };

  async function registerAndLogIn(user: typeof owner): Promise<string> {
    await request(app).post('/auth/register').send(user).expect(201);
    const login = await request(app).post('/auth/login').send({ email: user.email, password: user.password });
    return login.body.token;
  }

  function upload(token: string) {
    return request(app).post('/tracks/upload').set('Authorization', `Bearer ${token}`);
  }

  beforeAll(async () => {
    ownerToken = await registerAndLogIn(owner);
    otherToken = await registerAndLogIn(other);
    const starter = await prisma.track.create({
      data: { title: 'Upload Test Starter', artist: 'Test', duration: 60, fileUrl: '/starter-tracks/test.mp3' },
    });
    starterId = starter.id;
  });

  afterAll(async () => {
    // Deleting the users cascades to their tracks; remove any files those tracks left behind.
    const leftovers = await prisma.track.findMany({
      where: { owner: { email: { in: [owner.email, other.email] } } },
    });
    for (const track of leftovers) {
      fs.rmSync(uploadedFilePath(track.fileUrl), { force: true });
    }
    await prisma.track.deleteMany({ where: { id: starterId } });
    await prisma.user.deleteMany({ where: { email: { in: [owner.email, other.email] } } });
    await prisma.$disconnect();
  });

  it('requires a login to upload, and writes nothing without one', async () => {
    const before = uploadCount();
    const res = await request(app)
      .post('/tracks/upload')
      .attach('file', silentWav(1), { filename: 'tone.wav', contentType: 'audio/wav' });
    expect(res.status).toBe(401);
    expect(uploadCount()).toBe(before);
  });

  it('rejects files that are not MP3 or WAV', async () => {
    const res = await upload(ownerToken).attach('file', Buffer.from('hello'), {
      filename: 'notes.txt',
      contentType: 'text/plain',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a request with no file', async () => {
    const res = await upload(ownerToken).field('title', 'Nothing attached');
    expect(res.status).toBe(400);
  });

  it('rejects files over 20MB with 413, and keeps no partial file', async () => {
    const before = uploadCount();
    const res = await upload(ownerToken).attach('file', Buffer.alloc(MAX_UPLOAD_BYTES + 1), {
      filename: 'huge.wav',
      contentType: 'audio/wav',
    });
    expect(res.status).toBe(413);
    expect(uploadCount()).toBe(before);
  });

  it('rejects a file that claims to be audio but is not, and deletes it', async () => {
    const before = uploadCount();
    const res = await upload(ownerToken).attach('file', Buffer.from('definitely not audio'), {
      filename: 'fake.mp3',
      contentType: 'audio/mpeg',
    });
    expect(res.status).toBe(400);
    expect(uploadCount()).toBe(before);
  });

  it('uploads a WAV, reads its duration, and serves the file', async () => {
    const wav = silentWav(2);
    const res = await upload(ownerToken)
      .field('title', 'My Upload')
      .field('artist', 'Me')
      .attach('file', wav, { filename: 'tone.wav', contentType: 'audio/wav' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: 'My Upload', artist: 'Me', duration: 2 });
    expect(res.body.fileUrl).toMatch(/^\/uploads\/[0-9a-f-]+\.wav$/);
    expect(fs.existsSync(uploadedFilePath(res.body.fileUrl))).toBe(true);
    uploaded = res.body;

    const audio = await request(app).get(uploaded.fileUrl);
    expect(audio.status).toBe(200);
    expect(Number(audio.headers['content-length'])).toBe(wav.length);
  });

  it('also accepts POST /tracks with the file before the text fields, as the Library page sends it', async () => {
    const res = await request(app)
      .post('/tracks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .attach('file', silentWav(1), { filename: 'tone.wav', contentType: 'audio/wav' })
      .field('title', 'Sent After File')
      .field('artist', 'Library Page');
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: 'Sent After File', artist: 'Library Page', duration: 1 });
  });

    it('accepts an MP3 or WAV labelled application/octet-stream, as curl sends it', async () => {
    const res = await upload(ownerToken).attach('file', silentWav(1), {
      filename: 'from-curl.wav',
      contentType: 'application/octet-stream',
    });
    expect(res.status).toBe(201);

    const notAudio = await upload(ownerToken).attach('file', Buffer.from('hello'), {
      filename: 'notes.txt',
      contentType: 'application/octet-stream',
    });
    expect(notAudio.status).toBe(400);
  });

  it('falls back to the original filename for the title', async () => {
    const res = await upload(ownerToken).attach('file', silentWav(1), {
      filename: 'Untitled Loop.wav',
      contentType: 'audio/wav',
    });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Untitled Loop');
    expect(res.body.artist).toBe('Unknown artist');
  });

  it('lists an upload for its owner only', async () => {
    const mine = await request(app).get('/tracks').set('Authorization', `Bearer ${ownerToken}`);
    expect(mine.body.map((t: { id: string }) => t.id)).toContain(uploaded.id);

    const theirs = await request(app).get('/tracks').set('Authorization', `Bearer ${otherToken}`);
    expect(theirs.body.map((t: { id: string }) => t.id)).not.toContain(uploaded.id);
  });

  it('GET /tracks/:id returns own and starter tracks, 404 otherwise', async () => {
    const own = await request(app).get(`/tracks/${uploaded.id}`).set('Authorization', `Bearer ${ownerToken}`);
    expect(own.status).toBe(200);
    expect(own.body.id).toBe(uploaded.id);

    const starter = await request(app).get(`/tracks/${starterId}`).set('Authorization', `Bearer ${otherToken}`);
    expect(starter.status).toBe(200);

    const notTheirs = await request(app).get(`/tracks/${uploaded.id}`).set('Authorization', `Bearer ${otherToken}`);
    expect(notTheirs.status).toBe(404);

    const missing = await request(app).get('/tracks/does-not-exist').set('Authorization', `Bearer ${ownerToken}`);
    expect(missing.status).toBe(404);

    const noLogin = await request(app).get(`/tracks/${uploaded.id}`);
    expect(noLogin.status).toBe(401);
  });

  it('GET /tracks/starter still answers without a login', async () => {
    const res = await request(app).get('/tracks/starter');
    expect(res.status).toBe(200);
    expect(res.body.map((t: { id: string }) => t.id)).toContain(starterId);
  });

  it("will not delete someone else's track or a starter track", async () => {
    const notTheirs = await request(app)
      .delete(`/tracks/${uploaded.id}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(notTheirs.status).toBe(404);
    expect(fs.existsSync(uploadedFilePath(uploaded.fileUrl))).toBe(true);

    const starter = await request(app).delete(`/tracks/${starterId}`).set('Authorization', `Bearer ${ownerToken}`);
    expect(starter.status).toBe(403);
  });

  it("deletes the owner's track and its file", async () => {
    const res = await request(app).delete(`/tracks/${uploaded.id}`).set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(204);
    expect(fs.existsSync(uploadedFilePath(uploaded.fileUrl))).toBe(false);

    const after = await request(app).get(`/tracks/${uploaded.id}`).set('Authorization', `Bearer ${ownerToken}`);
    expect(after.status).toBe(404);
  });
});
