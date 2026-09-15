import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Proxy de dev: o browser chama /api/... (mesma origem, sem CORS) e o Vite encaminha para o
// backend em :3000, removendo o prefixo /api (as rotas do backend são montadas na raiz).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
