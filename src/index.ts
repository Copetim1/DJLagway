import express from 'express';
import cors from 'cors';
import path from 'path';
import './lib/config'; // loads .env and exits if JWT_SECRET is missing
import authRouter from './routes/auth';
import tracksRouter from './routes/tracks';
import mixSessionsRouter from './routes/mixSessions';
import { seedStarterTracks, STARTER_TRACKS_URL_PATH } from './lib/starterTracks';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Starter library audio. Resolves to <repo>/starter-tracks from both src/ and dist/.
app.use(STARTER_TRACKS_URL_PATH, express.static(path.join(__dirname, '..', 'starter-tracks')));

// API Routes
app.use('/auth', authRouter);
app.use('/tracks', tracksRouter);
app.use('/mix-sessions', mixSessionsRouter);

app.get('/', (req, res) => {
  res.send('DJLagway Backend API is running.');
});

seedStarterTracks()
  .catch((error) => {
    console.error('Failed to seed starter tracks (is the database running?):', error);
  })
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  });