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
