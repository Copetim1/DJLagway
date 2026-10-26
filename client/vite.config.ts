import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
// vitest/config re-exports defineConfig with the `test` key typed in.
import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Backend address for the dev proxy. Set VITE_API_URL in .env.local if the
  // backend isn't on 5000 (on macOS, AirPlay Receiver often holds port 5000).
  const api = loadEnv(mode, process.cwd(), '').VITE_API_URL || 'http://localhost:5000'

  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        '/auth': api,
        '/tracks': api,
        '/mix-sessions': api,
        '/starter-tracks': api,
      },
    },
    test: {
      // The suite covers pure functions only. Webcam and Web Audio cannot be
      // meaningfully faked here — those are verified by hand, see README.
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  }
})
