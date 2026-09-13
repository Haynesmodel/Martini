#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'assets', name), 'utf8'));
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function main() {
  const h2h = read('H2H.json');
  const summary = read('SeasonSummary.json');
  const source = path.join(root, 'assets', 'hero', 'martini-source.png');
  const heroDir = path.join(root, 'assets', 'hero');
  for (const width of [480, 768, 1280, 1920]) for (const format of ['avif', 'webp', 'jpg']) {
    const image = sharp(source).resize({ width });
    await (format === 'avif' ? image.avif({ quality: 50 }) : format === 'webp' ? image.webp({ quality: 76 }) : image.jpeg({ quality: 78, mozjpeg: true })).toFile(path.join(heroDir, `martini-${width}.${format}`));
  }
  const share = path.join(root, 'assets', 'share'); fs.mkdirSync(share, { recursive: true });
  const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="630" fill="#13231e"/><text x="72" y="230" fill="#c99352" font-family="Georgia" font-size="28">A FAMILY LEAGUE ARCHIVE</text><text x="72" y="320" fill="#fff" font-family="Georgia" font-size="58">Martini Family</text><text x="72" y="390" fill="#fff" font-family="Georgia" font-size="58">Fantasy Football League</text><text x="72" y="470" fill="#dce9df" font-family="Arial" font-size="26">Completed seasons · team records · matchups</text></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path.join(share, 'martini-default-card.png'));
  fs.writeFileSync(path.join(root, 'assets', 'DerivedStats.json'), JSON.stringify({ version: 1, source_hashes: { H2H: hash(h2h), SeasonSummary: hash(summary) }, games: h2h.length, seasons: [...new Set(summary.map(row => row.season))] }, null, 2) + '\n');
  fs.writeFileSync(path.join(root, 'assets', 'DraftSpot.json'), JSON.stringify({ version: 1, source_sha256: hash(summary), rows: summary.map(row => ({ season: row.season, franchise: row.owner, pick: row.draft_pick })) }, null, 2) + '\n');
  const files = ['H2H.json', 'SeasonSummary.json', 'Rivalries.json', 'DerivedStats.json', 'DraftSpot.json'];
  const assets = Object.fromEntries(files.map(name => { const bytes = fs.readFileSync(path.join(root, 'assets', name)); return [name.replace('.json', ''), { path: `assets/${name}`, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }]; }));
  fs.writeFileSync(path.join(root, 'assets', 'asset-manifest.json'), JSON.stringify({ manifest_version: 1, data_version: 'martini-history-v1', schema_versions: { H2H: 1, SeasonSummary: 1, Rivalries: 1 }, assets, generated_assets: ['DerivedStats', 'DraftSpot'], hero: { source: 'assets/hero/martini-source.png', variants: 12 }, current_season: null }, null, 2) + '\n');
}
main().catch(error => { console.error(error.stack || error); process.exit(1); });
