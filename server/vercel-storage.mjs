import session from 'express-session';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import { hashPassword } from './crypto.mjs';

const require = createRequire(import.meta.url);
const seedContent = require('../shared/content.json');

function migrateContent(seed, saved) {
  return {
    ...seed,
    ...saved,
    profile: { ...seed.profile, ...saved.profile },
    pages: { ...seed.pages, ...saved.pages },
    card: { ...seed.card, ...saved.card },
    copy: { ...seed.copy, ...saved.copy },
    settings: { ...seed.settings, ...saved.settings },
  };
}

function defaultAdminRow() {
  return {
    id: 1,
    username: 'admin',
    password: hashPassword(process.env.INITIAL_ADMIN_PASSWORD || 'admin'),
    must_change: 0,
  };
}

// ============================================================
// 1. Postgres Adapter (Neon / Supabase / Vercel Marketplace)
// ============================================================
async function createPostgresStorage(rawConnectionString) {
  const localDb =
    rawConnectionString.includes('localhost') || rawConnectionString.includes('127.0.0.1');
  let cleanConnectionString = rawConnectionString.trim();
  let useSsl = localDb ? false : { rejectUnauthorized: false };
  try {
    const parsedUrl = new URL(cleanConnectionString);
    if (parsedUrl.searchParams.get('sslmode') === 'disable') {
      useSsl = false;
    }
    parsedUrl.searchParams.delete('sslmode');
    parsedUrl.searchParams.delete('uselibpqcompat');
    cleanConnectionString = parsedUrl.toString();
  } catch {
    // Keep original connection string if URL parsing fails.
  }
  const pool = new Pool({
    connectionString: cleanConnectionString,
    max: 5,
    connectionTimeoutMillis: 8000,
    ssl: useSsl,
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS portfolio_content (
      id INTEGER PRIMARY KEY,
      document JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS portfolio_admins (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      must_change INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS portfolio_sessions (
      sid TEXT PRIMARY KEY,
      document JSONB NOT NULL,
      expires BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS portfolio_messages (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS portfolio_uploads (
      filename TEXT PRIMARY KEY,
      mime TEXT NOT NULL,
      data_base64 TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS portfolio_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const existingContent = await pool.query(
    'SELECT document FROM portfolio_content WHERE id = 1',
  );
  if (!existingContent.rows.length) {
    await pool.query(
      'INSERT INTO portfolio_content (id, document, updated_at) VALUES (1, $1::jsonb, NOW())',
      [JSON.stringify(seedContent)],
    );
  } else {
    const saved = existingContent.rows[0].document;
    const migrated = migrateContent(seedContent, saved);
    if (JSON.stringify(migrated) !== JSON.stringify(saved)) {
      await pool.query(
        'UPDATE portfolio_content SET document = $1::jsonb, updated_at = NOW() WHERE id = 1',
        [JSON.stringify(migrated)],
      );
    }
  }

  const existingAdmin = await pool.query('SELECT id FROM portfolio_admins LIMIT 1');
  if (!existingAdmin.rows.length) {
    await pool.query(
      'INSERT INTO portfolio_admins (username, password, must_change) VALUES ($1, $2, 0)',
      ['admin', hashPassword(process.env.INITIAL_ADMIN_PASSWORD || 'admin')],
    );
  }

  let secret = process.env.SESSION_SECRET;
  if (!secret) {
    const row = await pool.query(
      "SELECT value FROM portfolio_meta WHERE key = 'session_secret'",
    );
    if (row.rows.length) {
      secret = row.rows[0].value;
    } else {
      secret = randomBytes(48).toString('hex');
      await pool.query(
        "INSERT INTO portfolio_meta (key, value) VALUES ('session_secret', $1) ON CONFLICT (key) DO NOTHING",
        [secret],
      );
      const reread = await pool.query(
        "SELECT value FROM portfolio_meta WHERE key = 'session_secret'",
      );
      if (reread.rows.length) secret = reread.rows[0].value;
    }
  }

  class PostgresSessions extends session.Store {
    get(sid, callback) {
      pool
        .query('SELECT document FROM portfolio_sessions WHERE sid = $1 AND expires > $2', [
          sid,
          Date.now(),
        ])
        .then((res) => callback(null, res.rows.length ? res.rows[0].document : null))
        .catch((err) => callback(err));
    }
    set(sid, value, callback = () => {}) {
      const expires = value.cookie?.expires
        ? new Date(value.cookie.expires).getTime()
        : Date.now() + 28800000;
      pool
        .query(
          'INSERT INTO portfolio_sessions (sid, document, expires) VALUES ($1, $2::jsonb, $3) ON CONFLICT (sid) DO UPDATE SET document = EXCLUDED.document, expires = EXCLUDED.expires',
          [sid, JSON.stringify(value), expires],
        )
        .then(() => callback(null))
        .catch((err) => callback(err));
    }
    destroy(sid, callback = () => {}) {
      pool
        .query('DELETE FROM portfolio_sessions WHERE sid = $1', [sid])
        .then(() => callback(null))
        .catch((err) => callback(err));
    }
    touch(sid, value, callback = () => {}) {
      this.set(sid, value, callback);
    }
  }

  return {
    mode: 'postgres',
    persistent: true,
    secret,
    store: new PostgresSessions(),
    getContent: async () => {
      const res = await pool.query('SELECT document FROM portfolio_content WHERE id = 1');
      return res.rows[0].document;
    },
    saveContent: async (content) => {
      await pool.query(
        'UPDATE portfolio_content SET document = $1::jsonb, updated_at = NOW() WHERE id = 1',
        [JSON.stringify(content)],
      );
      return content;
    },
    findAdminByUsername: async (username) => {
      const res = await pool.query('SELECT * FROM portfolio_admins WHERE username = $1', [
        username,
      ]);
      return res.rows[0] || null;
    },
    findAdminById: async (id) => {
      const res = await pool.query(
        'SELECT id, username, must_change FROM portfolio_admins WHERE id = $1',
        [id],
      );
      return res.rows[0] || null;
    },
    getAdminPasswordById: async (id) => {
      const res = await pool.query('SELECT password FROM portfolio_admins WHERE id = $1', [id]);
      return res.rows[0]?.password || null;
    },
    updateAdminPassword: async (id, nextHash, keepSid) => {
      await pool.query('UPDATE portfolio_admins SET password = $1, must_change = 0 WHERE id = $2', [
        nextHash,
        id,
      ]);
      await pool.query('DELETE FROM portfolio_sessions WHERE sid != $1', [keepSid]);
    },
    listMessages: async () => {
      const res = await pool.query('SELECT * FROM portfolio_messages ORDER BY id DESC');
      return res.rows;
    },
    createMessage: async ({ name, email, message, createdAt }) => {
      await pool.query(
        'INSERT INTO portfolio_messages (name, email, message, created_at) VALUES ($1, $2, $3, $4)',
        [name, email, message, createdAt],
      );
    },
    markMessageRead: async (id) => {
      await pool.query('UPDATE portfolio_messages SET is_read = 1 WHERE id = $1', [id]);
    },
    deleteMessage: async (id) => {
      await pool.query('DELETE FROM portfolio_messages WHERE id = $1', [id]);
    },
    saveUpload: async (filename, mime, buffer) => {
      await pool.query(
        'INSERT INTO portfolio_uploads (filename, mime, data_base64) VALUES ($1, $2, $3) ON CONFLICT (filename) DO UPDATE SET mime = EXCLUDED.mime, data_base64 = EXCLUDED.data_base64',
        [filename, mime, buffer.toString('base64')],
      );
      return `/uploads/${filename}`;
    },
    getUpload: async (filename) => {
      const res = await pool.query(
        'SELECT mime, data_base64 FROM portfolio_uploads WHERE filename = $1',
        [filename],
      );
      if (!res.rows.length) return null;
      return {
        mime: res.rows[0].mime,
        buffer: Buffer.from(res.rows[0].data_base64, 'base64'),
      };
    },
    close: async () => {
      await pool.end();
    },
  };
}

// ============================================================
// 2. Upstash Redis / Vercel KV REST Adapter
// ============================================================
async function createKvStorage(restUrl, restToken) {
  const endpoint = restUrl.replace(/\/$/, '');
  const cmd = async (...args) => {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${restToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    });
    if (!res.ok) {
      throw new Error(`KV request failed (${res.status})`);
    }
    const payload = await res.json();
    if (payload.error) throw new Error(payload.error);
    return payload.result;
  };

  const getJson = async (key) => {
    const raw = await cmd('GET', key);
    return raw ? JSON.parse(raw) : null;
  };
  const setJson = async (key, value, ttlSeconds) => {
    const encoded = JSON.stringify(value);
    if (ttlSeconds) {
      await cmd('SET', key, encoded, 'EX', String(Math.max(60, Math.ceil(ttlSeconds))));
    } else {
      await cmd('SET', key, encoded);
    }
  };

  const existingContent = await getJson('portfolio:content');
  if (!existingContent) {
    await setJson('portfolio:content', seedContent);
  } else {
    const migrated = migrateContent(seedContent, existingContent);
    if (JSON.stringify(migrated) !== JSON.stringify(existingContent)) {
      await setJson('portfolio:content', migrated);
    }
  }

  const existingAdmins = await getJson('portfolio:admins');
  if (!Array.isArray(existingAdmins) || !existingAdmins.length) {
    await setJson('portfolio:admins', [defaultAdminRow()]);
  }

  let secret = process.env.SESSION_SECRET || (await cmd('GET', 'portfolio:session_secret'));
  if (!secret) {
    secret = randomBytes(48).toString('hex');
    await cmd('SET', 'portfolio:session_secret', secret);
  }

  class KvSessions extends session.Store {
    get(sid, callback) {
      getJson(`portfolio:sess:${sid}`)
        .then((data) => callback(null, data))
        .catch((err) => callback(err));
    }
    set(sid, value, callback = () => {}) {
      const expires = value.cookie?.expires
        ? new Date(value.cookie.expires).getTime()
        : Date.now() + 28800000;
      const ttlSeconds = Math.max(60, Math.ceil((expires - Date.now()) / 1000));
      setJson(`portfolio:sess:${sid}`, value, ttlSeconds)
        .then(() => callback(null))
        .catch((err) => callback(err));
    }
    destroy(sid, callback = () => {}) {
      cmd('DEL', `portfolio:sess:${sid}`)
        .then(() => callback(null))
        .catch((err) => callback(err));
    }
    touch(sid, value, callback = () => {}) {
      this.set(sid, value, callback);
    }
  }

  return {
    mode: 'kv',
    persistent: true,
    secret,
    store: new KvSessions(),
    getContent: async () => (await getJson('portfolio:content')) || seedContent,
    saveContent: async (content) => {
      await setJson('portfolio:content', content);
      return content;
    },
    findAdminByUsername: async (username) => {
      const admins = (await getJson('portfolio:admins')) || [];
      return admins.find((a) => a.username === username) || null;
    },
    findAdminById: async (id) => {
      const admins = (await getJson('portfolio:admins')) || [];
      const found = admins.find((a) => a.id === id);
      return found ? { id: found.id, username: found.username, must_change: found.must_change } : null;
    },
    getAdminPasswordById: async (id) => {
      const admins = (await getJson('portfolio:admins')) || [];
      return admins.find((a) => a.id === id)?.password || null;
    },
    updateAdminPassword: async (id, nextHash) => {
      const admins = (await getJson('portfolio:admins')) || [];
      const updated = admins.map((a) =>
        a.id === id ? { ...a, password: nextHash, must_change: 0 } : a,
      );
      await setJson('portfolio:admins', updated);
    },
    listMessages: async () => (await getJson('portfolio:messages')) || [],
    createMessage: async ({ name, email, message, createdAt }) => {
      const list = (await getJson('portfolio:messages')) || [];
      const nextId = list.reduce((max, item) => Math.max(max, item.id || 0), 0) + 1;
      list.unshift({ id: nextId, name, email, message, created_at: createdAt, is_read: 0 });
      await setJson('portfolio:messages', list);
    },
    markMessageRead: async (id) => {
      const list = (await getJson('portfolio:messages')) || [];
      const numericId = Number(id);
      await setJson(
        'portfolio:messages',
        list.map((m) => (m.id === numericId ? { ...m, is_read: 1 } : m)),
      );
    },
    deleteMessage: async (id) => {
      const list = (await getJson('portfolio:messages')) || [];
      const numericId = Number(id);
      await setJson(
        'portfolio:messages',
        list.filter((m) => m.id !== numericId),
      );
    },
    saveUpload: async (filename, mime, buffer) => {
      await setJson(`portfolio:upload:${filename}`, { mime, dataBase64: buffer.toString('base64') });
      return `/uploads/${filename}`;
    },
    getUpload: async (filename) => {
      const record = await getJson(`portfolio:upload:${filename}`);
      if (!record) return null;
      return { mime: record.mime, buffer: Buffer.from(record.dataBase64, 'base64') };
    },
    close: async () => {},
  };
}

// ============================================================
// 3. Temporary /tmp JSON Fallback (Zero-config Vercel deploy)
// ============================================================
function createTemporaryStorage(baseDir = join(tmpdir(), 'portfolio-vercel')) {
  mkdirSync(baseDir, { recursive: true });
  const storeFile = join(baseDir, 'store.json');
  const uploadsDir = join(baseDir, 'uploads');
  mkdirSync(uploadsDir, { recursive: true });

  const load = () => {
    if (existsSync(storeFile)) {
      try {
        return JSON.parse(readFileSync(storeFile, 'utf8'));
      } catch {
        // Recreate below if corrupted.
      }
    }
    const fresh = {
      content: seedContent,
      admins: [defaultAdminRow()],
      messages: [],
      uploads: {},
      sessions: {},
      secret: process.env.SESSION_SECRET || randomBytes(48).toString('hex'),
    };
    writeFileSync(storeFile, JSON.stringify(fresh));
    return fresh;
  };

  let state = load();
  const persist = () => {
    try {
      writeFileSync(storeFile, JSON.stringify(state));
    } catch {
      // Keep in memory if /tmp write fails.
    }
  };

  class TmpSessions extends session.Store {
    get(sid, callback) {
      state = load();
      const entry = state.sessions[sid];
      if (!entry || entry.expires <= Date.now()) {
        callback(null, null);
        return;
      }
      callback(null, entry.document);
    }
    set(sid, value, callback = () => {}) {
      const expires = value.cookie?.expires
        ? new Date(value.cookie.expires).getTime()
        : Date.now() + 28800000;
      state.sessions[sid] = { document: value, expires };
      persist();
      callback(null);
    }
    destroy(sid, callback = () => {}) {
      delete state.sessions[sid];
      persist();
      callback(null);
    }
    touch(sid, value, callback = () => {}) {
      this.set(sid, value, callback);
    }
  }

  return {
    mode: 'temporary',
    persistent: false,
    secret: process.env.SESSION_SECRET || state.secret,
    store: new TmpSessions(),
    getContent: () => state.content,
    saveContent: (content) => {
      state.content = content;
      persist();
      return content;
    },
    findAdminByUsername: (username) =>
      state.admins.find((a) => a.username === username) || null,
    findAdminById: (id) => {
      const found = state.admins.find((a) => a.id === id);
      return found ? { id: found.id, username: found.username, must_change: found.must_change } : null;
    },
    getAdminPasswordById: (id) =>
      state.admins.find((a) => a.id === id)?.password || null,
    updateAdminPassword: (id, nextHash, keepSid) => {
      state.admins = state.admins.map((a) =>
        a.id === id ? { ...a, password: nextHash, must_change: 0 } : a,
      );
      for (const sid of Object.keys(state.sessions)) {
        if (sid !== keepSid) delete state.sessions[sid];
      }
      persist();
    },
    listMessages: () => state.messages,
    createMessage: ({ name, email, message, createdAt }) => {
      const nextId = state.messages.reduce((max, item) => Math.max(max, item.id || 0), 0) + 1;
      state.messages.unshift({ id: nextId, name, email, message, created_at: createdAt, is_read: 0 });
      persist();
    },
    markMessageRead: (id) => {
      const numericId = Number(id);
      state.messages = state.messages.map((m) =>
        m.id === numericId ? { ...m, is_read: 1 } : m,
      );
      persist();
    },
    deleteMessage: (id) => {
      const numericId = Number(id);
      state.messages = state.messages.filter((m) => m.id !== numericId);
      persist();
    },
    saveUpload: (filename, mime, buffer) => {
      writeFileSync(join(uploadsDir, filename), buffer);
      state.uploads = state.uploads || {};
      state.uploads[filename] = mime;
      persist();
      return `/uploads/${filename}`;
    },
    getUpload: (filename) => {
      const filePath = join(uploadsDir, filename);
      if (!existsSync(filePath)) return null;
      return {
        mime: state.uploads?.[filename] || 'image/webp',
        buffer: readFileSync(filePath),
      };
    },
    close: () => {},
  };
}

export async function createVercelStorage() {
  const pgUrl =
    process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL;
  if (pgUrl) {
    return createPostgresStorage(pgUrl);
  }
  const kvUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const kvToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (kvUrl && kvToken) {
    return createKvStorage(kvUrl, kvToken);
  }
  return createTemporaryStorage();
}
