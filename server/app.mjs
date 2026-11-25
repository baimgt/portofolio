import { readFileSync as readLanguageFile } from 'node:fs';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import { randomBytes, randomUUID } from 'node:crypto';
import { verifyPassword, hashPassword } from './crypto.mjs';

const text = (value, max = 5000) => typeof value === 'string' && value.length <= max;
const safeUrl = (value, local = false) =>
  text(value, 2048) &&
  (value === '' ||
    /^https:\/\/[^\s]+$/.test(value) ||
    (local && /^\/(images|uploads)\/[a-zA-Z0-9._/-]+$/.test(value)));
const stringList = (value, max = 30) =>
  Array.isArray(value) && value.length <= max && value.every((item) => text(item, 150));
const projectValid = (p) =>
  p &&
  ['id', 'slug', 'title', 'category', 'year', 'summary', 'description', 'challenge'].every((key) =>
    text(p[key], key === 'description' || key === 'challenge' ? 10000 : 500),
  ) &&
  p.title.trim() &&
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug) &&
  safeUrl(p.image, true) &&
  safeUrl(p.url) &&
  stringList(p.tools) &&
  Array.isArray(p.gallery) &&
  p.gallery.length <= 12 &&
  p.gallery.every((url) => safeUrl(url, true)) &&
  typeof p.featured === 'boolean';
const skillValid = (s) =>
  s &&
  text(s.id, 100) &&
  text(s.title, 200) &&
  s.title.trim() &&
  text(s.description, 3000) &&
  stringList(s.tools);
const educationValid = (item) =>
  item &&
  ['id', 'school', 'degree', 'period', 'location', 'description'].every((key) =>
    text(item[key], key === 'description' ? 3000 : 250),
  ) &&
  item.school.trim() &&
  safeUrl(item.logo, true);
const frameworkValid = (item) =>
  item &&
  ['id', 'name', 'category', 'description', 'symbol'].every((key) =>
    text(item[key], key === 'description' ? 3000 : 200),
  ) &&
  item.name.trim() &&
  safeUrl(item.logo, true);

const LANGUAGE_CODES = new Set(
  JSON.parse(readLanguageFile(new URL('../shared/languages.json', import.meta.url), 'utf8')).map(
    ([code]) => code,
  ),
);

function hasValidImageMagicBytes(buffer, mimetype) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;
  if (mimetype === 'image/png') {
    return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  }
  if (mimetype === 'image/jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimetype === 'image/webp') {
    return buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  if (mimetype === 'image/avif') {
    return buffer.subarray(4, 8).toString('ascii') === 'ftyp';
  }
  return false;
}

const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

let sharpLoader;
async function loadSharp() {
  if (sharpLoader === undefined) {
    sharpLoader = import('sharp')
      .then((mod) => mod.default || mod)
      .catch(() => null);
  }
  return sharpLoader;
}

export function attachApiErrorHandler(app) {
  app.use((error, _req, res, _next) => {
    console.error(error?.message || error);
    res.status(error instanceof multer.MulterError ? 400 : 500).json({
      error:
        error instanceof multer.MulterError
          ? 'Gambar terlalu besar. Maksimal 5 MB.'
          : 'Terjadi kesalahan server. Silakan coba lagi.',
    });
  });
}

export async function createExpressApp({
  storage,
  production = process.env.NODE_ENV === 'production',
  maxUploadBytes = 5 * 1024 * 1024,
}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: production
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: [
                "'self'",
                "'unsafe-inline'",
                'https://translate.google.com',
                'https://translate.googleapis.com',
                'https://www.gstatic.com',
              ],
              styleSrc: [
                "'self'",
                "'unsafe-inline'",
                'https://translate.googleapis.com',
                'https://www.gstatic.com',
              ],
              frameSrc: ['https://translate.google.com'],
              imgSrc: ["'self'", 'https:', 'data:', 'blob:'],
              fontSrc: ["'self'", 'data:'],
              connectSrc: ["'self'", 'https://translate.googleapis.com', 'https://translate.google.com'],
              objectSrc: ["'none'"],
              baseUri: ["'self'"],
              frameAncestors: ["'none'"],
              upgradeInsecureRequests: null,
            },
          }
        : false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(express.json({ limit: '512kb' }));
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(
    '/api',
    session({
      name: 'portfolio.sid',
      secret: storage.secret,
      store: storage.store,
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, sameSite: 'lax', secure: 'auto', maxAge: 8 * 60 * 60 * 1000 },
    }),
  );

  // Origin checks and a session-bound token protect authenticated mutations.
  app.use('/api', (req, res, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    const origin = req.get('origin');
    const expectedHost = req.get('x-forwarded-host') || req.get('host');
    if (origin) {
      try {
        if (new URL(origin).host !== expectedHost)
          return res.status(403).json({ error: 'Origin tidak diizinkan.' });
      } catch {
        return res.status(403).json({ error: 'Origin tidak valid.' });
      }
    }
    if (req.path === '/messages') return next();
    if (!req.session.csrfToken || req.get('X-CSRF-Token') !== req.session.csrfToken)
      return res.status(403).json({ error: 'Sesi keamanan berakhir. Muat ulang halaman.' });
    next();
  });

  const getAdmin = async (req) =>
    req.session.adminId ? await storage.findAdminById(req.session.adminId) : null;
  const requireAdmin = async (req, res, next) => {
    const admin = await getAdmin(req);
    if (!admin) return res.status(401).json({ error: 'Silakan login terlebih dahulu.' });
    if (admin.must_change)
      return res.status(403).json({ error: 'Wajib mengganti password sebelum mengelola konten.' });
    next();
  };
  const authResponse = async (req) => {
    if (!req.session.csrfToken) req.session.csrfToken = randomBytes(32).toString('hex');
    const admin = await getAdmin(req);
    return {
      authenticated: !!admin,
      username: admin?.username,
      mustChangePassword: !!admin?.must_change,
      csrfToken: req.session.csrfToken,
      storageMode: storage.mode,
      persistent: storage.persistent,
    };
  };

  app.get('/api/health', (_req, res) =>
    res.json({ ok: true, storage: storage.mode, persistent: storage.persistent }),
  );
  app.get('/api/content', async (_req, res) => res.json(await storage.getContent()));
  app.get('/api/auth/me', async (req, res) => res.json(await authResponse(req)));

  const loginLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 15,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { error: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.' },
  });

  app.post('/api/auth/login', loginLimit, async (req, res, next) => {
    const { username, password } = req.body || {};
    const admin = text(username, 100) ? await storage.findAdminByUsername(username) : null;
    if (!admin || !verifyPassword(password, admin.password))
      return res.status(401).json({ error: 'Username atau password salah.' });
    req.session.regenerate(async (error) => {
      if (error) return next(error);
      req.session.adminId = admin.id;
      res.json(await authResponse(req));
    });
  });

  app.post('/api/auth/password', loginLimit, async (req, res) => {
    const admin = await getAdmin(req);
    if (!admin) return res.status(401).json({ error: 'Silakan login terlebih dahulu.' });
    const currentHash = await storage.getAdminPasswordById(admin.id);
    const { currentPassword, newPassword } = req.body || {};
    if (!verifyPassword(currentPassword, currentHash))
      return res.status(400).json({ error: 'Password saat ini tidak benar.' });
    if (
      !text(newPassword, 128) ||
      newPassword.length < 10 ||
      !/[A-Za-z]/.test(newPassword) ||
      !/[0-9]/.test(newPassword) ||
      newPassword === currentPassword
    )
      return res.status(400).json({
        error: 'Gunakan minimal 10 karakter, dengan huruf dan angka, berbeda dari password lama.',
      });
    await storage.updateAdminPassword(admin.id, hashPassword(newPassword), req.sessionID);
    req.session.csrfToken = randomBytes(32).toString('hex');
    res.json(await authResponse(req));
  });

  app.post('/api/auth/logout', (req, res) =>
    req.session.destroy(() => {
      res.clearCookie('portfolio.sid');
      res.json({ ok: true });
    }),
  );

  app.use('/api/admin', requireAdmin);

  app.put('/api/admin/content', async (req, res) => {
    const { profile, pages, skills } = req.body || {};
    const current = await storage.getContent();
    const card = req.body?.card ?? current.card;
    const copy = req.body?.copy ?? current.copy;
    const education = req.body?.education ?? current.education;
    const frameworks = req.body?.frameworks ?? current.frameworks;
    const settings = req.body?.settings ?? current.settings;
    const profileKeys = Object.keys(current.profile).filter((key) => key !== 'available');
    if (
      !settings ||
      typeof settings.languageMode !== 'boolean' ||
      !LANGUAGE_CODES.has(settings.language) ||
      !profile ||
      !pages ||
      !profileKeys.every((key) => text(profile[key], 6000)) ||
      !profile.name.trim() ||
      !profile.firstName.trim() ||
      !profile.brand.trim() ||
      typeof profile.available !== 'boolean' ||
      !safeUrl(profile.portrait, true) ||
      !safeUrl(profile.portraitHover, true) ||
      !['github', 'instagram', 'linkedin'].every((key) => safeUrl(profile[key])) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email) ||
      !Object.keys(current.pages).every((key) => text(pages[key], 6000)) ||
      !Array.isArray(skills) ||
      skills.length > 30 ||
      !skills.every(skillValid) ||
      !card ||
      !Object.keys(current.card).every((key) => text(card[key], 6000)) ||
      !['portrait', 'portraitHover', 'signatureImage', 'logoImage'].every((key) =>
        safeUrl(card[key], true),
      ) ||
      !['accentColor', 'paperColor'].every((key) => /^#[a-fA-F0-9]{6}$/.test(card[key])) ||
      !copy ||
      !Object.keys(current.copy).every((key) => text(copy[key], 6000)) ||
      !Array.isArray(education) ||
      education.length > 30 ||
      !education.every(educationValid) ||
      !Array.isArray(frameworks) ||
      frameworks.length > 40 ||
      !frameworks.every(frameworkValid)
    )
      return res
        .status(400)
        .json({ error: 'Konten tidak valid. Periksa nama, email, URL, dan isian lainnya.' });

    const cleanProfile = Object.fromEntries(
      Object.keys(current.profile).map((key) => [key, profile[key]]),
    );
    const cleanPages = Object.fromEntries(
      Object.keys(current.pages).map((key) => [key, pages[key]]),
    );
    const cleanCard = Object.fromEntries(Object.keys(current.card).map((key) => [key, card[key]]));
    const cleanCopy = Object.fromEntries(Object.keys(current.copy).map((key) => [key, copy[key]]));
    res.json(
      await storage.saveContent({
        ...current,
        profile: cleanProfile,
        pages: cleanPages,
        skills,
        card: cleanCard,
        copy: cleanCopy,
        settings: { languageMode: settings.languageMode, language: settings.language },
        education,
        frameworks,
      }),
    );
  });

  app.post('/api/admin/projects', async (req, res) => {
    const content = await storage.getContent();
    const project = { ...req.body, id: randomUUID() };
    if (!projectValid(project))
      return res.status(400).json({
        error: 'Project tidak valid. Judul, slug, gambar, dan deskripsi wajib diisi dengan benar.',
      });
    if (content.projects.some((p) => p.slug === project.slug))
      return res.status(409).json({ error: 'Slug project sudah digunakan.' });
    content.projects.unshift(project);
    await storage.saveContent(content);
    res.status(201).json(project);
  });

  app.put('/api/admin/projects/:id', async (req, res) => {
    const content = await storage.getContent();
    const index = content.projects.findIndex((p) => p.id === req.params.id);
    if (index < 0) return res.status(404).json({ error: 'Project tidak ditemukan.' });
    const project = { ...req.body, id: req.params.id };
    if (!projectValid(project))
      return res.status(400).json({ error: 'Periksa kembali isian project dan format URL.' });
    if (content.projects.some((p) => p.slug === project.slug && p.id !== project.id))
      return res.status(409).json({ error: 'Slug project sudah digunakan.' });
    content.projects[index] = project;
    await storage.saveContent(content);
    res.json(project);
  });

  app.delete('/api/admin/projects/:id', async (req, res) => {
    const content = await storage.getContent();
    if (!content.projects.some((p) => p.id === req.params.id))
      return res.status(404).json({ error: 'Project tidak ditemukan.' });
    content.projects = content.projects.filter((p) => p.id !== req.params.id);
    await storage.saveContent(content);
    res.json({ ok: true });
  });

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxUploadBytes, files: 1 },
    fileFilter: (_req, file, cb) =>
      cb(null, ['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.mimetype)),
  });

  app.post('/api/admin/upload', upload.single('image'), async (req, res) => {
    if (!req.file)
      return res
        .status(400)
        .json({ error: 'Pilih gambar JPG, PNG, WebP, atau AVIF (maksimal 5 MB).' });
    try {
      const sharpFn = await loadSharp();
      if (sharpFn) {
        const processed = await sharpFn(req.file.buffer, {
          limitInputPixels: 25000000,
          animated: false,
        })
          .rotate()
          .resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 85 })
          .toBuffer();
        const filename = `${randomUUID()}.webp`;
        const url = await storage.saveUpload(filename, 'image/webp', processed);
        return res.status(201).json({ url });
      }
      if (!hasValidImageMagicBytes(req.file.buffer, req.file.mimetype)) {
        return res.status(400).json({ error: 'File gambar tidak valid.' });
      }
      const ext = MIME_EXT[req.file.mimetype] || 'png';
      const filename = `${randomUUID()}.${ext}`;
      const url = await storage.saveUpload(filename, req.file.mimetype, req.file.buffer);
      return res.status(201).json({ url });
    } catch {
      res.status(400).json({
        error:
          'Gambar tidak dapat diproses. Gunakan gambar statis yang valid, maksimal 25 megapiksel.',
      });
    }
  });

  app.get('/api/admin/messages', async (_req, res) => res.json(await storage.listMessages()));
  app.patch('/api/admin/messages/:id', async (req, res) => {
    await storage.markMessageRead(req.params.id);
    res.json({ ok: true });
  });
  app.delete('/api/admin/messages/:id', async (req, res) => {
    await storage.deleteMessage(req.params.id);
    res.json({ ok: true });
  });

  const messageLimit = rateLimit({
    windowMs: 60000,
    limit: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Tunggu sebentar sebelum mengirim pesan lagi.' },
  });

  app.post('/api/messages', messageLimit, async (req, res) => {
    const { name, email, message, website } = req.body || {};
    if (website) return res.status(201).json({ ok: true });
    if (
      !text(name, 150) ||
      name.trim().length < 2 ||
      !text(email, 254) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !text(message, 5000) ||
      message.trim().length < 10
    )
      return res
        .status(400)
        .json({ error: 'Isi nama, email yang valid, dan pesan minimal 10 karakter.' });
    await storage.createMessage({
      name: name.trim(),
      email: email.trim(),
      message: message.trim(),
      createdAt: new Date().toISOString(),
    });
    res.status(201).json({ ok: true });
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan.' }));

  if (storage.uploadsDir) {
    app.use(
      '/uploads',
      express.static(storage.uploadsDir, {
        maxAge: '1y',
        immutable: true,
        dotfiles: 'deny',
        setHeaders: (res) => res.set('X-Content-Type-Options', 'nosniff'),
      }),
    );
  } else if (storage.getUpload) {
    app.get('/uploads/:filename', async (req, res) => {
      const { filename } = req.params;
      if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
        return res.status(400).end();
      }
      const file = await storage.getUpload(filename);
      if (!file) return res.status(404).end();
      res.setHeader('Content-Type', file.mime);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.send(file.buffer);
    });
  }

  return app;
}
