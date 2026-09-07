import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const proxyWithSpaBypass = {
  target: 'http://localhost:3001',
  bypass: (req) => {
    if (req.headers.accept && req.headers.accept.includes('text/html')) {
      return '/index.html';
    }
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/auth': 'http://localhost:3001',
      '/upload': 'http://localhost:3001',
      '/identify-medicines': 'http://localhost:3001',
      '/instructions': 'http://localhost:3001',
      '/history': proxyWithSpaBypass,
      '/medicines': 'http://localhost:3001',
      '/schedule': proxyWithSpaBypass,
      '/caregiver': proxyWithSpaBypass,
      '/report': 'http://localhost:3001',
      '/uploads': 'http://localhost:3001',
      '/test-assets': 'http://localhost:3001',
    },
  },
})
