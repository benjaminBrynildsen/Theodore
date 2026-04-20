import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

// Pool sizing: default pg max is 10 which is tight when normal user traffic
// overlaps with background TTS job heartbeats and the 60-second resume sweep.
// When the pool is exhausted, new queries queue and the proxy eventually
// treats the stalled request as a 502 — exactly the intermittent runtime
// failures we've been seeing. 20 connections is comfortable for Render's
// Postgres tiers without risking `too many connections` on the DB side.
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://wolfgang@/theodore?host=/var/run/postgresql',
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

// Surface pool errors instead of letting them propagate as unhandled rejections
// that crash the process (which was another contributor to intermittent 502s).
pool.on('error', (err) => {
  console.error('[pg-pool] idle client error:', err.message);
});

export const db = drizzle(pool, { schema });
export { pool };
