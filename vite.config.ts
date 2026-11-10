import { defineConfig } from 'vite'

export default defineConfig({
  // Relative asset paths keep the build portable across GitHub Pages project
  // paths, the arcade subdomain and any future wrapper shell.
  base: './',
  server: { port: 5176 },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
  },
})
