import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: parseInt(process.env.FRONTEND_PORT ?? '3000', 10),
    proxy: {
      '/api': { target: process.env.API_PROXY_TARGET ?? 'http://localhost:4000', changeOrigin: true },
    },
  },
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/utils/**/*.ts', 'src/store/**/*.ts', 'src/hooks/**/*.ts'],
      reporter: ['text'],
      skipFull: false,
    },
  },
} as Parameters<typeof defineConfig>[0]);
