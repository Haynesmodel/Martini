const REQUIRED = ['H2H', 'SeasonSummary'];

function urlFor(base, relative) {
  return `${base.replace(/\/?$/, '/')}${relative.replace(/^\//, '')}`;
}

async function sha256(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

function validateRows(games, summaries, manifest) {
  if (!Array.isArray(games) || !Array.isArray(summaries)) throw new Error('required history assets must be arrays');
  const franchise = /^franchise-[a-z0-9-]+$/;
  const summaryKeys = new Set();
  for (const row of summaries) {
    if (!Number.isInteger(row.season) || row.season > 2025 || !franchise.test(row.owner) || ![row.wins, row.losses, row.ties, row.finish, row.points_for].every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0)) throw new Error('invalid SeasonSummary row');
    const key = `${row.season}:${row.owner}`;
    if (summaryKeys.has(key)) throw new Error('duplicate SeasonSummary row');
    summaryKeys.add(key);
  }
  const gameKeys = new Set();
  for (const row of games) {
    if (!Number.isInteger(row.season) || row.season > 2025 || !franchise.test(row.teamA) || !franchise.test(row.teamB) || row.teamA === row.teamB || ![row.week, row.scoreA, row.scoreB].every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0)) throw new Error('invalid H2H row');
    const key = `${row.season}:${row.week}:${[row.teamA, row.teamB].sort().join(':')}`;
    if (gameKeys.has(key)) throw new Error('duplicate H2H row');
    gameKeys.add(key);
  }
  for (const row of games) if (!summaryKeys.has(`${row.season}:${row.teamA}`) || !summaryKeys.has(`${row.season}:${row.teamB}`)) throw new Error('H2H row has no matching franchise summary');
  const blocked = games.length === 0 && summaries.length === 0;
  if (!blocked && (games.length === 0 || summaries.length === 0)) throw new Error('history assets must be promoted together');
  const expectedStatus = blocked ? 'blocked-pending-reviewed-espn-export' : 'promoted';
  if (manifest.history_status !== expectedStatus) throw new Error(`manifest history status is ${manifest.history_status || 'missing'}, expected ${expectedStatus}`);
  return blocked ? 'blocked' : 'promoted';
}

export async function loadHistory(base, fetchImpl = fetch) {
  const manifestResponse = await fetchImpl(urlFor(base, 'assets/asset-manifest.json'), { cache: 'no-store' });
  if (!manifestResponse.ok) throw new Error(`asset manifest request failed (${manifestResponse.status})`);
  const manifest = await manifestResponse.json();
  const payloads = {};
  for (const name of REQUIRED) {
    const descriptor = manifest.assets?.[name];
    if (!descriptor?.path || !descriptor.sha256) throw new Error(`manifest is missing ${name}`);
    const response = await fetchImpl(urlFor(base, descriptor.path), { cache: 'no-store' });
    if (!response.ok) throw new Error(`${name} request failed (${response.status})`);
    const bytes = await response.arrayBuffer();
    const actual = await sha256(bytes);
    if (actual !== descriptor.sha256) throw new Error(`${name} SHA-256 does not match the manifest`);
    try { payloads[name] = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error(`${name} is not valid JSON`); }
  }
  const status = validateRows(payloads.H2H, payloads.SeasonSummary, manifest);
  return { games: payloads.H2H, summaries: payloads.SeasonSummary, status, manifest };
}

export { validateRows };
