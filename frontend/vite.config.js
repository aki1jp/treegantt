import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolveFrontendPort } from './src/utils/portConfig';
export default defineConfig({
    plugins: [react()],
    server: {
        host: true,
        port: resolveFrontendPort(),
        proxy: {
            '/api': { target: process.env.API_PROXY_TARGET ?? 'http://localhost:4000', changeOrigin: true },
        },
    },
    test: {
        coverage: {
            provider: 'v8',
            // アプリ全体（components/App/version 含む）を計測対象にし、数値を実態化する。
            include: ['src/**/*.{ts,tsx}'],
            exclude: ['src/**/__tests__/**', 'src/**/*.test.{ts,tsx}', 'src/types/**', 'src/main.tsx'],
            reporter: ['text'],
            skipFull: false,
        },
    },
});
