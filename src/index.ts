import app from './app';
import { seedStarterTracks } from './lib/starterTracks';

const PORT = process.env.PORT || 5000;

seedStarterTracks()
  .catch((error) => {
    console.error('Failed to seed starter tracks (is the database running?):', error);
  })
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  });