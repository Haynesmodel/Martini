const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let runtime;
test('runtime loader accepts blocked empty history with verified hashes', async () => {
  runtime ??= await import(pathToFileURL(path.join(__dirname, '../src/data-runtime.mjs')));
  const files = { 'assets/H2H.json': '[]', 'assets/SeasonSummary.json': '[]' };
  const manifest = { history_status: 'blocked-pending-reviewed-espn-export', assets: Object.fromEntries(Object.entries(files).map(([name, body]) => [name.split('/').at(-1).replace('.json', ''), { path: name, sha256: crypto.createHash('sha256').update(body).digest('hex') }])) };
  const requests = []; const fetchImpl = async (...args) => { const [url] = args; requests.push(args); if (url.endsWith('asset-manifest.json')) return new Response(JSON.stringify(manifest), { status: 200 }); const body = files[Object.keys(files).find(file => url.endsWith(file))]; return new Response(body, { status: body === undefined ? 404 : 200 }); };
  const data = await runtime.loadHistory('/Martini/', fetchImpl); assert.equal(data.status, 'blocked'); assert.deepEqual(data.games, []); assert.deepEqual(data.summaries, []); assert.ok(requests.every(([, options]) => options?.cache === 'no-store'));
});

test('runtime loader rejects a required asset when its manifest hash is corrupted', async () => {
  runtime ??= await import(pathToFileURL(path.join(__dirname, '../src/data-runtime.mjs')));
  const body = '[]'; const manifest = { history_status: 'blocked-pending-reviewed-espn-export', assets: { H2H: { path: 'assets/H2H.json', sha256: '0'.repeat(64) }, SeasonSummary: { path: 'assets/SeasonSummary.json', sha256: crypto.createHash('sha256').update(body).digest('hex') } } };
  const fetchImpl = async url => url.endsWith('asset-manifest.json') ? new Response(JSON.stringify(manifest), { status: 200 }) : new Response(body, { status: 200 });
  await assert.rejects(runtime.loadHistory('/Martini/', fetchImpl), /SHA-256 does not match/);
});
