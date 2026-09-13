#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const forbidden = /viva|shotguns|leaguepic|taylorsahoefantasy|access gate|currentseason|media host/i;
const files = execFileSync('git', ['ls-files', 'index.html', 'src', 'scripts', 'assets', 'docs', 'README.md', 'package.json', '.github'], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(file => file && file !== 'scripts/check_no_leaks.cjs' && fs.existsSync(path.join(root, file)));
const hits = files.flatMap(file => fs.readFileSync(path.join(root, file), 'utf8').split('\n').map((line, index) => (forbidden.test(line) || (/password phrase/i.test(line) && !file.endsWith('import_martini_espn.py'))) ? `${file}:${index + 1}:${line.trim()}` : null).filter(Boolean));
if (hits.length) { console.error(hits.join('\n')); process.exit(1); }
console.log(`No legacy product strings found in ${files.length} product files.`);
