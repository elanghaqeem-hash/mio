import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => ({
  // Cloudflare Pages requires root-relative assets; packaged Electron keeps
  // relative paths so the renderer works from the local file protocol.
  base: mode === 'electron' ? './' : '/',
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              // React runtime in its own long-cacheable chunk keeps the app entry under the
              // release-smoke chunk budget (MIO-PRV-00.10) without changing load behavior.
              name: 'react-vendor',
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 40,
            },
            {
              name: 'three-vendor',
              test: /node_modules[\\/]three[\\/]/,
              maxSize: 280000,
              priority: 30,
            },
          ],
        },
      },
    },
  },
}));
