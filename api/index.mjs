import { createExpressApp, attachApiErrorHandler } from '../server/app.mjs';
import { createVercelStorage } from '../server/vercel-storage.mjs';

let appPromise;

async function getApp() {
  if (!appPromise) {
    appPromise = (async () => {
      const storage = await createVercelStorage();
      const app = await createExpressApp({
        storage,
        production: true,
        maxUploadBytes: 4 * 1024 * 1024,
      });
      attachApiErrorHandler(app);
      return app;
    })().catch((err) => {
      appPromise = undefined;
      throw err;
    });
  }
  return appPromise;
}

export default async function handler(req, res) {
  const parsed = new URL(req.url, 'http://localhost');
  const forwarded = parsed.searchParams.get('__path');
  if (forwarded) {
    parsed.searchParams.delete('__path');
    const qs = parsed.searchParams.toString();
    const normalized = forwarded.startsWith('/') ? forwarded : `/${forwarded}`;
    req.url = `${normalized}${qs ? `?${qs}` : ''}`;
  }
  const app = await getApp();
  return app(req, res);
}
