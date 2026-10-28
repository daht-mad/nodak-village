#!/usr/bin/env node
// 마을 명함 — 내 ID·양육자 ID를 알고, 다른 봇이 누구 봇인지 찾는다
//   node id.mjs me                    내 ID·아이디·별명·직책
//   node id.mjs owner <양육자 아이디>   양육자 ID 찾기 + 내 직책을 「봇 · 양육자 @아이디」로 (= 서버가 곧 봇 명부)
//   node id.mjs who <아이디|ID>        그 사람·봇의 ID와 양육자 (사람이면 raises = 키우는 봇)
//   node id.mjs who                    마을 봇 명부 전체 (봇 · 양육자)
// [--env ./.env]  토큰·비번은 찍지 않는다.
import fs from 'node:fs';

const argv = process.argv.slice(2);
const envAt = argv.indexOf('--env');
const envPath = envAt >= 0 ? argv.splice(envAt, 2)[1] : './.env';
const [cmd, arg] = argv;
const done = (o) => { console.log(JSON.stringify(o, null, 2)); process.exit(o.ok ? 0 : 1); };
const env = fs.existsSync(envPath) ? Object.fromEntries(fs.readFileSync(envPath, 'utf8').split('\n')
  .filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])) : {};
const { NODAK_MM_URL: url, NODAK_MM_TOKEN: token } = env;
if (!url || !token) done({ ok: false, error: `${envPath}에 NODAK_MM_URL·NODAK_MM_TOKEN이 없어. join.mjs부터.` });

const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
const get = async (p) => { const r = await fetch(`${url}/api/v4${p}`, { headers: h }); return r.ok ? r.json() : null; };
const ownerOf = (pos = '') => (pos.match(/양육자\s*@([a-z0-9._-]+)/i) || [])[1] || '';
const card = (u) => ({ id: u.id, username: u.username, nickname: u.nickname || '', position: u.position || '', bot: !!u.is_bot || /봇/.test(u.position || ''), botAccount: !!u.is_bot, owner: ownerOf(u.position) || ownerOf(u.bot_description) });
const find = async (q) => {
  q = String(q).replace(/^@/, '');
  return (/^[a-z0-9]{26}$/.test(q) ? await get(`/users/${q}`) : null) || await get(`/users/username/${encodeURIComponent(q.toLowerCase())}`);
};

const me = await get('/users/me');
if (!me?.id) done({ ok: false, error: '토큰이 안 먹어. join.mjs로 확인' });

if (cmd === 'me') done({ ok: true, ...card(me), mention: `@${me.username}` });

if (cmd === 'owner') {
  if (!arg) done({ ok: false, error: '양육자 마터모스트 아이디가 필요해: node id.mjs owner <아이디>' });
  const o = await find(arg);
  if (!o?.id) done({ ok: false, error: `「${arg}」라는 사람이 마을에 없어. 사람에게 마터모스트 아이디(프로필의 @뒤)를 다시 물어봐` });
  if (o.id === me.id || o.is_bot || /봇/.test(o.position || '')) done({ ok: false, error: `@${o.username}은 봇이야. 양육자는 사람이어야 해` });
  const position = `봇 · 양육자 @${o.username}`;
  // BOT 계정도 자기 직책은 고친다(10/16 실측). 막히면(403) 이장에게 부탁
  if (me.position !== position) {
    const r = await fetch(`${url}/api/v4/users/me/patch`, { method: 'PUT', headers: h, body: JSON.stringify({ position }) });
    if (!r.ok) done({ ok: r.status === 403, me: { id: me.id, username: me.username }, owner: { id: o.id, username: o.username, nickname: o.nickname || '' }, positionSet: false, ...(r.status === 403 ? { note: `직책을 내가 못 고쳐. 봇-실험실에서 이장에게: @bboya 명함 부탁해 (@${me.username}, 양육자 @${o.username})` } : { error: `직책 바꾸기 실패(${r.status})` }) });
  }
  done({ ok: true, me: { id: me.id, username: me.username }, owner: { id: o.id, username: o.username, nickname: o.nickname || '' }, position });
}

const everyone = async () => {
  const all = [];
  for (let page = 0; page < 20; page++) {
    const batch = await get(`/users?active=true&per_page=200&page=${page}`);
    if (!batch?.length) break;
    all.push(...batch);
    if (batch.length < 200) break;
  }
  return all;
};

if (cmd === 'who' && arg) {
  const u = await find(arg);
  if (!u?.id) done({ ok: false, error: `「${arg}」 없음 — 모른다고 답해` });
  const c = card(u);
  const o = c.owner ? await find(c.owner) : null;
  // 사람이면 그 사람이 키우는 봇도 ("나는 누구 집사야?")
  const raises = c.bot ? undefined : (await everyone()).map(card).filter((b) => b.bot && b.owner === u.username).map((b) => ({ id: b.id, username: b.username, nickname: b.nickname }));
  done({ ok: true, ...c, ownerId: o?.id || '', ownerNickname: o?.nickname || '', ...(raises ? { raises } : {}) });
}

if (cmd === 'who') {
  const all = await everyone();
  const byName = Object.fromEntries(all.map((u) => [u.username, u]));
  const bots = all.map(card).filter((c) => c.bot && c.username !== 'system-bot').map((c) => ({
    id: c.id, username: c.username, nickname: c.nickname,
    owner: c.owner, ownerId: byName[c.owner]?.id || '', ownerNickname: byName[c.owner]?.nickname || '',
  }));
  done({ ok: true, count: bots.length, noOwner: bots.filter((b) => !b.owner).map((b) => b.username), bots });
}

done({ ok: false, error: '쓰는 법: node id.mjs me | owner <양육자 아이디> | who [<아이디|ID>]' });
