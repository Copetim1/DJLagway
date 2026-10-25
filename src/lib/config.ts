import 'dotenv/config';

const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
  console.error('FATAL: JWT_SECRET is not set. Add it to your .env file (see .env.example).');
  process.exit(1);
}

export const JWT_SECRET: string = jwtSecret;
