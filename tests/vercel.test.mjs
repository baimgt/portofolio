import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import handler from '../api/index.mjs';

test('Vercel serverless handler handles rewritten /api and /uploads routes cleanly', async () => {
  const vercelTmp = join(tmpdir(), 'portfolio-vercel');
  rmSync(vercelTmp, { recursive: true, force: true });

  const server = createServer((req, res) => {
    void handler(req, res);
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  let csrf = '';

  const call = async (rewrittenUrl, { method = 'GET', body, token = csrf, anonymous = false } = {}) => {
    const response = await fetch(`${base}${rewrittenUrl}`, {
      method,
      headers: {
        ...(anonymous ? {} : { Cookie: cookie }),
        ...(token ? { 'X-CSRF-Token': token } : {}),
        ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
    });
    if (!anonymous) {
      const cookies = response.headers.getSetCookie();
      if (cookies.length) cookie = cookies[0].split(';')[0];
    }
    return { status: response.status, body: await response.json(), response };
  };

  try {
    const health = await call('/api?__path=/api/health', { anonymous: true });
    assert.equal(health.status, 200);
    assert.equal(health.body.ok, true);
    assert.equal(health.body.storage, 'temporary');

    const content = await call('/api?__path=/api/content', { anonymous: true });
    assert.equal(content.status, 200);
    assert.equal(content.body.profile.firstName, 'Vano');

    const me = await call('/api?__path=/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.authenticated, false);
    assert.equal(me.body.storageMode, 'temporary');
    csrf = me.body.csrfToken;

    const login = await call('/api?__path=/api/auth/login', {
      method: 'POST',
      body: { username: 'admin', password: 'admin' },
    });
    assert.equal(login.status, 200);
    assert.equal(login.body.authenticated, true);
    csrf = login.body.csrfToken;

    const updated = structuredClone(content.body);
    updated.profile.name = 'Vercel Test User';
    const save = await call('/api?__path=/api/admin/content', {
      method: 'PUT',
      body: updated,
    });
    assert.equal(save.status, 200);
    assert.equal(save.body.profile.name, 'Vercel Test User');

    const imgBuf = await sharp({
      create: { width: 40, height: 40, channels: 3, background: '#3366dd' },
    })
      .png()
      .toBuffer();
    const form = new FormData();
    form.append('image', new Blob([imgBuf], { type: 'image/png' }), 'vercel.png');
    const uploaded = await call('/api?__path=/api/admin/upload', {
      method: 'POST',
      body: form,
    });
    assert.equal(uploaded.status, 201);
    assert.match(uploaded.body.url, /^\/uploads\/.+\.webp$/);

    const fetchedImg = await fetch(`${base}/api?__path=${uploaded.body.url}`);
    assert.equal(fetchedImg.status, 200);
    assert.match(fetchedImg.headers.get('content-type'), /webp/);
  } finally {
    await new Promise((done) => server.close(done));
    rmSync(vercelTmp, { recursive: true, force: true });
  }
});
