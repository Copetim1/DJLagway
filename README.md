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
npm install --prefix client
cp client/.env.example client/.env.local   # set VITE_API_URL to the backend's address
npm run dev                 # starts the backend and the client together
```

`npm run dev` runs both halves in one terminal, with output labelled `[api]` and `[client]`.
Open http://localhost:5173. Ctrl+C stops both. To run just one, use `npm run dev:server` or
`npm run dev:client`.

On macOS, port 5000 is often taken by AirPlay Receiver. If it is, set `PORT=3000` in `.env`
and `VITE_API_URL=http://localhost:3000` in `client/.env.local`.

## Starter library

Every user sees these songs alongside their own uploads. The MP3s live in
[starter-tracks/](starter-tracks/) and are committed to git. Their details are listed in
[src/lib/starterTracks.ts](src/lib/starterTracks.ts).

To add a song: put the MP3 in `starter-tracks/`, add an entry to the list with a new id, then
restart the server. Never change an existing id, because mix sessions refer to tracks by id.

`.env.example`'s `DATABASE_URL` matches the credentials in `docker-compose.yml`. Change it if
you use a different Postgres.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Run the backend and client together, with auto-reload |
| `npm run dev:server` | Run only the backend |
| `npm run dev:client` | Run only the client |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled server |
| `npm run prisma:generate` | Regenerate the Prisma client |
| `npm run prisma:push` | Sync the database schema (same as `npx prisma db push`) |
