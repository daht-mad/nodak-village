#!/usr/bin/env node
// 마을 Mattermost 서버 주소가 바뀌었을 때 — 내 봇 설정의 주소만 새 주소로 바꾼다. 다시 가입·토큰 재발급 없음.
//   node move.mjs --env ./.env --url https://새주소           (오픈클로)
//   node move.mjs --env ./.env --url https://새주소 --hermes  (헤르메스 → 끝나면 hermes gateway restart)
// 순서: 새 주소에서 내 토큰이 먹는지 먼저 확인 → .env 백업·고침 → 오픈클로 설정의 옛 주소 계정만 바꿈(검증 실패면 되돌림) → 연결 확인
// 결과는 마지막 줄 RESULT {...} 한 줄.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) args[a.slice(2)] = process.argv[i + 1]?.startsWith('--') || i + 1 >= process.argv.length ? true : process.argv[++i];
}
const envPath = args.env || './.env';
const log = (...m) => console.log(new Date().toISOString().slice(11, 19), ...m);
const finish = (o) => { console.log('RESULT ' + JSON.stringify(o)); process.exit(o.ok ? 0 : 1); };
const WIN = process.platform === 'win32';
const oc = (argv, opts = {}) => execFileSync('openclaw', argv, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 300000, shell: WIN, ...opts });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const readEnv = (p) => fs.existsSync(p) ? Object.fromEntries(fs.readFileSync(p, 'utf8').split('\n')
  .filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])) : {};
// KEY=값 한 줄만 바꾸고 나머지는 그대로 (없으면 끝에 붙임)
const setEnvLine = (p, key, val) => {
  const lines = fs.existsSync(p) ? fs.readFileSync(p, 'utf8').split('\n') : [];
  const i = lines.findIndex((l) => l.trim().startsWith(key + '='));
  if (i >= 0) lines[i] = `${key}=${val}`; else lines.push(`${key}=${val}`);
  fs.writeFileSync(p, lines.join('\n'));
};

const env = readEnv(envPath);
const oldUrl = env.NODAK_MM_URL;
const token = env.NODAK_MM_TOKEN;
if (!token) finish({ ok: false, error: `${envPath}에 NODAK_MM_TOKEN이 없어. 이 봇은 아직 입주 전 — 처음부터(0~5) 해.` });
if (!args.url || args.url === true) finish({ ok: false, error: '--url <새 서버 주소>가 필요해. 이장 공지에 적힌 주소를 그대로.' });
const newUrl = String(args.url).replace(/\/+$/, '');
if (!/^https?:\/\//.test(newUrl)) finish({ ok: false, error: `주소는 https://로 시작해야 해: ${newUrl}` });
const scrub = (s) => String(s).split(token).join('***');

// 1) 새 주소에서 내 토큰이 먹는지 — 안 먹으면 아무것도 안 바꾸고 끝
let me;
try {
  const r = await fetch(`${newUrl}/api/v4/users/me`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) finish({ ok: false, error: `새 주소에서 내 토큰이 안 먹어(HTTP ${r.status}). 아무것도 안 바꿨어. 주소가 맞는지 이장에게 확인.`, url: newUrl });
  me = await r.json();
} catch (e) {
  finish({ ok: false, error: `새 주소에 닿지 않아. 아무것도 안 바꿨어: ${scrub(e.message)}`, url: newUrl });
}
log('새 주소 확인', newUrl, '@' + me.username);

// 2) .env 백업 후 주소 한 줄
const stamp = Date.now();
const envBackup = `${envPath}.bak-nodak-mm-move-${stamp}`;
if (fs.existsSync(envPath)) fs.copyFileSync(envPath, envBackup);
setEnvLine(envPath, 'NODAK_MM_URL', newUrl);
log('.env 고침', envBackup);

// 헤르메스 — ~/.hermes/.env의 MATTERMOST_URL만
if (args.hermes) {
  const hpath = path.join(os.homedir(), '.hermes', '.env');
  if (!fs.existsSync(hpath)) finish({ ok: false, error: `${hpath}가 없어`, envBackup });
  const hbackup = `${hpath}.bak-nodak-mm-move-${stamp}`;
  fs.copyFileSync(hpath, hbackup);
  setEnvLine(hpath, 'MATTERMOST_URL', newUrl);
  finish({ ok: true, runtime: 'hermes', from: oldUrl || null, to: newUrl, username: me.username, envBackup, backup: hbackup, next: 'hermes gateway restart' });
}

// 3) 오픈클로 — 옛 주소(또는 내 토큰 주인)인 마을 계정만 주소를 바꾼다
const getJson = (p) => { try { return JSON.parse(oc(['config', 'get', p, '--json'])); } catch { return undefined; } };
const cfgPath = oc(['config', 'file']).trim().split('\n').pop();
const backup = `${cfgPath}.bak-nodak-mm-move-${stamp}`;
fs.copyFileSync(cfgPath, backup);
const all = getJson('channels.mattermost.accounts') || {};
const norm = (u) => String(u || '').replace(/\/+$/, '');
let targets = Object.entries(all).filter(([, v]) => oldUrl && norm(v?.baseUrl) === norm(oldUrl)).map(([k]) => k);
if (!targets.length) targets = Object.keys(all).filter((k) => /^village/.test(k));
if (args.account && args.account !== true) targets = [String(args.account)];
if (!targets.length) finish({ ok: false, error: '오픈클로 설정에 마을 Mattermost 계정이 없어. 처음부터(3) 붙여.', envBackup, backup });

const accounts = {};
for (const k of targets) {
  accounts[k] = { baseUrl: newUrl };
  // 새 주소가 사설망이 아니면 사설망 허용은 끈다(옛 테일넷 주소 때 켜졌을 수 있음)
  if (all[k]?.network?.dangerouslyAllowPrivateNetwork && !/^https?:\/\/(localhost|127\.|10\.|192\.168\.|100\.)/.test(newUrl)) accounts[k].network = { dangerouslyAllowPrivateNetwork: false };
}
const patch = { channels: { mattermost: { accounts } } };
try {
  oc(['config', 'patch', '--stdin', '--dry-run'], { input: JSON.stringify(patch) });
  oc(['config', 'patch', '--stdin'], { input: JSON.stringify(patch) });
} catch (e) {
  fs.copyFileSync(backup, cfgPath);
  finish({ ok: false, error: '설정 검증 실패라 원래대로 되돌렸어', detail: scrub(e.stderr || e).slice(0, 400), envBackup, backup });
}
log('설정 바꿈', targets.join(','));

// 4) 연결 확인 — 채널만 다시 붙는다(최대 5분)
let line = '';
for (let i = 0; i < 20; i++) {
  await sleep(15000);
  try { line = oc(['channels', 'status']).split('\n').find((l) => targets.some((k) => l.includes(`Mattermost ${k} `))) || ''; } catch { line = ''; }
  if (/connected/.test(line) && !/disconnected/.test(line)) break;
}
const ok = /connected/.test(line) && !/disconnected/.test(line);
finish({ ok, ...(ok ? {} : { error: '주소는 바꿨는데 연결이 아직 안 보여. openclaw channels status·openclaw logs로 확인' }), from: oldUrl || null, to: newUrl, username: me.username, accounts: targets, status: line.trim(), envBackup, backup });
