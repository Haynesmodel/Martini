#!/usr/bin/env node
const fs = require('node:fs'); const path = require('node:path'); const crypto = require('node:crypto');
const root = path.resolve(process.argv[2] || process.env.MARTINI_PROJECT_ROOT || path.join(__dirname, '..'));
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'assets', name), 'utf8'));
const games = read('H2H.json'); const summaries = read('SeasonSummary.json'); const manifest = read('asset-manifest.json'); const mapping = read('../scripts/martini_season_mapping.json');
if ((games.length === 0) !== (summaries.length === 0)) throw new Error('H2H and SeasonSummary must be promoted together');
const blocked = games.length === 0;
const keys = new Set(mapping.franchises.map(item => item.key)); const summaryKeys = new Set();
for (const row of summaries) { if (!Number.isInteger(row.season) || row.season > 2025 || !/^franchise-[a-z0-9-]+$/.test(row.owner) || !keys.has(row.owner) || ![row.wins, row.losses, row.ties, row.finish, row.points_for].every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0)) throw new Error('invalid mapped franchise summary'); const key = `${row.season}:${row.owner}`; if (summaryKeys.has(key)) throw new Error(`duplicate franchise-season summary ${key}`); summaryKeys.add(key); }
const gameKeys = new Set();
for (const row of games) { if (!Number.isInteger(row.season) || row.season > 2025 || !/^franchise-[a-z0-9-]+$/.test(row.teamA) || !/^franchise-[a-z0-9-]+$/.test(row.teamB) || row.teamA === row.teamB || ![row.week, row.scoreA, row.scoreB].every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0)) throw new Error('invalid history game'); if (!summaryKeys.has(`${row.season}:${row.teamA}`) || !summaryKeys.has(`${row.season}:${row.teamB}`)) throw new Error('H2H row has no matching franchise summary'); const key = `${row.season}:${row.week}:${[row.teamA, row.teamB].sort().join(':')}`; if (gameKeys.has(key)) throw new Error(`duplicate H2H matchup ${key}`); gameKeys.add(key); }
if (!blocked) { const counts = new Map(); for (const row of summaries) counts.set(row.season, (counts.get(row.season) || 0) + 1); for (const [season, count] of counts) if (count !== mapping.expected_team_count) throw new Error(`season ${season} has ${count} teams; expected ${mapping.expected_team_count}`); }
const expectedStatus = blocked ? 'blocked-pending-reviewed-espn-export' : 'promoted';
if (manifest.history_status !== expectedStatus || manifest.generated_assets.length) throw new Error('history manifest is inconsistent');
if (manifest.current_season !== null) throw new Error('current season must remain absent');
for (const file of ['martini-source.png', ...[480, 768, 1280, 1920].flatMap(width => [`martini-${width}.avif`, `martini-${width}.webp`, `martini-${width}.jpg`]), '../share/martini-default-card.png']) if (!fs.existsSync(path.join(root, 'assets/hero', file))) throw new Error(`missing asset ${file}`);
for (const [name, descriptor] of Object.entries(manifest.assets)) { const bytes = fs.readFileSync(path.join(root, descriptor.path)); const actual = crypto.createHash('sha256').update(bytes).digest('hex'); if (actual !== descriptor.sha256) throw new Error(`${name} hash does not match manifest`); }
console.log(`Asset validation passed: ${games.length} games, ${summaries.length} summary rows (${expectedStatus}).`);
