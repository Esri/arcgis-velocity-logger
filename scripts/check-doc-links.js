#!/usr/bin/env node
/*
 * Repo-wide Markdown link checker (Node.js)
 * - Finds all .md files (excluding node_modules)
 * - Runs markdown-link-check via npx
 * - Ignores image links (png, jpg, svg, gif, webp, bmp, ico, tiff, heic, heif, data:image)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

function findMarkdownFiles(dir, results = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findMarkdownFiles(full, results);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      results.push(full);
    }
  }
  return results;
}

function writeTempConfig() {
  const cfg = {
    ignorePatterns: [
      { pattern: '\\.(png|jpe?g|gif|svg|webp|bmp|ico|tiff?|heic|heif)$' },
      { pattern: '^data:image/' },
    ],
  };
  const file = path.join(os.tmpdir(), `mlc-ignore-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(file, JSON.stringify(cfg), 'utf8');
  return file;
}

function main() {
  const root = process.cwd();
  console.log('Running Markdown link check across all .md files (excluding image links)...');
  const files = findMarkdownFiles(root);
  if (files.length === 0) {
    console.log('No Markdown files found.');
    return;
  }

  const cfg = writeTempConfig();
  let hadFailure = false;

  for (const file of files) {
    const res = spawnSync('npx', ['-y', 'markdown-link-check', '-q', '-c', cfg, file], {
      stdio: 'inherit',
      env: process.env,
    });
    if (res.status !== 0) {
      hadFailure = true;
    }
  }

  try { fs.unlinkSync(cfg); } catch {}

  if (hadFailure) {
    process.exitCode = 1;
  } else {
    console.log('All checks completed.');
  }
}

main();
