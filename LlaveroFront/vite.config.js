import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// The monorepo keeps a single `.env` at the repository root, one level above
// LlaveroFront/. `envDir` points Vite there so VITE_* variables come from the
// same file the backend and docker-compose read.
const envDir = path.resolve(__dirname, '..');

export default defineConfig(({ mode }) => {
  // `loadEnv` is required for the proxy target below: variables reach client
  // code through `import.meta.env`, but vite.config itself runs in Node and
  // Vite does not populate `process.env` with them.
  const env = loadEnv(mode, envDir, 'VITE_');

  // Proxy target only. VITE_API_URL is inlined into the client bundle and
  // resolved by the browser, so it must stay host-reachable; when the dev
  // server itself runs in a container it reaches the API by service name,
  // which docker-compose injects as VITE_PROXY_TARGET.
  const proxyTarget =
    process.env.VITE_PROXY_TARGET || env.VITE_API_URL || 'http://localhost:8080';

  return {
    envDir,
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
        '/socket.io': {
          target: proxyTarget,
          ws: true,
          changeOrigin: true,
        },
      },
    },
  };
});
