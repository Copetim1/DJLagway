# DJLagway

DJLagway is a browser-based DJ instrument: a webcam tracks your hands, and hand position and
gestures control crossfade, volume and an audio effect across two decks.

This repo's root is the backend API: Express, TypeScript, Prisma and Postgres. It handles user
accounts, a starter library of songs every user can mix, the tracks each user uploads, and a
log of their mix sessions. The browser client
lives in [client/](client/).

## Prerequisites

- Node.js 20+
- PostgreSQL. The included `docker-compose.yml` runs one locally (needs Docker).

## Setup

```bash
npm install
cp .env.example .env        # then set JWT_SECRET to a long random string
docker compose up -d        # optional: start the local Postgres from docker-compose.yml
npx prisma db push          # create the tables from prisma/schema.prisma
npm run dev
```

The server listens on `PORT` (default 5000). It exits on startup if `JWT_SECRET` is not set.

On every boot the server also loads the starter library into the database. It's safe to repeat,
so restarts don't create duplicates. If the database isn't reachable, the server logs the error
and starts anyway.

## Starter library

Every user sees these songs alongside their own uploads. The MP3s live in
[starter-tracks/](starter-tracks/) and are committed to git. Their details are listed in
[src/lib/starterTracks.ts](src/lib/starterTracks.ts).

To add a song: put the MP3 in `starter-tracks/`, add an entry to the list with a new id, then
restart the server. Never change an existing id, because mix sessions refer to tracks by id.

A starter track's `fileUrl` is a path such as `/starter-tracks/Mr%20Smith%20-%20Clarity.mp3`.
The client plays it by putting the API's address in front.

`.env.example`'s `DATABASE_URL` matches the credentials in `docker-compose.yml`. Change it if
you use a different Postgres.

## API endpoints

Endpoints marked 🔒 need an `Authorization: Bearer <token>` header, using the token from
`POST /auth/login`.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/` | Health check |
| POST | `/auth/register` | Create an account. Body: `email`, `username`, `password`, optional `role` (`Beginner` or `Experienced`) |
| POST | `/auth/login` | Log in. Body: `email`, `password`. Returns a JWT valid for 7 days |
| GET | `/auth/me` 🔒 | The logged-in user's profile |
| GET | `/tracks` 🔒 | The starter library plus the logged-in user's uploaded tracks |
| POST | `/mix-sessions` 🔒 | Log a mix session. Body: `trackAId`, `trackBId` (each must be your track or a starter track), optional `effectUsed`, `startedAt`, `endedAt` |
| GET | `/starter-tracks/<file>` | Starter library audio files |
| GET | `/mix-sessions` 🔒 | Your mix sessions, newest first, each with the title, artist and artwork of both tracks |

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Run the server with auto-reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled server |
| `npm run prisma:generate` | Regenerate the Prisma client |
| `npm run prisma:push` | Sync the database schema (same as `npx prisma db push`) |
