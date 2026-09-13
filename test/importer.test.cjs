const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
function fixtureDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'martini-import-')); }
function mappingFile(dir, ambiguous = false) {
  const franchises = ['a', 'b', 'c', 'd'].map((key, index) => ({ key: `franchise-${key}`, display_name: `Team ${key.toUpperCase()}`, manager_history: [{ from: 2025, to: 2025, managers: [`Manager ${key}`] }] }));
  if (ambiguous) franchises.push({ key: 'franchise-other', display_name: 'Other', manager_history: [{ from: 2025, to: 2025, managers: ['Manager a'] }] });
  const mapping = { first_completed_season: 2021, last_completed_season: 2025, expected_team_count: 4, seasons: { 2025: { teams: 4 } }, franchises, team_aliases: ['a', 'b', 'c', 'd'].map((key, index) => ({ franchise_key: `franchise-${key}`, espn_team_ids: [String(index + 1)], source_name: `Team ${key.toUpperCase()}` })) };
  const file = path.join(dir, 'mapping.json'); fs.writeFileSync(file, JSON.stringify(mapping)); return file;
}
function validPayload() {
  return { seasonId: 2025, teams: ['a', 'b', 'c', 'd'].map((key, index) => ({ id: String(index + 1), name: `Team ${key.toUpperCase()}`, managers: [`Manager ${key}`] })), matchups: [{ id: 'm1', week: 1, teamA: '1', teamB: '2', scoreA: 100, scoreB: 90 }], standings: ['a', 'b', 'c', 'd'].map((key, index) => ({ id: String(index + 1), wins: index, losses: 3 - index, ties: 0, finish: index + 1, pointsFor: 1000 + index })) };
}
function run(payload, options = {}) {
  const dir = options.dir || fixtureDir(); const exportFile = path.join(dir, 'export.json'); fs.writeFileSync(exportFile, JSON.stringify(payload));
  const args = ['scripts/import_martini_espn.py', exportFile];
  if (options.mapping) args.push('--mapping', options.mapping);
  if (options.candidate) args.push('--candidate', options.candidate);
  if (options.promote) args.push('--promote', '--output-dir', options.outputDir);
  return spawnSync('python3', args, { cwd: root, encoding: 'utf8' });
}

test('valid sanitized export creates a candidate with normalized teams, games, and summaries', () => {
  const dir = fixtureDir(); const mapping = mappingFile(dir); const candidate = path.join(dir, 'candidate.json'); const result = run(validPayload(), { dir, mapping, candidate });
  assert.equal(result.status, 0, result.stderr); const output = JSON.parse(fs.readFileSync(candidate)); assert.equal(output.status, 'candidate'); assert.equal(output.games[0].teamA, 'franchise-a'); assert.equal(output.summaries.length, 4); assert.ok(!fs.existsSync(path.join(root, 'assets', 'candidate.json')));
});

test('candidate output is rejected inside canonical assets', () => { const dir = fixtureDir(); const result = run(validPayload(), { dir, mapping: mappingFile(dir), candidate: path.join(root, 'assets', 'candidate.json') }); assert.notEqual(result.status, 0); assert.match(result.stderr, /outside assets/); });
test('private fields, 2026, incorrect team count, and missing map are blocked', () => {
  const dir = fixtureDir(); const mapping = mappingFile(dir);
  for (const [payload, message] of [[{ seasonId: 2025, token: 'nope', teams: [] }, /private field rejected/], [{ seasonId: 2026, teams: [] }, /not completed history|outside/], [{ ...validPayload(), teams: validPayload().teams.slice(0, 3) }, /expected 4/], [{ ...validPayload(), teams: validPayload().teams.map(team => team.id === '1' ? { ...team, id: '99', name: 'Mystery', managers: ['Unknown'] } : team) }, /unknown manager\/team mapping/]]) { const result = run(payload, { dir, mapping }); assert.notEqual(result.status, 0); assert.match(result.stderr, message); }
});
test('self-matchup, duplicate matchup, duplicate franchise-season, and ambiguous manager are blocked', () => {
  const dir = fixtureDir(); const mapping = mappingFile(dir);
  const self = validPayload(); self.matchups[0].teamB = '1'; assert.match(run(self, { dir, mapping }).stderr, /self-matchup/);
  const duplicate = validPayload(); duplicate.matchups.push({ ...duplicate.matchups[0], id: 'm2' }); assert.match(run(duplicate, { dir, mapping }).stderr, /duplicate matchup/);
  const duplicateFranchise = validPayload(); duplicateFranchise.teams[1].id = '1'; assert.match(run(duplicateFranchise, { dir, mapping }).stderr, /duplicate ESPN team ID|duplicate franchise-season/);
  const ambiguousMapping = mappingFile(dir, true); const ambiguous = validPayload(); ambiguous.teams[0].id = 'unknown'; ambiguous.teams[0].name = 'Unknown'; ambiguous.teams[0].managers = ['Manager a']; assert.match(run(ambiguous, { dir, mapping: ambiguousMapping }).stderr, /ambiguous/);
});
test('explicit promotion is supported only for a reviewed normalized candidate', () => { const dir = fixtureDir(); const outputDir = path.join(dir, 'assets'); const result = run(validPayload(), { dir, mapping: mappingFile(dir), promote: true, outputDir }); assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(fs.readFileSync(path.join(outputDir, 'H2H.json'))).length, 1); });
