import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';

const env = loadEnv(process.env.NODE_ENV ?? 'development', process.cwd(), '');
const port = Number(env.PORT ?? '18912');
const basePath = process.env.BASE_PATH ?? env.BASE_PATH ?? '/';

const apiProxyTarget =
  env.VITE_API_PROXY_TARGET ??
  env.VITE_CHAIN_NODE_URL ??
  'https://emberchain.duckdns.org';

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port: Number.isNaN(port) || port <= 0 ? 18912 : port,
    strictPort: false,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: Number.isNaN(port) || port <= 0 ? 3000 : port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
