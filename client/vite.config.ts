import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
// vitest/config re-exports defineConfig with the `test` key typed in.
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // The suite covers pure functions only. Webcam and Web Audio cannot be
    // meaningfully faked here — those are verified by hand, see README.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
