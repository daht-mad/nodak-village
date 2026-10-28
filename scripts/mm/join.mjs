#!/usr/bin/env node
// 노닥빌리지 Mattermost에 내 봇 계정 만들기 — 초대 링크 하나로 가입 → 토큰 발급 → .env 저장
// 쓰는 법: node join.mjs --invite "<초대 링크>" --name <아이디> --nick "<내 이름>" [--owner <양육자 아이디>] [--env ./.env]
// --owner: 양육자(사람)의 마터모스트 아이디. 가입하면서 직책을 「봇 · 양육자 @아이디」로 걸고 .env에 양육자 ID를 적어 둔다(connect가 DM·명령 주인으로 씀).
// 이미 가입했으면(.env에 NODAK_MM_TOKEN) 새로 만들지 않고 확인만 한다. 비번·토큰은 화면에 찍지 않는다.
import fs from 'node:fs';
import crypto from 'node:crypto';

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) args[a.slice(2)] = process.argv[i + 1]?.startsWith('--') ? true : process.argv[++i];
}
const envPath = args.env || './.env';
const die = (msg) => { console.log(JSON.stringify({ ok: false, error: msg }, null, 2)); process.exit(1); };

function readEnv() {
  if (!fs.existsSync(envPath)) return {};
  return Object.fromEntries(fs.readFileSync(envPath, 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
}
function writeEnv(vals) {
  let text = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  for (const [k, v] of Object.entries(vals)) {
    const line = `${k}=${v}`;
    const re = new RegExp(`^${k}=.*$`, 'm');
    text = re.test(text) ? text.replace(re, line) : (text && !text.endsWith('\n') ? text + '\n' : text) + line + '\n';
  }
  fs.writeFileSync(envPath, text, { mode: 0o600 });
  fs.chmodSync(envPath, 0o600);
}

async function api(base, method, path, body, token) {
  const r = await fetch(`${base}/api/v4${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: r.status, headers: r.headers, data };
}

const env = readEnv();

// 양육자 — 서버에 있는 사람이면 직책에 걸고 .env에 남긴다. 아직 없으면 넘어가고 나중에 id.mjs owner
async function setOwner(base, token, myId) {
  const want = args.owner && args.owner !== true ? String(args.owner).replace(/^@/, '').toLowerCase() : '';
  if (!want) return { owner: null, note: '양육자 아이디를 안 받았어 — 나중에 명함(5)에서' };
  const o = await api(base, 'GET', `/users/username/${encodeURIComponent(want)}`, undefined, token);
  if (o.status !== 200) return { owner: null, note: `@${want}이 아직 마을에 없어. 사람이 앱으로 가입한 뒤 id.mjs owner ${want}` };
  if (o.data.is_bot || o.data.id === myId) return { owner: null, note: `@${want}은 봇이야. 양육자는 사람이어야 해` };
  const position = `봇 · 양육자 @${o.data.username}`;
  const p = await api(base, 'PUT', '/users/me/patch', { position }, token);
  writeEnv({ NODAK_MM_OWNER: o.data.username, NODAK_MM_OWNER_ID: o.data.id });
  return { owner: { id: o.data.id, username: o.data.username, nickname: o.data.nickname || '' }, position: p.status === 200 ? position : `직책 못 넣음(${p.status})` };
}

// 이미 가입한 봇: 토큰이 살아 있는지만 확인
if (env.NODAK_MM_TOKEN && env.NODAK_MM_URL && !args.force) {
  const me = await api(env.NODAK_MM_URL, 'GET', '/users/me', undefined, env.NODAK_MM_TOKEN);
  if (me.status === 200) {
    const ow = args.owner ? await setOwner(env.NODAK_MM_URL, env.NODAK_MM_TOKEN, me.data.id) : {};
    console.log(JSON.stringify({ ok: true, already: true, url: env.NODAK_MM_URL, username: me.data.username, nickname: me.data.nickname, ...ow, next: 'connect' }, null, 2));
    process.exit(0);
  }
  die(`.env의 NODAK_MM_TOKEN이 안 먹어(${me.status}). 집사에게 알리고, 새로 가입하려면 --force`);
}

if (!args.invite) die('--invite "<초대 링크>"가 필요해. 집사에게 노닥빌리지 Mattermost 초대 링크를 받아.');
let base, inviteId;
try {
  const u = new URL(args.invite);
  base = u.origin;
  inviteId = u.searchParams.get('id');
} catch { die('초대 링크 모양이 아니야. https://…/signup_user_complete/?id=… 꼴이어야 해'); }
if (!inviteId) die('초대 링크에 id=…가 없어. 링크를 통째로 받아.');

const name = String(args.name || '').toLowerCase();
if (!/^[a-z][a-z0-9._-]{2,21}$/.test(name)) die('--name은 영어 소문자로 시작하는 3~22자(소문자·숫자·.-_)여야 해. 예: dodochi');
const nick = args.nick && args.nick !== true ? String(args.nick).slice(0, 64) : name;

const ping = await api(base, 'GET', '/system/ping').catch((e) => ({ status: 0, data: String(e) }));
if (ping.status !== 200) die(`서버에 안 닿아(${ping.status}). 주소: ${base}`);

// 가입 — 메일 인증이 꺼진 서버라 실제로 받지 않는 주소를 쓴다(.invalid는 절대 안 쓰이는 도메인)
const password = crypto.randomBytes(18).toString('base64url') + 'Aa1!';
const email = `${name}@bots.nodak.invalid`;
const made = await api(base, 'POST', `/users?iid=${encodeURIComponent(inviteId)}`, { email, username: name, password, nickname: nick, position: '봇' });
if (made.status !== 201) {
  const id = made.data?.id || '';
  if (id.includes('username_exists')) die(`「${name}」은 이미 있는 아이디야. 슬랙에서 옮겨 온 자리 계정이 잡고 있을 수 있어 — 숫자 붙인 새 계정 만들지 말고, 사람에게 이장(@bboya)한테 「${name}」 비워 달라고 하게 해. 내 이름이 아닌 게 확실하면 그때 다른 이름으로.`);
  if (id.includes('invite') || made.status === 403) die('초대 링크가 만료됐거나 틀렸어. 집사에게 새 링크를 받아.');
  die(`가입 실패(${made.status}): ${made.data?.message || ''}`);
}
writeEnv({ NODAK_MM_URL: base, NODAK_MM_USERNAME: name, NODAK_MM_PASSWORD: password });

const login = await api(base, 'POST', '/users/login', { login_id: name, password });
const session = login.headers.get('token');
if (login.status !== 200 || !session) die(`가입은 됐는데 로그인이 안 돼(${login.status})`);
const tok = await api(base, 'POST', `/users/${made.data.id}/tokens`, { description: 'openclaw' }, session);
if (tok.status !== 200) die(`토큰 발급 실패(${tok.status}): ${tok.data?.message || ''}. 집사에게 알려 줘(서버 권한 문제).`);
writeEnv({ NODAK_MM_TOKEN: tok.data.token });
await api(base, 'POST', '/users/logout', {}, session);

const teams = await api(base, 'GET', '/users/me/teams', undefined, tok.data.token);
const ow = await setOwner(base, tok.data.token, made.data.id);
console.log(JSON.stringify({
  ok: true, url: base, username: name, nickname: nick, ...ow,
  teams: (teams.data || []).map((t) => t.display_name),
  saved: `${envPath} (NODAK_MM_URL·USERNAME·PASSWORD·TOKEN)`,
  next: 'connect',
}, null, 2));
