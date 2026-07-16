// src/server.ts
import express from 'express';
import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';

const require = createRequire(import.meta.url);
const app = express();
const angularApp = new AngularNodeAppEngine();
const browserDistFolder = join(import.meta.dirname, '../browser');

app.set('etag', false);
app.use(express.json());            // for POST /refresh JSON bodies

// Serve static browser assets (JS/CSS bundles, favicon, etc.) before SSR
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

// --- DB setup (ESM-safe) ---
const DATA_DIR = join(process.cwd(), 'data');
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = join(DATA_DIR, 'arenaq.db');

let _db: any | null = null;
function getDb() {
  if (_db) return _db;
  const BetterSqlite3 = require('better-sqlite3');
  const db = new BetterSqlite3(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS recent_3v3 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rank INT, rating INT, name TEXT, realm_slug TEXT, faction TEXT, class_id INT,
      played INT, won INT, lost INT,
      updated_at TEXT
    );
  `);
  _db = db;
  return _db;
}

// --- helpers ---
function mapEntry(e: any) {
  return {
    rank: e.rank ?? null,
    rating: e.rating ?? null,
    name: e.name ?? e.character?.name ?? null,
    realm_slug: e.realm?.slug ?? e.character?.realm?.slug ?? null,
    faction: e.faction?.type ?? e.faction ?? null,
    class_id: e.class?.id ?? e.class_id ?? null,
    played: e.season_match_statistics?.played ?? e.played ?? null,
    won: e.season_match_statistics?.won ?? e.won ?? null,
    lost: e.season_match_statistics?.lost ?? e.lost ?? null,
  };
}

function replaceAll(entries: any[]) {
  const db = getDb();
  const clear = db.prepare('DELETE FROM recent_3v3');
  const ins = db.prepare(`
    INSERT INTO recent_3v3
    (rank, rating, name, realm_slug, faction, class_id, played, won, lost, updated_at)
    VALUES (@rank, @rating, @name, @realm_slug, @faction, @class_id, @played, @won, @lost, datetime('now'))
  `);
  const tx = db.transaction((rows: any[]) => {
    clear.run();
    for (const r of rows) ins.run(mapEntry(r));
  });
  tx(entries);
}

// --- refresh from external API (server pulls -> DB) ---
async function refreshFromSource(): Promise<{count:number}> {
  const SOURCE_URL = process.env['SOURCE_URL']; // set this to your upstream API
  if (!SOURCE_URL) throw new Error('SOURCE_URL env var not set');

  const resp = await fetch(SOURCE_URL, { headers: { 'Accept': 'application/json' } });
  if (!resp.ok) throw new Error(`Upstream ${resp.status}`);
  const json = await resp.json();

  // Accept either { entries: [...] } or raw array
  const entries = Array.isArray(json) ? json : json.entries ?? [];
  replaceAll(entries);
  return { count: entries.length };
}

// --- ROUTES ---

// 1) Manual refresh by server pulling external API
app.post('/api/mop/3v3/refresh', async (_req, res) => {
  try {
    const { count } = await refreshFromSource();
    res.json({ ok: true, count });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message ?? 'refresh failed' });
  }
});

// 2) Manual refresh by client pushing payload (fallback if you don’t want SOURCE_URL)
app.post('/api/mop/3v3/ingest', (req, res) => {
  try {
    const entries = Array.isArray(req.body) ? req.body : req.body?.entries ?? [];
    replaceAll(entries);
    res.json({ ok: true, count: entries.length });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message ?? 'ingest failed' });
  }
});

// 3) Read for UI
app.get('/api/mop/3v3/recent', (_req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const db = getDb();
    const rows = db.prepare(`
      SELECT rank, rating, name, realm_slug, faction, class_id, played, won, lost, updated_at
      FROM recent_3v3
      ORDER BY updated_at DESC, rank ASC
      LIMIT 200
    `).all();

    const entries = rows.map((r: any) => ({
      rank: r.rank,
      rating: r.rating,
      name: r.name,
      realm: { slug: r.realm_slug },
      faction: { type: r.faction },
      class: { id: r.class_id },
      season_match_statistics: { played: r.played, won: r.won, lost: r.lost },
    }));

    res.json({
      ok: true,
      meta: { latestSeasonId: 1, lastModified: rows[0]?.updated_at ?? null },
      count: entries.length,
      entries,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message ?? 'DB error' });
  }
});

// Angular SSR LAST
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
    .catch(next);
});

if (isMainModule(import.meta.url)) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, () => console.log(`✅ Server listening on http://localhost:${port}`));
  console.log('DB_PATH =', DB_PATH);
}

export const reqHandler = createNodeRequestHandler(app);