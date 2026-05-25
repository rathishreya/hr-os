import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // Proxy API + public careers pages to the FastAPI backend (avoids CORS in dev).
      '/api': 'http://localhost:8000',
      '/careers': 'http://localhost:8000',
    },
  },
})
