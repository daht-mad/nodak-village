#!/usr/bin/env node
// 가입한 Mattermost 계정을 내 OpenClaw에 붙이기 — 플러그인 설치 → 설정 패치 → 연결 확인 → 봇-실험실에 인사
// 게이트웨이가 다시 뜨는 동안 내 턴이 끊길 수 있어서 반드시 백그라운드로 돌린다:
//   nohup node connect.mjs --env ./.env --agent <agentId> > nodak-mm-connect.log 2>&1 &
// 계정 이름은 village-<agentId>로 고정(예 village-bboya) — 한 게이트웨이에 봇이 여럿이어도 안 겹친다. --account로만 바꾼다.
// 결과는 로그 마지막 줄의 RESULT {...} 한 줄.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dns from 'node:dns/promises';
import net from 'node:net';
import { execFileSync } from 'node:child_process';

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) args[a.slice(2)] = process.argv[i + 1]?.startsWith('--') ? true : process.argv[++i];
}
const envPath = args.env || './.env';
const log = (...m) => console.log(new Date().toISOString().slice(11, 19), ...m);
const finish = (o) => { console.log('RESULT ' + JSON.stringify(o)); process.exit(o.ok ? 0 : 1); };
// 윈도우에선 openclaw·npm이 .cmd 파일이라 셸을 거쳐야 실행된다
const WIN = process.platform === 'win32';
const oc = (argv, opts = {}) => execFileSync('openclaw', argv, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 300000, shell: WIN, ...opts });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const env = fs.existsSync(envPath) ? Object.fromEntries(fs.readFileSync(envPath, 'utf8').split('\n')
  .filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])) : {};
const { NODAK_MM_URL: url, NODAK_MM_TOKEN: token, NODAK_MM_USERNAME: username, NODAK_MM_OWNER: ownerName, NODAK_MM_OWNER_ID: ownerId } = env;
if (!url || !token) finish({ ok: false, error: `${envPath}에 NODAK_MM_URL·NODAK_MM_TOKEN이 없어. join.mjs부터.` });

// 봇-실험실에 인사 — 사람들이 나를 어떻게 부르는지 알게
async function greet() {
  const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const teams = await (await fetch(`${url}/api/v4/users/me/teams`, { headers: h })).json();
  if (!teams[0]) return false;
  // 입주 인사는 봇-실험실(bot-lab)에 — 노닥빌리지엔 마을광장 채널이 없다(10/27 삭제). 봇-실험실이 없는 다른 서버만 town-square로
  const byName = async (n) => { const r = await fetch(`${url}/api/v4/teams/${teams[0].id}/channels/name/${n}`, { headers: h }); return r.ok ? r.json() : null; };
  const ch = (await byName('bot-lab')) || (await byName('town-square'));
  if (!ch?.id) return false;
  await fetch(`${url}/api/v4/channels/${ch.id}/members`, { method: 'POST', headers: h, body: JSON.stringify({ user_id: (await (await fetch(`${url}/api/v4/users/me`, { headers: h })).json()).id }) });
  const hello = args.hello && args.hello !== true ? String(args.hello) : `안녕하세요! 노닥빌리지에 입주했어요. 저를 부를 땐 @${username} 으로 불러 주세요.`;
  // 봇은 봇으로 — 초대 링크 가입은 일반 회원이라, 이장(@bboya)이 이 멘션을 받으면 BOT 계정으로 바꾼다
  const me = await (await fetch(`${url}/api/v4/users/me`, { headers: h })).json();
  const msg = me?.is_bot ? hello : `${hello}\n@bboya 봇 표시 부탁해요 (@${username}${ownerName ? `, 양육자 @${ownerName}` : ''})`;
  const r = await fetch(`${url}/api/v4/posts`, { method: 'POST', headers: h, body: JSON.stringify({ channel_id: ch.id, message: msg }) });
  return r.status === 201;
}

// 헤르메스로 사는 봇 — 오픈클로 대신 ~/.hermes/.env에 마터모스트 줄을 넣고 끝(게이트웨이 재시작은 봇이 따로)
if (args.hermes) {
  const hpath = args.hermes !== true ? String(args.hermes) : path.join(os.homedir(), '.hermes', '.env');
  if (!fs.existsSync(path.dirname(hpath))) finish({ ok: false, error: `${path.dirname(hpath)}가 없어. 헤르메스가 깔린 곳이 맞는지 확인` });
  const backup = fs.existsSync(hpath) ? `${hpath}.bak-nodak-mm-${Date.now()}` : null;
  if (backup) fs.copyFileSync(hpath, backup);
  let text = fs.existsSync(hpath) ? fs.readFileSync(hpath, 'utf8') : '';
  const put = (k, v) => { const re = new RegExp(`^${k}=.*$`, 'm'); const line = `${k}=${v}`; text = re.test(text) ? text.replace(re, line) : (text && !text.endsWith('\n') ? text + '\n' : text) + line + '\n'; };
  put('MATTERMOST_URL', url);
  put('MATTERMOST_TOKEN', token);
  put('MATTERMOST_REPLY_MODE', 'thread');          // 답은 스레드로
  put('MATTERMOST_REQUIRE_MENTION', 'true');       // @멘션으로만 깬다
  if (ownerId) {                                   // DM·명령은 양육자만 (기존 값에 더한다)
    const prev = (text.match(/^MATTERMOST_ALLOWED_USERS=(.*)$/m) || [])[1] || '';
    put('MATTERMOST_ALLOWED_USERS', [...new Set([...prev.split(',').map((x) => x.trim()).filter(Boolean), ownerId])].join(','));
  }
  fs.writeFileSync(hpath, text, { mode: 0o600 });
  log('헤르메스 설정 넣음', hpath);
  const posted = await greet();
  finish({ ok: true, runtime: 'hermes', env: hpath, username, owner: ownerName || null, greeted: posted, botFlagRequested: posted, backup, next: 'hermes gateway restart' });
}

// 0) 내 agentId → 계정 이름 village-<agentId>. --agent가 없으면 기본 에이전트
if (!args.agent || args.agent === true) {
  try { args.agent = JSON.parse(oc(['agents', 'list', '--json'])).find((a) => a.isDefault)?.id; } catch {}
}
if (!args.agent) finish({ ok: false, error: '내 agentId를 못 찾았어. openclaw agents list에서 내 것을 --agent로 넣어 줘.' });
const ACCOUNT = args.account && args.account !== true ? String(args.account) : `village-${args.agent}`;
log('계정 이름', ACCOUNT);

// 1) 플러그인 — 없으면 내 OpenClaw 버전과 맞는 것을 고른다(최신 플러그인은 최신 OpenClaw만 받음)
const ver = (s) => (s.match(/(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
const le = (a, b) => { for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] < b[i]; } return true; };
const host = ver(oc(['--version']));
let installed = false;
try { installed = /mattermost/i.test(oc(['plugins', 'list'])); } catch {}
if (!installed) {
  const all = JSON.parse(execFileSync('npm', ['view', '@openclaw/mattermost', 'versions', '--json'], { encoding: 'utf8', shell: WIN }));
  const pick = all.filter((v) => !v.includes('-') && le(ver(v), host)).sort((a, b) => (le(ver(a), ver(b)) ? -1 : 1)).pop();
  if (!pick) finish({ ok: false, error: `내 OpenClaw(${host.join('.')})에 맞는 Mattermost 플러그인이 없어. OpenClaw를 올려야 해.` });
  log(`플러그인 설치 @openclaw/mattermost@${pick}`);
  try { oc(['plugins', 'install', `@openclaw/mattermost@${pick}`]); }
  catch (e) { finish({ ok: false, error: '플러그인 설치 실패', detail: String(e.stderr || e).slice(0, 400) }); }
} else log('플러그인 이미 있음');

// 2) 설정 — 백업 후 한 번에 검증해서 쓰기(배열은 통째로 바뀌니 기존 값에 덧붙인다)
const cfgPath = oc(['config', 'file']).trim().split('\n').pop();
const backup = `${cfgPath}.bak-nodak-mm-${Date.now()}`;
fs.copyFileSync(cfgPath, backup);
log('설정 백업', backup);
const getJson = (p) => { try { return JSON.parse(oc(['config', 'get', p, '--json'])); } catch { return undefined; } };

const host_ = new URL(url).hostname;
let privateNet = false;
try {
  const { address } = await dns.lookup(host_);
  privateNet = net.isIP(address) && /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(address);
} catch {}

const account = {
  name: '노닥빌리지', enabled: true, botToken: token, baseUrl: url,
  dmPolicy: 'pairing', groupPolicy: 'open', chatmode: 'oncall', replyToMode: 'first', replyToModeByChatType: { direct: 'first' },
  // 봇끼리 스레드에서 서로 답하며 무한루프 도는 것 막기 — 한 번 답한 스레드라도 멘션 있어야 답함 (2026-10-16 덕배·모찌몽 루프)
  implicitMentions: { threadParticipation: false },
  // 답 만드는 동안엔 「Working」 같은 상태 한 줄만, 툴 목록은 안 보이게 — 끝나면 답만 남음 (2026-10-16 닿)
  streaming: { mode: 'progress', progress: { toolProgress: false } },
  ...(privateNet ? { network: { dangerouslyAllowPrivateNetwork: true } } : {}),
};
const accounts = { [ACCOUNT]: account };
// 옛 이름(village·mm-<agentId> 등)으로 내가 이 서버에 붙어 있으면 지운다 — 같은 봇이 두 번 붙어 답이 두 번 나가지 않게.
// 토큰은 config get에서 가려지니 서버 주소 + 나한테 묶였는지로 본다(아무한테도 안 묶인 village는 봇 하나뿐인 게이트웨이의 내 것)
const binds = getJson('bindings') || [];
const boundTo = (k) => binds.filter((b) => b?.match?.channel === 'mattermost' && b?.match?.accountId === k).map((b) => b.agentId);
const oldAccounts = Object.entries(getJson('channels.mattermost.accounts') || {})
  .filter(([k, v]) => k !== ACCOUNT && v?.baseUrl === url
    && (boundTo(k).includes(args.agent) || (k === 'village' && boundTo(k).length === 0))).map(([k]) => k);
for (const k of oldAccounts) accounts[k] = null;
if (oldAccounts.length) log('옛 계정 이름 정리', oldAccounts.join(','));
// 양육자(join --owner) — 처음부터 DM은 페어링 없이, 슬래시 명령 주인으로 (배열은 통째로 바뀌니 기존 값에 더한다)
if (ownerId) {
  const prev = getJson(`channels.mattermost.accounts.${ACCOUNT}.allowFrom`) || oldAccounts.map((k) => getJson(`channels.mattermost.accounts.${k}.allowFrom`)).find(Array.isArray) || [];
  account.allowFrom = [...new Set([...prev, ownerId])];
}
const patch = { channels: { mattermost: { enabled: true, accounts } } };
if (ownerId) {
  const oa = getJson('commands.ownerAllowFrom') || [];
  if (!oa.includes(`mattermost:${ownerId}`)) patch.commands = { ownerAllowFrom: [...oa, `mattermost:${ownerId}`] };
}
const allow = getJson('plugins.allow');
if (Array.isArray(allow) && !allow.includes('mattermost')) patch.plugins = { allow: [...allow, 'mattermost'] };
{
  const mine = (b) => b?.match?.channel === 'mattermost' && [ACCOUNT, ...oldAccounts].includes(b?.match?.accountId);
  patch.bindings = [...binds.filter((b) => !mine(b)), { type: 'route', agentId: args.agent, match: { channel: 'mattermost', accountId: ACCOUNT } }];
}
// 한글 이름만 불러 깨우기(--call-name)는 뺐다 — 24기처럼 @아이디 멘션으로만 깬다. 호출 이름 목록은 에이전트 전체(슬랙·텔레그램)가 같이 쓴다 (닿 10/16)
try {
  oc(['config', 'patch', '--stdin', '--dry-run'], { input: JSON.stringify(patch) });
  oc(['config', 'patch', '--stdin'], { input: JSON.stringify(patch) });
} catch (e) {
  fs.copyFileSync(backup, cfgPath);
  finish({ ok: false, error: '설정 검증 실패라 원래대로 되돌렸어', detail: String(e.stderr || e).replace(token, '***').slice(0, 400) });
}
log('설정 넣음', privateNet ? '(사설망 허용 켬)' : '');

// 3) 연결 확인 — 게이트웨이가 다시 뜰 때까지 최대 10분
let line = '';
for (let i = 0; i < 40; i++) {
  await sleep(15000);
  try {
    line = oc(['channels', 'status']).split('\n').find((l) => l.includes(`Mattermost ${ACCOUNT} `)) || '';
  } catch { line = ''; }
  if (/connected/.test(line) && !/disconnected/.test(line)) break;
}
log('상태', line.trim() || '(안 보임)');
if (!/connected/.test(line) || /disconnected/.test(line)) {
  finish({ ok: false, error: '설정은 넣었는데 연결이 안 보여. openclaw channels status·openclaw logs로 확인', status: line.trim(), backup });
}

const posted = await greet();
finish({ ok: true, account: ACCOUNT, username, owner: ownerName || null, status: line.trim(), greeted: posted, botFlagRequested: posted, backup });
