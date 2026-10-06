import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Em dev o servidor (npm run dev:server) escuta na 3000.
    proxy: { '/api': 'http://localhost:3000', '/saude': 'http://localhost:3000' },
  },
  test: { environment: 'happy-dom', include: ['src/**/*.test.ts', 'server/src/**/*.test.ts'] },
})
