import 'dotenv/config';

const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
  console.error('FATAL: JWT_SECRET is not set. Add it to your .env file (see .env.example).');
  process.exit(1);
}

export const JWT_SECRET: string = jwtSecret;

// How long a login token lasts, e.g. '7d', '1h', '10s'.
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
