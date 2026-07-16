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
  const faction = e.faction?.type ?? e.faction ?? null;
  return {
    rank: e.rank ?? null,
    rating: e.rating ?? null,
    name: e.name ?? e.character?.name ?? null,
    realm_slug: e.realm?.slug ?? e.character?.realm?.slug ?? null,
    faction: faction ? String(faction).toLowerCase() : null,
    class_id: e.class?.id ?? e.character?.playable_class?.id ?? e.class_id ?? null,
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

// --- Blizzard Battle.net API (MoP Classic 3v3 PvP leaderboard) ---
// Requires a client ID/secret from https://develop.battle.net/access/clients
const BLIZZARD_REGION = (process.env['BLIZZARD_REGION'] || 'us').toLowerCase();
const BLIZZARD_LOCALE = process.env['BLIZZARD_LOCALE'] || 'en_US';
// Blizzard's own namespace docs list "dynamic-classic-{region}" for MoP Classic (Progression),
// but that namespace 404s on every pvp-region/pvp-season endpoint in practice. The Classic
// Progression realms (which have moved through Vanilla -> ... -> MoP) actually live under
// "classic1x" — confirmed by hitting both against the live API.
const BLIZZARD_NAMESPACE = `dynamic-classic1x-${BLIZZARD_REGION}`;
const BLIZZARD_API_HOST =
  BLIZZARD_REGION === 'cn' ? 'https://gateway.battlenet.com.cn' : `https://${BLIZZARD_REGION}.api.blizzard.com`;
// pvp-region/index doesn't reliably resolve for every region; these are the known values.
const KNOWN_PVP_REGION_IDS: Record<string, number> = { us: 1, eu: 0 };

let _token: { value: string; expiresAt: number } | null = null;
async function getBlizzardToken(): Promise<string> {
  if (_token && Date.now() < _token.expiresAt - 60_000) return _token.value;

  const clientId = process.env['BLIZZARD_CLIENT_ID'];
  const clientSecret = process.env['BLIZZARD_CLIENT_SECRET'];
  if (!clientId || !clientSecret) {
    throw new Error('BLIZZARD_CLIENT_ID / BLIZZARD_CLIENT_SECRET env vars not set');
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const resp = await fetch('https://oauth.battle.net/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!resp.ok) throw new Error(`Blizzard OAuth token request failed: ${resp.status}`);
  const json: any = await resp.json();
  _token = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return _token.value;
}

async function blizzardGet(path: string): Promise<any> {
  const token = await getBlizzardToken();
  const url = new URL(BLIZZARD_API_HOST + path);
  url.searchParams.set('namespace', BLIZZARD_NAMESPACE);
  url.searchParams.set('locale', BLIZZARD_LOCALE);

  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) throw new Error(`Blizzard API ${path} -> ${resp.status}`);
  return resp.json();
}

async function resolvePvpRegionId(): Promise<number> {
  const override = process.env['BLIZZARD_PVP_REGION_ID'];
  if (override) return Number(override);

  try {
    const index = await blizzardGet('/data/wow/pvp-region/index');
    const id = index?.regions?.[0]?.id;
    if (typeof id === 'number') return id;
  } catch {
    // pvp-region/index is unreliable for some regions; fall through to known map.
  }

  const known = KNOWN_PVP_REGION_IDS[BLIZZARD_REGION];
  if (known === undefined) {
    throw new Error(
      `Could not resolve pvpRegionId for region "${BLIZZARD_REGION}" — set BLIZZARD_PVP_REGION_ID explicitly.`
    );
  }
  return known;
}

async function resolvePvpSeasonId(pvpRegionId: number): Promise<number> {
  const override = process.env['BLIZZARD_PVP_SEASON_ID'];
  if (override) return Number(override);

  const seasonIndex = await blizzardGet(`/data/wow/pvp-region/${pvpRegionId}/pvp-season/index`);

  // Classic namespaces return { current_season: { id } } rather than a "seasons" array.
  if (typeof seasonIndex?.current_season?.id === 'number') return seasonIndex.current_season.id;

  const seasons: any[] = seasonIndex?.seasons ?? [];
  if (seasons.length) return Math.max(...seasons.map((s) => s.id));

  throw new Error('No PvP seasons returned by Blizzard API');
}

let _lastSeasonId: number | null = null;

// --- refresh from Blizzard's live API (server pulls -> DB) ---
async function refreshFromSource(): Promise<{ count: number }> {
  const pvpRegionId = await resolvePvpRegionId();
  const pvpSeasonId = await resolvePvpSeasonId(pvpRegionId);

  const leaderboard = await blizzardGet(
    `/data/wow/pvp-region/${pvpRegionId}/pvp-season/${pvpSeasonId}/pvp-leaderboard/3v3`
  );
  const entries = leaderboard?.entries ?? [];
  _lastSeasonId = pvpSeasonId;

  if (!entries.length) {
    // Blizzard's Classic PvP leaderboard data is known to come back empty for stretches at a
    // time — don't let a legitimately-empty upstream response wipe out good data we already have.
    console.warn('Blizzard returned 0 leaderboard entries — keeping existing DB contents.');
    return { count: 0 };
  }

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

// --- row -> API entry shape ---
function rowToEntry(r: any) {
  return {
    rank: r.rank,
    rating: r.rating,
    name: r.name,
    realm: { slug: r.realm_slug },
    faction: { type: r.faction },
    class: { id: r.class_id },
    season_match_statistics: { played: r.played, won: r.won, lost: r.lost },
  };
}

// 3) Read for UI (most recently updated entries)
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

    const entries = rows.map(rowToEntry);

    res.json({
      ok: true,
      meta: { latestSeasonId: _lastSeasonId, lastModified: rows[0]?.updated_at ?? null },
      count: entries.length,
      entries,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message ?? 'DB error' });
  }
});

// 4) Full ranked standings
app.get('/api/mop/3v3/leaderboard', (_req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const db = getDb();
    const rows = db.prepare(`
      SELECT rank, rating, name, realm_slug, faction, class_id, played, won, lost, updated_at
      FROM recent_3v3
      ORDER BY rank ASC
    `).all();

    const entries = rows.map(rowToEntry);

    res.json({
      ok: true,
      meta: { latestSeasonId: _lastSeasonId, lastModified: rows[0]?.updated_at ?? null },
      count: entries.length,
      entries,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message ?? 'DB error' });
  }
});

// 5) Character search by name
app.get('/api/mop/3v3/search', (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const q = String(req.query['q'] ?? '').trim();
    if (!q) {
      res.json({ ok: true, count: 0, entries: [] });
      return;
    }
    const limit = Math.min(50, Math.max(1, Number(req.query['limit']) || 10));
    const db = getDb();
    const rows = db.prepare(`
      SELECT rank, rating, name, realm_slug, faction, class_id, played, won, lost, updated_at
      FROM recent_3v3
      WHERE name LIKE ?
      ORDER BY rating DESC
      LIMIT ?
    `).all(`%${q}%`, limit);

    const entries = rows.map(rowToEntry);

    res.json({ ok: true, count: entries.length, entries });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message ?? 'search failed' });
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

  if (process.env['BLIZZARD_CLIENT_ID'] && process.env['BLIZZARD_CLIENT_SECRET']) {
    const refreshIntervalMin = Number(process.env['BLIZZARD_REFRESH_INTERVAL_MINUTES'] ?? 30);

    const runRefresh = () =>
      refreshFromSource()
        .then(({ count }) => console.log(`Blizzard refresh OK — ${count} entries`))
        .catch((e) => console.error('Blizzard refresh failed:', e?.message ?? e));

    runRefresh();
    setInterval(runRefresh, refreshIntervalMin * 60_000);
  } else {
    console.warn(
      'BLIZZARD_CLIENT_ID / BLIZZARD_CLIENT_SECRET not set — skipping live Blizzard refresh. ' +
        'Get credentials at https://develop.battle.net/access/clients, or POST to /api/mop/3v3/ingest to load data manually.'
    );
  }
}

export const reqHandler = createNodeRequestHandler(app);