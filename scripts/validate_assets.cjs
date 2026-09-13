#!/usr/bin/env node
const fs = require('node:fs'); const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'assets', name), 'utf8'));
const games = read('H2H.json'); const summaries = read('SeasonSummary.json'); const manifest = read('asset-manifest.json');
if (games.length || summaries.length) throw new Error('unpromoted history must remain empty');
if (games.some(row => row.season > 2025 || row.teamA === row.teamB)) throw new Error('invalid history game');
if (summaries.some(row => row.season > 2025 || !/^franchise-[a-z0-9-]+$/.test(row.owner))) throw new Error('invalid franchise summary');
for (const file of ['martini-source.png', ...[480, 768, 1280, 1920].flatMap(width => [`martini-${width}.avif`, `martini-${width}.webp`, `martini-${width}.jpg`]), '../share/martini-default-card.png']) if (!fs.existsSync(path.join(root, 'assets/hero', file))) throw new Error(`missing asset ${file}`);
for (const [name, descriptor] of Object.entries(manifest.assets)) { const bytes = fs.readFileSync(path.join(root, descriptor.path)); const actual = require('node:crypto').createHash('sha256').update(bytes).digest('hex'); if (actual !== descriptor.sha256) throw new Error(`${name} hash does not match manifest`); }
if (manifest.history_status !== 'blocked-pending-reviewed-espn-export' || manifest.generated_assets.length) throw new Error('blocked history manifest is inconsistent');
if (manifest.current_season !== null) throw new Error('current season must remain absent');
console.log(`Asset validation passed: ${games.length} games, ${summaries.length} summary rows.`);
