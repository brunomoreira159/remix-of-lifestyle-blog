import path from "path"
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Carrega as variáveis de ambiente do .env
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      proxy: {
        '/api': {
          target: 'https://integrate.api.nvidia.com/v1',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
          // Adiciona o cabeçalho de autorização na requisição
          configure: (proxy, options) => {
            proxy.on('proxyReq', (proxyReq, req, res) => {
              proxyReq.setHeader('Authorization', `Bearer ${env.VITE_NVIDIA_API_KEY}`);
            });
          },
        },
      },
    },
  };
});
