/**
 * Aggregator that runs every *.test.js file under ./test.
 *
 * Uses child_process so each test file runs in a fresh Node process, matching
 * how they are invoked individually via `npm run test:cli` etc.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const testDir = __dirname;
const files = fs.readdirSync(testDir)
  .filter((name) => name.endsWith('.test.js'))
  .sort();

let failed = 0;
for (const file of files) {
  const full = path.join(testDir, file);
  process.stdout.write(`\n=== ${file} ===\n`);
  const result = spawnSync(process.execPath, [full], { stdio: 'inherit' });
  if (result.status !== 0) {
    failed += 1;
  }
}

if (failed > 0) {
  console.error(`\n${failed} test file(s) FAILED.`);
  process.exit(1);
}
console.log(`\nAll ${files.length} test file(s) passed.`);

