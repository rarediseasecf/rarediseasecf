import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// @solana/web3.js requires Buffer and process to be available in the browser.
// vite-plugin-node-polyfills injects them globally without manual inject globals.
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      // Only polyfill what web3.js actually needs
      include: ['buffer', 'process'],
      globals: {
        Buffer: true,
        process: true,
      },
    }),
  ],
  server: {
    proxy: {
      // Forward /api/* to the Day 3 auth server so the browser stays same-origin.
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
})
