import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

const rawPort = process.env.PORT;
if (!rawPort) throw new Error('PORT environment variable is required but was not provided.');
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);

const basePath = process.env.BASE_PATH;
if (!basePath) throw new Error('BASE_PATH environment variable is required but was not provided.');

const gameDir = path.resolve(import.meta.dirname, 'game');

export default defineConfig({
  base: basePath,
  // Serve the RPG Maker MV game directory directly — no React bundling
  root: gameDir,
  publicDir: false,
  appType: 'mpa',

  plugins: [
    {
      // Serve ALL game JS files as plain static files, bypassing Vite's
      // import-analysis transform which chokes on RPG Maker plugin code.
      name: 'serve-game-js-static',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (!req.url) { next(); return; }

          // Strip the basePath prefix Vite prepends in dev
          const withoutBase = req.url.startsWith(basePath)
            ? req.url.slice(basePath.length)
            : req.url;

          // Only intercept JS files inside the game dir
          if (!withoutBase.endsWith('.js') && !withoutBase.endsWith('.json')) {
            next(); return;
          }
          // skip vite-internal requests
          if (withoutBase.startsWith('@') || withoutBase.startsWith('__')) {
            next(); return;
          }

          const filePath = path.join(gameDir, withoutBase.split('?')[0]!);
          if (!filePath.startsWith(gameDir)) { next(); return; }

          if (fs.existsSync(filePath)) {
            const ext = path.extname(filePath);
            const ct = ext === '.json' ? 'application/json' : 'application/javascript';
            res.setHeader('Content-Type', ct);
            res.setHeader('Cache-Control', 'no-cache');
            res.end(fs.readFileSync(filePath));
            return;
          }
          next();
        });
      },
    },
  ],

  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: { strict: false },
    hmr: {
      // Disable the error overlay — it would cover the fullscreen game
      overlay: false,
    },
  },

  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
