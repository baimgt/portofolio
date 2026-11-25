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
  try {
    const rawUrl = req.url || '/';
    const parsed = new URL(rawUrl, 'http://localhost');
    const forwarded = parsed.searchParams.get('__path');
    if (forwarded) {
      parsed.searchParams.delete('__path');
      const qs = parsed.searchParams.toString();
      const normalized = forwarded.startsWith('/') ? forwarded : `/${forwarded}`;
      req.url = `${normalized}${qs ? `?${qs}` : ''}`;
    }
    const app = await getApp();
    return app(req, res);
  } catch (error) {
    console.error('Vercel API handler error:', error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify({
          error:
            error instanceof Error
              ? `Server error: ${error.message}`
              : 'Server API mengalami gangguan.',
        }),
      );
    }
  }
}
