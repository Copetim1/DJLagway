import request from 'supertest';
import app from '../src/app';
import prisma from '../src/lib/prisma';

describe('DJLagway Backend API', () => {
  let userAToken: string;
  let userBToken: string;
  let trackAId: string;
  let trackBId: string;

  const userA = {
    email: `usera_${Date.now()}@djlagway.dev`,
    username: `usera_${Date.now()}`,
    password: 'Password123!',
  };

  const userB = {
    email: `userb_${Date.now()}@djlagway.dev`,
    username: `userb_${Date.now()}`,
    password: 'Password123!',
  };

  beforeAll(async () => {
    const tA = await prisma.track.create({
      data: { title: 'Track A', artist: 'Test', duration: 100, fileUrl: '/a.mp3' },
    });
    const tB = await prisma.track.create({
      data: { title: 'Track B', artist: 'Test', duration: 120, fileUrl: '/b.mp3' },
    });
    trackAId = tA.id;
    trackBId = tB.id;
  });

  afterAll(async () => {
    const trackIds = [trackAId, trackBId].filter(Boolean);
    if (trackIds.length > 0) {
      await prisma.mixSession.deleteMany({ where: { trackAId: { in: trackIds } } });
      await prisma.track.deleteMany({ where: { id: { in: trackIds } } });
    }
    await prisma.user.deleteMany({ where: { email: { in: [userA.email, userB.email] } } });
    await prisma.$disconnect();
  });

  it('registers and logs in users', async () => {
    const resA = await request(app).post('/auth/register').send(userA);
    expect(resA.status).toBe(201);
    const loginA = await request(app).post('/auth/login').send({
      email: userA.email,
      password: userA.password,
    });
    expect(loginA.status).toBe(200);
    userAToken = loginA.body.token;

    const resB = await request(app).post('/auth/register').send(userB);
    expect(resB.status).toBe(201);
    const loginB = await request(app).post('/auth/login').send({
      email: userB.email,
      password: userB.password,
    });
    expect(loginB.status).toBe(200);
    userBToken = loginB.body.token;
  });

  it('enforces 403 restrictions for Beginner users', async () => {
    const settingsRes = await request(app)
      .put('/settings')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ preferredEffect: 'highpass' });
    expect(settingsRes.status).toBe(403);

    const sessionRes = await request(app)
      .post('/mix-sessions')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ trackAId, trackBId, effectUsed: 'highpass' });
    expect(sessionRes.status).toBe(403);
  });

  it('validates mix session ids before applying role restrictions', async () => {
    const invalidSessions = [
      { trackBId, effectUsed: 'highpass' },
      { trackAId, effectUsed: 'highpass' },
      { trackAId, trackBId, effectUsed: 5 },
    ];

    for (const session of invalidSessions) {
      const response = await request(app)
        .post('/mix-sessions')
        .set('Authorization', `Bearer ${userAToken}`)
        .send(session);

      expect(response.status).toBe(400);
    }
  });

  it('allows role upgrade and unlocks advanced settings/sessions', async () => {
    const switchRes = await request(app)
      .patch('/auth/role')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ role: 'Experienced' });
    expect(switchRes.status).toBe(200);
    userAToken = switchRes.body.token;

    const settingsRes = await request(app)
      .put('/settings')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ preferredEffect: 'echo', swapHands: true });
    expect(settingsRes.status).toBe(200);
    expect(settingsRes.body.swapHands).toBe(true);

    const invalidSessionRes = await request(app)
      .post('/mix-sessions')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ trackAId, trackBId, effectUsed: 'reverb' });
    expect(invalidSessionRes.status).toBe(400);

    const sessionRes = await request(app)
      .post('/mix-sessions')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ trackAId, trackBId, effectUsed: 'echo' });
    expect(sessionRes.status).toBe(201);
  });

  it('rejects invalid settings values', async () => {
    const invalidSettings = [
      { preferredEffect: 5 },
      { preferredEffect: 'reverb' },
      { swapHands: 1 },
      { mirrored: 'true' },
      { gestureSensitivity: 1.1 },
      { smoothing: -0.1 },
    ];

    for (const settings of invalidSettings) {
      const response = await request(app)
        .put('/settings')
        .set('Authorization', `Bearer ${userAToken}`)
        .send(settings);

      expect(response.status).toBe(400);
    }
  });

  it('ensures users only see their own sessions', async () => {
    await request(app)
      .post('/mix-sessions')
      .set('Authorization', `Bearer ${userBToken}`)
      .send({ trackAId, trackBId, effectUsed: 'lowpass' });

    const listA = await request(app).get('/mix-sessions').set('Authorization', `Bearer ${userAToken}`);
    expect(listA.status).toBe(200);
    expect(listA.body.length).toBe(1);

    const listB = await request(app).get('/mix-sessions').set('Authorization', `Bearer ${userBToken}`);
    expect(listB.status).toBe(200);
    expect(listB.body.length).toBe(1);
  });
});