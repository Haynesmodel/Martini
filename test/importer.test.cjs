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
function espnPayload() {
  const source = validPayload();
  const owners = source.teams.map((_, index) => `{owner-${index + 1}}`);
  return {
    seasonId: source.seasonId,
    members: source.teams.map((team, index) => ({ id: owners[index], displayName: team.managers[0] })),
    teams: source.teams.map((team, index) => ({ id: Number(team.id), name: team.name, owners: [owners[index]], points: 1000 + index, rankCalculatedFinal: index + 1, record: { overall: { wins: index, losses: 3 - index, ties: 0 } } })),
    schedule: [{ id: 1, matchupPeriodId: 1, home: { teamId: 1, totalPoints: 100 }, away: { teamId: 2, totalPoints: 90 } }],
  };
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
test('raw ESPN mTeam and mMatchupScore export is adapted before validation', () => {
  const dir = fixtureDir(); const result = run(espnPayload(), { dir, mapping: mappingFile(dir) });
  assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /franchise-a/);
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
test('known aliases still require a covering exact manager interval', () => {
  const dir = fixtureDir(); const mapping = JSON.parse(fs.readFileSync(mappingFile(dir)));
  const changed = structuredClone(mapping); changed.franchises[0].manager_history[0].managers = ['Different Manager']; const changedFile = path.join(dir, 'changed.json'); fs.writeFileSync(changedFile, JSON.stringify(changed));
  assert.match(run(validPayload(), { dir, mapping: changedFile }).stderr, /unknown manager\/team mapping/);
  const absent = structuredClone(mapping); absent.franchises[0].manager_history = []; const absentFile = path.join(dir, 'absent.json'); fs.writeFileSync(absentFile, JSON.stringify(absent));
  assert.match(run(validPayload(), { dir, mapping: absentFile }).stderr, /no single manager-history interval/);
});
test('standings must contain exactly one row for every mapped team', () => {
  const dir = fixtureDir(); const mapping = mappingFile(dir);
  const duplicate = validPayload(); duplicate.standings.push({ ...duplicate.standings[0], id: '1' }); assert.match(run(duplicate, { dir, mapping }).stderr, /duplicate standings source team/);
  const missing = validPayload(); missing.standings = missing.standings.slice(0, 3); assert.match(run(missing, { dir, mapping }).stderr, /standings are missing mapped source teams/);
});
test('reviewed promotion survives generation and asset validation in isolation', () => {
  const project = fixtureDir(); fs.cpSync(path.join(root, 'assets'), path.join(project, 'assets'), { recursive: true }); fs.mkdirSync(path.join(project, 'scripts'));
  fs.writeFileSync(path.join(project, 'assets/H2H.json'), '[]\n'); fs.writeFileSync(path.join(project, 'assets/SeasonSummary.json'), '[]\n');
  fs.copyFileSync(path.join(root, 'scripts/generate_data.cjs'), path.join(project, 'scripts/generate_data.cjs'));
  const mapping = mappingFile(project); fs.copyFileSync(mapping, path.join(project, 'scripts/martini_season_mapping.json'));
  const promoted = run(validPayload(), { dir: project, mapping, promote: true, outputDir: path.join(project, 'assets') }); assert.equal(promoted.status, 0, promoted.stderr);
  const generated = spawnSync('node', ['scripts/generate_data.cjs'], { cwd: root, env: { ...process.env, MARTINI_PROJECT_ROOT: project }, encoding: 'utf8' }); assert.equal(generated.status, 0, generated.stderr);
  const checked = spawnSync('node', ['scripts/validate_assets.cjs', project], { cwd: root, encoding: 'utf8' }); assert.equal(checked.status, 0, checked.stderr); assert.match(checked.stdout, /promoted/);
});
