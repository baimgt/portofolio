import express from 'express';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer as createHttpServer } from 'node:http';
import { openDatabase } from './database.mjs';
import { createExpressApp, attachApiErrorHandler } from './app.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function createApplication({
  dataDir = process.env.DATA_DIR || join(root, 'data'),
  production = process.env.NODE_ENV === 'production',
  frontend = true,
} = {}) {
  const storage = openDatabase(dataDir);
  const app = await createExpressApp({ storage, production });
  const httpServer = createHttpServer(app);

  let vite;
  if (frontend && !production) {
    const { createServer } = await import('vite');
    vite = await createServer({
      root,
      server: { middlewareMode: true, allowedHosts: true, hmr: { server: httpServer } },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (frontend) {
    app.use(express.static(join(root, 'dist'), { maxAge: '1h' }));
    app.get(/.*/, (_req, res) => res.sendFile(join(root, 'dist', 'index.html')));
  }

  attachApiErrorHandler(app);

  return {
    app,
    server: httpServer,
    storage,
    close: async () => {
      await vite?.close();
      await new Promise((done) => httpServer.close(done));
      await storage.close();
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const portIndex = process.argv.indexOf('--port');
  const port = Number(process.env.PORT || (portIndex !== -1 ? process.argv[portIndex + 1] : 5173));
  const application = await createApplication();
  application.server.listen(port, '0.0.0.0', () =>
    console.log(`Portfolio running at http://localhost:${port} | Admin: /admin`),
  );
  for (const signal of ['SIGTERM', 'SIGINT'])
    process.on(signal, async () => {
      await application.close();
      process.exit(0);
    });
}
