import { defineConfig } from 'vite';
import { createApiServer } from './server/index.mjs';

const apiPort = Number(process.env.API_PORT || 3001);

function localApiPlugin() {
  return {
    name: 'aura-local-api',
    configureServer(viteServer) {
      const apiServer = createApiServer();
      apiServer.on('error', (error) => {
        console.error(`Локальный API не запущен на порту ${apiPort}: ${error.message}`);
      });
      apiServer.listen(apiPort, '127.0.0.1', () => {
        console.info(`Локальный API: http://127.0.0.1:${apiPort}/api`);
      });
      viteServer.httpServer?.once('close', () => apiServer.close());
    },
  };
}

export default defineConfig({
  plugins: [localApiPlugin()],
  server: {
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
});
