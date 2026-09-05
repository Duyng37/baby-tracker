import { loadEnv, type Plugin } from 'vite';
import { configuration } from './security.ts';
import { handler } from './http.ts';

// Vite serves the same BFF locally. Nothing from this server module is imported by src/.
export function localAPI(): Plugin {
  return {
    name: 'noi-local-api', apply: 'serve',
    configureServer(server) {
      const env = loadEnv(server.config.mode, server.config.envDir, '');
      const api = handler(() => configuration(env));
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0];
        if (path !== '/api/auth' && path !== '/api/rpc') { next(); return; }
        void api(req, res);
      });
    },
  };
}