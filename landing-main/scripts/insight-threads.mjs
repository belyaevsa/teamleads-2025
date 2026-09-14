#!/usr/bin/env node
/*
 * Cross-week threads of the weekly digests (content/insights/week-*.md).
 *
 *   node scripts/insight-threads.mjs          – list every topic with its threads,
 *                                               grouped by digest (context for /extract-insights)
 *   node scripts/insight-threads.mjs --check  – validate: every topic has threads,
 *                                               every slug exists in data/insight_threads.yaml
 *   node scripts/insight-threads.mjs --stats  – topics per thread, to spot unused or overloaded slugs
 *
 * No YAML dependency: the frontmatter shape is regular enough for regexes.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const vocabSrc = readFileSync(join(root, 'data/insight_threads.yaml'), 'utf8');
const vocab = new Map([...vocabSrc.matchAll(/^  ([a-z0-9-]+):\s+"(.+)"\s*$/gm)].map(m => [m[1], m[2]]));

const dir = join(root, 'content/insights');
const files = readdirSync(dir).filter(f => /^week-\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort();

const digests = files.map(f => {
  const src = readFileSync(join(dir, f), 'utf8');
  const blocks = src.split(/\n  - title: /).slice(1);
  const topics = blocks.map((b, i) => {
    const title = b.split('\n')[0].replace(/^"|"$/g, '');
    const m = b.match(/^    threads: \[(.*?)\]/m);
    const threads = m ? [...m[1].matchAll(/"([^"]+)"/g)].map(x => x[1]) : [];
    return { num: i + 1, title, threads };
  });
  return { slug: basename(f, '.md'), topics };
});

const mode = process.argv[2] ?? '--list';

if (mode === '--check') {
  const errors = [];
  for (const d of digests) for (const t of d.topics) {
    if (!t.threads.length) errors.push(`${d.slug} #${t.num} «${t.title}»: no threads`);
    for (const s of t.threads) if (!vocab.has(s)) errors.push(`${d.slug} #${t.num}: unknown thread «${s}»`);
  }
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  const n = digests.reduce((a, d) => a + d.topics.length, 0);
  console.log(`✓ ${n} topics in ${digests.length} digests, all threads valid (${vocab.size} slugs)`);
} else if (mode === '--stats') {
  const count = new Map([...vocab.keys()].map(k => [k, 0]));
  for (const d of digests) for (const t of d.topics) for (const s of t.threads) count.set(s, (count.get(s) ?? 0) + 1);
  for (const [k, v] of [...count].sort((a, b) => b[1] - a[1])) console.log(String(v).padStart(3), k.padEnd(22), vocab.get(k) ?? '(not in vocabulary)');
} else {
  for (const d of digests) {
    console.log(`## ${d.slug}`);
    for (const t of d.topics) console.log(`${t.num}. ${t.title}  [${t.threads.join(', ')}]`);
  }
}
