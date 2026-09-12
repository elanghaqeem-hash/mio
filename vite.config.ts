import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Keep relative asset paths for the packaged Electron app while using
// root-relative paths for the web/Cloudflare Pages build.
export default defineConfig(({ mode }) => ({
  base: mode === 'electron' ? './' : '/',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
  },
}))
