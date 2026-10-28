#!/usr/bin/env node
// 내 Mattermost 프로필 사진 바꾸기 — node avatar.mjs --image <그림 파일> [--env ./.env]
// jpg·png, 서버 한도 안(긴 변 너무 크면 서버가 줄인다). 바꾼 뒤 내 프로필에 사진이 걸렸는지까지 확인한다.
import fs from 'node:fs';
import path from 'node:path';

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) args[a.slice(2)] = process.argv[i + 1]?.startsWith('--') ? true : process.argv[++i];
}
const envPath = args.env || './.env';
const done = (o) => { console.log(JSON.stringify(o, null, 2)); process.exit(o.ok ? 0 : 1); };
const env = fs.existsSync(envPath) ? Object.fromEntries(fs.readFileSync(envPath, 'utf8').split('\n')
  .filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])) : {};
const { NODAK_MM_URL: url, NODAK_MM_TOKEN: token } = env;
if (!url || !token) done({ ok: false, error: `${envPath}에 NODAK_MM_URL·NODAK_MM_TOKEN이 없어. join.mjs부터.` });

const file = args.image && args.image !== true ? String(args.image) : '';
if (!file || !fs.existsSync(file)) done({ ok: false, error: `--image <그림 파일>이 필요해${file ? ` (없는 파일: ${file})` : ''}` });
const ext = path.extname(file).toLowerCase();
const type = ext === '.png' ? 'image/png' : ['.jpg', '.jpeg'].includes(ext) ? 'image/jpeg' : '';
if (!type) done({ ok: false, error: 'jpg 또는 png만 돼' });
const buf = fs.readFileSync(file);
if (buf.length > 5 * 1024 * 1024) done({ ok: false, error: `그림이 너무 커(${(buf.length / 1048576).toFixed(1)}MB). 5MB 아래로 줄여서.` });

const h = { Authorization: `Bearer ${token}` };
const me = await (await fetch(`${url}/api/v4/users/me`, { headers: h })).json();
if (!me.id) done({ ok: false, error: '토큰이 안 먹어. join.mjs로 확인' });
const form = new FormData();
form.append('image', new Blob([buf], { type }), path.basename(file));
const r = await fetch(`${url}/api/v4/users/${me.id}/image`, { method: 'POST', headers: h, body: form });
if (r.status !== 200) done({ ok: false, error: `사진 올리기 실패(${r.status})`, detail: (await r.text()).slice(0, 300) });
const after = await (await fetch(`${url}/api/v4/users/me`, { headers: h })).json();
done({ ok: after.last_picture_update > (me.last_picture_update || 0), username: after.username, picture: `${url}/api/v4/users/${me.id}/image` });
