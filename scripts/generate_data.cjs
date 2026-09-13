#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');

const root = path.resolve(process.env.MARTINI_PROJECT_ROOT || path.resolve(__dirname, '..'));
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'assets', name), 'utf8'));
function validateHistory(h2h, summary) {
  if ((h2h.length === 0) !== (summary.length === 0)) throw new Error('H2H and SeasonSummary must be promoted together');
  const blocked = h2h.length === 0;
  const mapping = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'martini_season_mapping.json'), 'utf8'));
  const franchiseKeys = new Set(mapping.franchises.map(item => item.key));
  const summaryKeys = new Set();
  for (const row of summary) {
    if (!Number.isInteger(row.season) || row.season > 2025 || !/^franchise-[a-z0-9-]+$/.test(row.owner) || !franchiseKeys.has(row.owner) || ![row.wins, row.losses, row.ties, row.finish, row.points_for].every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0)) throw new Error(`invalid mapped summary row for ${row.owner}`);
    const key = `${row.season}:${row.owner}`;
    if (summaryKeys.has(key)) throw new Error(`duplicate franchise-season summary ${key}`);
    summaryKeys.add(key);
  }
  const gameKeys = new Set();
  for (const row of h2h) {
    if (!Number.isInteger(row.season) || row.season > 2025 || !/^franchise-[a-z0-9-]+$/.test(row.teamA) || !/^franchise-[a-z0-9-]+$/.test(row.teamB) || row.teamA === row.teamB || ![row.week, row.scoreA, row.scoreB].every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0)) throw new Error('invalid H2H row');
    const key = `${row.season}:${row.week}:${[row.teamA, row.teamB].sort().join(':')}`;
    if (gameKeys.has(key)) throw new Error(`duplicate H2H matchup ${key}`);
    gameKeys.add(key);
  }
  for (const row of h2h) if (!summaryKeys.has(`${row.season}:${row.teamA}`) || !summaryKeys.has(`${row.season}:${row.teamB}`)) throw new Error('H2H row has no matching franchise summary');
  if (!blocked) {
    const bySeason = new Map();
    for (const row of summary) bySeason.set(row.season, (bySeason.get(row.season) || 0) + 1);
    for (const [season, count] of bySeason) if (count !== mapping.expected_team_count) throw new Error(`season ${season} has ${count} teams; expected ${mapping.expected_team_count}`);
  }
  return blocked ? 'blocked-pending-reviewed-espn-export' : 'promoted';
}
async function main() {
  const h2h = read('H2H.json');
  const summary = read('SeasonSummary.json');
  const historyStatus = validateHistory(h2h, summary);
  const source = path.join(root, 'assets', 'hero', 'martini-source.png');
  const heroDir = path.join(root, 'assets', 'hero');
  for (const width of [480, 768, 1280, 1920]) for (const format of ['avif', 'webp', 'jpg']) {
    const image = sharp(source).resize({ width });
    await (format === 'avif' ? image.avif({ quality: 50 }) : format === 'webp' ? image.webp({ quality: 76 }) : image.jpeg({ quality: 78, mozjpeg: true })).toFile(path.join(heroDir, `martini-${width}.${format}`));
  }
  const share = path.join(root, 'assets', 'share'); fs.mkdirSync(share, { recursive: true });
  await sharp(source).resize({ width: 1200, height: 630, fit: 'cover' }).png().toFile(path.join(share, 'martini-default-card.png'));
  const files = ['H2H.json', 'SeasonSummary.json', 'Rivalries.json'];
  const assets = Object.fromEntries(files.map(name => { const bytes = fs.readFileSync(path.join(root, 'assets', name)); return [name.replace('.json', ''), { path: `assets/${name}`, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }]; }));
  fs.writeFileSync(path.join(root, 'assets', 'asset-manifest.json'), JSON.stringify({ manifest_version: 1, data_version: 'martini-history-v1', history_status: historyStatus, schema_versions: { H2H: 1, SeasonSummary: 1, Rivalries: 1 }, assets, generated_assets: [], hero: { source: 'assets/hero/martini-source.png', variants: 12 }, current_season: null }, null, 2) + '\n');
  const publicRoot = path.join(root, 'public', 'assets');
  fs.rmSync(publicRoot, { recursive: true, force: true });
  fs.mkdirSync(path.join(publicRoot, 'hero'), { recursive: true });
  fs.mkdirSync(path.join(publicRoot, 'share'), { recursive: true });
  for (const name of [...files, 'asset-manifest.json']) fs.copyFileSync(path.join(root, 'assets', name), path.join(publicRoot, name));
  for (const width of [480, 768, 1280, 1920]) for (const format of ['avif', 'webp', 'jpg']) fs.copyFileSync(path.join(heroDir, `martini-${width}.${format}`), path.join(publicRoot, 'hero', `martini-${width}.${format}`));
  fs.copyFileSync(path.join(share, 'martini-default-card.png'), path.join(publicRoot, 'share', 'martini-default-card.png'));
}
main().catch(error => { console.error(error.stack || error); process.exit(1); });
