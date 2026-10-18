import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const manifest=JSON.parse(await readFile('dist-pages/manifest.webmanifest','utf8'));
assert.equal(manifest.start_url,'/DayTrace/');assert.equal(manifest.scope,'/DayTrace/');
const html=await readFile('dist-pages/index.html','utf8');
assert.ok(html.includes('/DayTrace/assets/'));assert.ok(html.includes('/DayTrace/icons/apple-touch-icon.png'));
console.log('PASS Pages base, manifest scope/start_url, assets and Apple icon URLs');
