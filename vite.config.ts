import { defineConfig } from 'vite'

export default defineConfig({
  // HTML is owned by Go (templates/). Vite only builds JS/CSS.
  appType: 'custom',
  build: {
    manifest: true,
    rollupOptions: {
      input: {
        main: 'src/main.ts',
        explain: 'src/explain.css',
      },
    },
  },
})
