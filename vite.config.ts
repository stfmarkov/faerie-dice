import { defineConfig } from 'vite'

export default defineConfig({
  // HTML is owned by Go (templates/). Vite only builds JS/CSS.
  appType: 'custom',
  build: {
    manifest: true,
    rollupOptions: {
      input: 'src/main.ts',
    },
  },
})
