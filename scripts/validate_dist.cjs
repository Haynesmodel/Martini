#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(process.argv[2] || path.join(__dirname, '..', 'dist'));
const required = ['index.html', '.vite/manifest.json', 'assets/asset-manifest.json', 'assets/hero/martini-480.avif', 'assets/hero/martini-1280.webp', 'assets/hero/martini-1920.jpg', 'assets/share/martini-default-card.png'];
for (const file of required) { const target = path.join(root, file); if (!fs.existsSync(target) || !fs.statSync(target).size) throw new Error(`missing production artifact: ${file}`); }
for (const file of ['CNAME', 'assets/hero/martini-source.png']) if (fs.existsSync(path.join(root, file))) throw new Error(`forbidden production artifact: ${file}`);
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
if (!html.includes('/Martini/')) throw new Error('production index does not contain the Pages base path');
console.log(`Production artifact validated: ${required.length} required files under ${root}`);
