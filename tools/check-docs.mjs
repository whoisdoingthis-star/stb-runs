// Documentation checks (docs as code). See CONTRIBUTING.md.
//
//   node tools/check-docs.mjs                 static checks on the working tree
//   node tools/check-docs.mjs --diff A B      also: docs gate and version bump for commits A..B
//
// Exits 1 with a list of problems, so CI fails the change.
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const problems = [];
const fail = (m) => problems.push(m);
const git = (cmd) => execSync(`git ${cmd}`, { encoding: 'utf8' }).trim();
const tracked = git('ls-files').split('\n').filter(Boolean);

// 1. Every relative link in Markdown points at something that exists.
for (const f of tracked.filter((x) => x.endsWith('.md'))) {
  const text = fs.readFileSync(f, 'utf8');
  for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = m[1];
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const file = target.split('#')[0];
    const resolved = path.normalize(path.join(path.dirname(f), file));
    if (!fs.existsSync(resolved)) fail(`${f}: broken link to ${target}`);
  }
}

// 2. Every table in the schema is described in the data model page.
const schema = fs.readFileSync('sql/schema.sql', 'utf8');
const model = fs.readFileSync('docs/data-model.md', 'utf8');
const tables = [...schema.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1]);
for (const t of new Set(tables)) if (!model.includes(`\`${t}\``)) fail(`docs/data-model.md: table \`${t}\` is not described`);

// 3. The changelog has somewhere to put the next change.
if (!/^## Unreleased/m.test(fs.readFileSync('CHANGELOG.md', 'utf8'))) fail('CHANGELOG.md: no "## Unreleased" section');

// 4. Nothing that looks like a secret is committed (the repository is public).
const SECRET = [
  [/sb_secret_[A-Za-z0-9_-]{10,}/, 'Supabase secret key'],
  [/github_pat_[A-Za-z0-9_]{20,}|ghp_[A-Za-z0-9]{30,}/, 'GitHub token'],
  [/eyJhbGciOi[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/, 'JWT (service role key?)'],
  [/(password|passwd|pwd)\s*[:=]\s*['"][^'"\s]{4,}['"]/i, 'password in code'],
];
for (const f of tracked) {
  if (/^(vendor|node_modules|icons)\//.test(f) || /\.(png|jpg|pdf|mjs\.map)$/.test(f) || f === 'package-lock.json') continue;
  let text; try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
  for (const [re, what] of SECRET) if (re.test(text)) fail(`${f}: looks like a ${what}`);
}

// 5. For a range of commits: docs move with code, and phones get a new version.
const di = process.argv.indexOf('--diff');
if (di > 0) {
  const [base, head] = process.argv.slice(di + 1, di + 3);
  const range = /^0+$/.test(base || '') ? head : `${base}..${head}`;
  const changed = git(/^0+$/.test(base || '') ? `show --name-only --format= ${head}` : `diff --name-only ${range}`).split('\n').filter(Boolean);
  const messages = git(/^0+$/.test(base || '') ? `log -1 --format=%B ${head}` : `log --format=%B ${range}`);
  const code = changed.filter((f) => /^(js\/|sql\/|fetcher\/(?!node_modules)|supabase\/|\.github\/workflows\/)/.test(f) || ['index.html', 'styles.css', 'sw.js', 'config.js', 'manifest.webmanifest'].includes(f));
  const docs = changed.filter((f) => f.startsWith('docs/') || f === 'CHANGELOG.md' || f === 'README.md');
  if (code.length && !docs.length && !messages.includes('[no-docs]')) {
    fail(`Docs gate: code changed (${code.join(', ')}) but no docs/ page or CHANGELOG.md did. Update the docs, or add [no-docs] to the commit message if truly nothing needs saying.`);
  }
  const phone = changed.filter((f) => /^(js\/|vendor\/|icons\/)/.test(f) || ['index.html', 'styles.css', 'config.js', 'manifest.webmanifest'].includes(f));
  if (phone.length) {
    const diff = git(/^0+$/.test(base || '') ? `show ${head} -- sw.js` : `diff ${range} -- sw.js`);
    if (!/^\+const VERSION/m.test(diff)) fail(`Version bump: phone files changed (${phone.join(', ')}) but VERSION in sw.js did not. Phones would keep the old copy.`);
  }
  if (changed.includes('sql/schema.sql') && !changed.includes('docs/data-model.md')) fail('sql/schema.sql changed but docs/data-model.md did not.');
}

if (problems.length) {
  console.log(`✗ ${problems.length} documentation problem(s):\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(`✓ docs: links ok, ${new Set(tables).size} tables documented, changelog ready, no secrets${di > 0 ? ', docs and version moved with the code' : ''}`);
