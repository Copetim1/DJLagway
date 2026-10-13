import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRouter from './routes/auth.ts';
import tracksRouter from './routes/tracks.ts';
import mixSessionsRouter from './routes/mixSessions.ts';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// API Routes
app.use('/auth', authRouter);
app.use('/tracks', tracksRouter);
app.use('/mix-sessions', mixSessionsRouter);

app.get('/', (req, res) => {
  res.send('DJLagway Backend API is running.');
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});