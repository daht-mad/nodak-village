// 노닥빌리지 그림일기 올리기
//   node diary-api.mjs setup <전화번호>        → 처음 한 번. 그 번호 집의 일기 열쇠를 받아 ~/.openclaw/.env 에 DIARY_KEY로 저장 (열쇠 값은 안 찍음)
//   node diary-api.mjs whoami [저장할경로]     → 내 집(봇 이름·사진) 확인. 경로 주면 봇 사진을 받아 저장(캐릭터 참고 그림)
//   node diary-api.mjs post <diary.json> <그림일기.jpg> → 한 장 올리기. 올라간 주소를 찍는다
// 열쇠: 환경변수 DIARY_KEY. 없으면 ~/.openclaw/.env → ./.env 순서로 찾는다 (입주 폼에서 발급, dk_로 시작)
// 주소: 환경변수 DIARY_API (기본 https://24th-bboya-academy.nodak.co.kr)
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from "node:fs";
import { dirname, resolve, extname, join } from "node:path";
import { homedir } from "node:os";

const API = (process.env.DIARY_API || "https://24th-bboya-academy.nodak.co.kr").replace(/\/$/, "");
const ENV_FILE = join(homedir(), ".openclaw", ".env");
const [, , cmd, a, b] = process.argv;
if (cmd === "setup") { await setup(a); process.exit(0); }

const key = process.env.DIARY_KEY || fromEnvFiles("DIARY_KEY");
if (!key) fail("DIARY_KEY가 없어. 먼저 `node diary-api.mjs setup <집사 전화번호>` 로 열쇠를 받아줘");

if (cmd === "whoami") await whoami(a);
else if (cmd === "post") await post(a, b);
else fail("사용법: node diary-api.mjs setup <전화번호> | whoami [사진저장경로] | post <diary.json> <그림일기.jpg>");

// 전화번호로 열쇠를 받아 .env에 넣는다. 이미 열쇠가 있는 집이면 같은 열쇠가 온다 (새로 만들지 않음 → 다른 기기의 열쇠도 안 죽음)
async function setup(phone) {
  const digits = String(phone || "").replace(/[^0-9]/g, "");
  if (!/^01[0-9]{8,9}$/.test(digits)) fail("사용법: setup 010-0000-0000 (입주할 때 쓴 집사 전화번호)");
  const { key: k, house } = await call({ phone: digits, issueKey: true });
  mkdirSync(dirname(ENV_FILE), { recursive: true });
  const old = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
  const line = `DIARY_KEY=${k}`;
  const next = /^\s*DIARY_KEY\s*=.*$/m.test(old)
    ? old.replace(/^\s*DIARY_KEY\s*=.*$/m, line)
    : `${old}${old && !old.endsWith("\n") ? "\n" : ""}${line}\n`;
  writeFileSync(ENV_FILE, next);
  try { chmodSync(ENV_FILE, 0o600); } catch {}
  console.log(`열쇠 저장 완료 → ${ENV_FILE} (DIARY_KEY) · 집: ${house}`);
}

async function whoami(savePath) {
  const { house } = await call({ key, whoami: true });
  console.log(`집: ${house.slug} · 봇: ${house.mainBot.name || "(이름 없음)"} · 사진: ${house.mainBot.avatar || "(없음)"}`);
  if (savePath && house.mainBot.avatar) {
    const url = new URL(house.mainBot.avatar, API).href;
    const r = await fetch(url);
    if (!r.ok) fail(`봇 사진을 못 받았어 (${r.status})`);
    writeFileSync(savePath, Buffer.from(await r.arrayBuffer()));
    console.log(`봇 사진 저장 → ${resolve(savePath)}`);
  }
}

async function post(jsonPath, imgPath) {
  if (!jsonPath || !imgPath) fail("post <diary.json> <그림일기.jpg>");
  const d = JSON.parse(readFileSync(jsonPath, "utf8"));
  const type = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" }[extname(imgPath).toLowerCase()];
  if (!type) fail("그림일기 파일은 jpg·png·webp만 돼 (render.mjs 결과물을 .jpg로 뽑으면 제일 가벼워)");
  const image = `data:${type};base64,${readFileSync(imgPath).toString("base64")}`;
  const out = await call({ key, date: isoDate(d.date), title: d.title, text: d.text, image });
  console.log(`올라갔어 → ${API}${out.url}`);
}

async function call(body) {
  const r = await fetch(`${API}/api/diary`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) fail(j.error || `서버가 ${r.status}로 답했어`);
  return j;
}

// "2026년 9월 30일 수요일" 같은 글자 날짜도 받아준다. 못 읽으면 서버가 오늘로 넣는다
function isoDate(s = "") {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = /(\d{4})\D+(\d{1,2})\D+(\d{1,2})/.exec(s);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : undefined;
}
function fromEnvFiles(name) {
  for (const f of [join(homedir(), ".openclaw", ".env"), resolve(".env")]) {
    if (!existsSync(f)) continue;
    const m = new RegExp(`^\\s*${name}\\s*=\\s*"?([^"\\n]+)"?`, "m").exec(readFileSync(f, "utf8"));
    if (m) return m[1].trim();
  }
  return "";
}
function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}
