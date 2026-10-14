import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true'
    ? `/${process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'YOUNGDO_Studio'}/` : '/',
  plugins: [react()],
  build: {
    rolldownOptions: {
      input: {
        studio: fileURLToPath(new URL('./index.html', import.meta.url)),
        autoCreate: fileURLToPath(new URL('./auto_create/index.html', import.meta.url)),
        autoFile: fileURLToPath(new URL('./auto_create/file/index.html', import.meta.url)),
      },
    },
  },
})
