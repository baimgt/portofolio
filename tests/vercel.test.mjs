import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import handler from '../api/index.mjs';
import { renderDocumentHtml, loadHtmlTemplate } from '../server/html-render.mjs';

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
    assert.equal(content.body.profile.firstName, 'Baim');

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
    assert.equal(fetchedImg.headers.get('cross-origin-resource-policy'), 'cross-origin');
    assert.equal(fetchedImg.headers.get('access-control-allow-origin'), '*');

    const mp3Buf = Buffer.concat([
      Buffer.from('ID3\x04\x00\x00\x00\x00\x00\x00'),
      Buffer.from('0123456789abcdefghijklmnopqrstuvwxyz'),
    ]);
    const audioForm = new FormData();
    audioForm.append('audio', new Blob([mp3Buf], { type: 'audio/mpeg' }), 'track.mp3');
    const uploadedAudio = await call('/api?__path=/api/admin/upload-audio', {
      method: 'POST',
      body: audioForm,
    });
    assert.equal(uploadedAudio.status, 201);
    assert.match(uploadedAudio.body.url, /^\/uploads\/.+\.mp3$/);

    const fetchedAudioRange = await fetch(`${base}/api?__path=${uploadedAudio.body.url}`, {
      headers: { Range: 'bytes=0-9' },
    });
    assert.equal(fetchedAudioRange.status, 206);
    assert.equal(fetchedAudioRange.headers.get('accept-ranges'), 'bytes');
    assert.match(fetchedAudioRange.headers.get('content-type'), /audio\/mpeg/);
    assert.equal(
      fetchedAudioRange.headers.get('content-range'),
      `bytes 0-9/${mp3Buf.length}`,
    );
    assert.equal((await fetchedAudioRange.arrayBuffer()).byteLength, 10);

    updated.settings.soundUrl = uploadedAudio.body.url;
    updated.settings.soundVolume = 95;
    updated.settings.sfxVolume = 70;
    const savedAudio = await call('/api?__path=/api/admin/content', {
      method: 'PUT',
      body: updated,
    });
    assert.equal(savedAudio.status, 200);
    assert.equal(savedAudio.body.settings.soundUrl, uploadedAudio.body.url);
    assert.equal(savedAudio.body.settings.soundVolume, 95);
    assert.equal(savedAudio.body.settings.sfxVolume, 70);

    const robotsRes = await fetch(`${base}/api?__path=/robots.txt`);
    assert.equal(robotsRes.status, 200);
    assert.match(await robotsRes.text(), /Sitemap: https:\/\/ibrahimabdullah\.biz\.id\/sitemap\.xml/);

    const sitemapRes = await fetch(`${base}/api?__path=/sitemap.xml`);
    assert.equal(sitemapRes.status, 200);
    const sitemapXml = await sitemapRes.text();
    assert.match(sitemapXml, /https:\/\/ibrahimabdullah\.biz\.id\//);
    assert.match(sitemapXml, /<image:image>/);
    assert.match(sitemapXml, /<image:loc>/);

    const llmsRes = await fetch(`${base}/api?__path=/llms.txt`);
    assert.equal(llmsRes.status, 200);
    const llmsBody = await llmsRes.text();
    assert.match(llmsBody, /# Portofolio Ibrahim Abdullah — Parepare/);
    assert.match(llmsBody, /Parepare/);

    const sampleTemplate =
      loadHtmlTemplate() ||
      '<!doctype html><html><head><meta name="seo-head-start" content="1" /><title>Old</title><meta name="seo-head-end" content="1" /></head><body><div id="root"></div><noscript>Old</noscript></body></html>';
    const customContent = structuredClone(savedAudio.body);
    customContent.profile.name = 'Ibrahim Abdullah';
    customContent.profile.email = 'contact@ibrahimabdullah.biz.id';
    customContent.education[0].school = 'Kampus Resmi Test';
    const rendered = renderDocumentHtml({
      templateHtml: sampleTemplate,
      content: customContent,
      pathname: '/',
    });
    assert.equal(rendered.statusCode, 200);
    const modScriptIdx = rendered.html.indexOf('<script type="module"');
    const seoHead = modScriptIdx !== -1 ? rendered.html.slice(0, modScriptIdx) : rendered.html;
    const seoNoscript = rendered.html.slice(rendered.html.lastIndexOf('<noscript>'));
    assert.match(seoHead, /window\.__INITIAL_CONTENT__=/);
    assert.match(seoHead, /Portofolio Ibrahim Abdullah — Full Stack Developer, Parepare/);
    assert.match(seoHead, /Kampus Resmi Test/);
    assert.doesNotMatch(seoHead, /Universitas Nusantara/);
    assert.match(seoNoscript, /Kampus Resmi Test/);
    assert.doesNotMatch(seoNoscript, /Universitas Nusantara/);
    assert.match(seoHead, /contact@ibrahimabdullah\.biz\.id/);

    const missingRoute = renderDocumentHtml({
      templateHtml: sampleTemplate,
      content: customContent,
      pathname: '/tidak-ada',
    });
    assert.equal(missingRoute.statusCode, 404);
    assert.match(missingRoute.html, /noindex, follow/);

    if (loadHtmlTemplate()) {
      const ssrHome = await fetch(`${base}/api?__path=/`);
      assert.equal(ssrHome.status, 200);
      assert.match(ssrHome.headers.get('content-type') || '', /text\/html/);
      assert.match(ssrHome.headers.get('cache-control') || '', /no-store/);
      const ssrHtml = await ssrHome.text();
      assert.match(ssrHtml, /window\.__INITIAL_CONTENT__=/);
      assert.match(ssrHtml, /Vercel Test User/);
    }
  } finally {
    await new Promise((done) => server.close(done));
    rmSync(vercelTmp, { recursive: true, force: true });
  }
});
