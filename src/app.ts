import express from 'express';
import cors from 'cors';
import path from 'path';
import './lib/config';
import authRouter from './routes/auth';
import tracksRouter from './routes/tracks';
import mixSessionsRouter from './routes/mixSessions';
import settingsRouter from './routes/settings';
import { STARTER_TRACKS_URL_PATH } from './lib/starterTracks';
import { UPLOADS_DIR, UPLOADS_URL_PATH } from './lib/uploads';

const app = express();

app.use(cors());
app.use(express.json());
app.use(STARTER_TRACKS_URL_PATH, express.static(path.join(__dirname, '..', 'starter-tracks')));
app.use(UPLOADS_URL_PATH, express.static(UPLOADS_DIR));

app.use('/auth', authRouter);
app.use('/tracks', tracksRouter);
app.use('/mix-sessions', mixSessionsRouter);
app.use('/settings', settingsRouter);

app.get('/', (_req, res) => {
  res.send('DJLagway Backend API is running.');
});

export default app;