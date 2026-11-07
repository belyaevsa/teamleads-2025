#!/usr/bin/env node
/*
 * Fetch the community chat messages posted during a time window – e.g. while a
 * meetup was recorded – from the public t.me embed widget. No DB access, no
 * Telegram login, no dependencies: the group is public, so every message has a
 * preview at https://t.me/<chat>/<id>?embed=1.
 *
 *     node scripts/chat-window.mjs --from 2026-11-05T14:00Z --to 2026-11-05T16:30Z \
 *       [--chat teamleads_kz] [--near 71500] [--photos <dir>] > chat.jsonl
 *
 * Prints JSON lines, oldest first:
 *   { id, dt, author, reply, text, photos: [url], link }
 * `dt` is UTC. `photos` holds the message's own photo(s); an album is several
 * consecutive messages, one photo each. With --photos, each photo is saved as
 * <dir>/<id>.jpg (or <id>-<n>.jpg) – rename them descriptively afterwards.
 *
 * Message ids are found by binary search on the date, so no id is needed;
 * --near <id> just speeds up the search. Ids of deleted or service messages
 * have no preview and are skipped.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]]);
    return acc;
  }, []),
);
const CHAT = args.chat || 'teamleads_kz';
const FROM = Date.parse(args.from);
const TO = Date.parse(args.to);
if (Number.isNaN(FROM) || Number.isNaN(TO) || FROM >= TO) {
  console.error('usage: chat-window.mjs --from <ISO> --to <ISO> [--chat name] [--near id] [--photos dir]');
  process.exit(2);
}

const UA = { 'User-Agent': 'Mozilla/5.0 teamleads-meetup-notes' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, binary = false) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url, { headers: UA });
      if (res.ok) return binary ? Buffer.from(await res.arrayBuffer()) : await res.text();
      if (res.status === 404) return null;
    } catch { /* retry */ }
    await sleep(1500 * (attempt + 1)); // the CDN answers 500 now and then
  }
  throw new Error(`failed: ${url}`);
}

const decode = (s) =>
  s.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();

const cache = new Map();
async function message(id) {
  if (cache.has(id)) return cache.get(id);
  // single=1 shows only this message's photo, not the whole album
  const page = await get(`https://t.me/${CHAT}/${id}?embed=1&mode=tme&single=1`);
  const dt = page && page.match(/datetime="([^"]+)"/);
  let msg = null;
  if (dt) {
    const pick = (re) => { const m = page.match(re); return m ? decode(m[1]) : ''; };
    const photos = [...page.matchAll(/tgme_widget_message_photo_wrap[^>]*background-image:url\('([^']+)'\)/g)]
      .map((m) => m[1]);
    msg = {
      id,
      dt: new Date(dt[1]).toISOString(),
      author: pick(/tgme_widget_message_author_name"[^>]*>([\s\S]*?)<\//),
      reply: pick(/js-message_reply_text"[^>]*>([\s\S]*?)<\/div>/),
      text: pick(/js-message_text"[^>]*>([\s\S]*?)<\/div>/),
      photos: [...new Set(photos)].slice(0, 1), // the widget repeats the photo
      link: `https://t.me/${CHAT}/${id}`,
    };
  }
  cache.set(id, msg);
  return msg;
}

// nearest existing message at or after id (skips deleted/service ids)
async function existing(id, span = 25) {
  for (let i = id; i < id + span; i++) {
    const m = await message(i);
    if (m) return m;
  }
  return null;
}

// first id whose message is at/after `time`
async function firstAtOrAfter(time) {
  let lo = 1;
  let hi = Number(args.near) || 50000;
  // grow hi until it is past `time` or past the newest message
  for (;;) {
    const m = await existing(hi);
    if (!m || Date.parse(m.dt) >= time) break;
    lo = hi;
    hi *= 2;
  }
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    const m = await existing(mid);
    if (!m || Date.parse(m.dt) >= time) hi = mid; else lo = mid;
  }
  return hi;
}

const start = await firstAtOrAfter(FROM);
const out = [];
let misses = 0;
for (let id = start; misses < 40; id++) {
  const m = await message(id);
  if (!m) { misses++; continue; }
  misses = 0;
  if (Date.parse(m.dt) >= TO) break;
  out.push(m);
}

if (args.photos) {
  mkdirSync(args.photos, { recursive: true });
  for (const m of out) {
    for (const [n, url] of m.photos.entries()) {
      const name = m.photos.length > 1 ? `${m.id}-${n + 1}.jpg` : `${m.id}.jpg`;
      writeFileSync(join(args.photos, name), await get(url, true));
      await sleep(500);
    }
  }
}

for (const m of out) console.log(JSON.stringify(m));
console.error(`${out.length} messages, ids ${out[0]?.id ?? '–'}…${out.at(-1)?.id ?? '–'}, ` +
  `${out.reduce((s, m) => s + m.photos.length, 0)} photos`);
