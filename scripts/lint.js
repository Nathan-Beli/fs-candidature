'use strict';

// Minimal lint: syntax-check every .js file and every .ejs template.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ejs = require('ejs');

const root = path.join(__dirname, '..');
const skip = new Set(['node_modules', '.git', 'data']);

function walk(dir, exts, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, exts, out);
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(full);
  }
  return out;
}

let errors = 0;

for (const file of walk(root, ['.js'])) {
  try {
    execSync(`node --check "${file}"`, { stdio: 'pipe' });
  } catch (err) {
    errors++;
    console.error(`JS syntax error: ${path.relative(root, file)}`);
    console.error(err.stderr ? err.stderr.toString() : err.message);
  }
}

for (const file of walk(path.join(root, 'views'), ['.ejs'])) {
  try {
    ejs.compile(fs.readFileSync(file, 'utf8'), { filename: file });
  } catch (err) {
    errors++;
    console.error(`EJS compile error: ${path.relative(root, file)}`);
    console.error(err.message);
  }
}

if (errors) {
  console.error(`\nLint failed with ${errors} error(s).`);
  process.exit(1);
}
console.log('Lint OK — all JS and EJS files are valid.');
