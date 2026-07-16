// Vercel serverless function entry point. Wraps the Angular SSR server (which also carries
// our custom /api/mop/3v3/* and /api/cron/* Express routes — same server.ts used for local dev)
// as a Vercel Node.js function handler.
import { reqHandler } from '../dist/Arenaq/server/server.mjs';

export default reqHandler;
