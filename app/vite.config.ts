/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import fs from 'fs';
import path from 'path';

const dataDir = resolve(__dirname, '..', 'data');

function copyDataDir(destRoot: string) {
  const dest = path.join(destRoot, 'data');
  const copy = (from: string, to: string) => {
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
      const srcPath = path.join(from, entry.name);
      const destPath = path.join(to, entry.name);
      if (entry.isDirectory()) copy(srcPath, destPath);
      else fs.copyFileSync(srcPath, destPath);
    }
  };
  copy(dataDir, dest);
}

export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/forest-xray/' : '/',
  server: {
    fs: { allow: ['..'] },
  },
  plugins: [
    react(),
    {
      name: 'forest-xray-data',
      configureServer(server) {
        server.middlewares.use('/data', (req, res, next) => {
          const urlPath = decodeURIComponent(req.url?.split('?')[0] || '');
          const filePath = path.join(dataDir, urlPath);
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            res.setHeader('Content-Type', 'application/json');
            fs.createReadStream(filePath).pipe(res);
          } else {
            next();
          }
        });
      },
      closeBundle() {
        const dist = resolve(__dirname, 'dist');
        copyDataDir(dist);
        fs.writeFileSync(path.join(dist, '.nojekyll'), '');
      },
    },
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
