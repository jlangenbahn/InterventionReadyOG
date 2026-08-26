/**
 * Vite config for the React frontend. Amplify Hosting builds with `npm run build`
 * and publishes the `dist/` folder (see amplify.yml).
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
