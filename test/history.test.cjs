const test = require('node:test'); const assert = require('node:assert/strict'); const fs = require('node:fs'); const path = require('node:path');
const root = path.join(__dirname, '..'); const read = file => JSON.parse(fs.readFileSync(path.join(root, 'assets', file), 'utf8'));
test('unpromoted history is empty and cannot be mistaken for completed records', () => { const games = read('H2H.json'); const summaries = read('SeasonSummary.json'); assert.deepEqual(games, []); assert.deepEqual(summaries, []); });
test('removed legacy assets are absent', () => { for (const file of ['Shotguns.json', 'CurrentSeason.json']) assert.equal(fs.existsSync(path.join(root, 'assets', file)), false); assert.equal(fs.existsSync(path.join(root, 'CNAME')), false); });
