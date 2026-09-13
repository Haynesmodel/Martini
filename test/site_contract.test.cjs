const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
test('blocked canonical data cannot render record tables and candidates stay external', () => {
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'assets/H2H.json'))), []);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'assets/SeasonSummary.json'))), []);
  const source = fs.readFileSync(path.join(root, 'src/main.tsx'), 'utf8');
  assert.match(source, /loadHistory\(import\.meta\.env\.BASE_URL\)/);
  assert.match(source, /history-blocked/);
  assert.match(source, /history-error/);
  assert.doesNotMatch(source, /martini-source\.png/);
  assert.match(source, /srcSet=/);
});
test('share and hero use generic image assets without legacy media fallback', () => {
  const source = fs.readFileSync(path.join(root, 'src/main.tsx'), 'utf8');
  assert.doesNotMatch(source, /LeaguePic|Viva|shotgun/i);
  const generator = fs.readFileSync(path.join(root, 'scripts/generate_data.cjs'), 'utf8');
  assert.doesNotMatch(generator, /<svg|<text|Martini Family/);
});
