// 키링 자랑판 한 장 → 1080×1080
//   3장: node keyring-board.mjs "<집 이름>" <상추수확> <모닥불> <그림일기> <out.png>                       → 「○○네 키링」
//   6장: node keyring-board.mjs "<집 이름>" <상추수확> <방명록> <노트북> <사진관> <그림일기> <모닥불> <out.png> → 「○○네 하루」 2×3, 아침~밤 딱지
// 키링 그림은 흰 바탕이면 된다 — 바탕·고리 구멍은 판이 알아서 걷어 낸다
// 크롬 경로가 다르면 CHROME=/경로/chrome node keyring-board.mjs ...
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

const [, , name, ...rest] = process.argv;
const n = rest.length - 1, outPath = rest[n];
if (!name || (n !== 3 && n !== 6)) {
  console.error('사용법: node keyring-board.mjs "<집 이름>" <상추수확> <모닥불> <그림일기> <out.png>');
  console.error('   또는: node keyring-board.mjs "<집 이름>" <상추수확> <방명록> <노트북> <사진관> <그림일기> <모닥불> <out.png>');
  process.exit(1);
}
const DAY = { times: ["아침", "오전", "점심", "오후", "저녁", "밤"], acts: ["상추수확", "방명록 발도장", "노트북 마을 짓기", "사진관 찰칵", "그림일기", "모닥불"] };
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
const imgs = rest.slice(0, n).map((p) => {
  const f = resolve(p), m = MIME[extname(f).toLowerCase()];
  if (!existsSync(f)) { console.error(`✗ 그림이 없어: ${p}`); process.exit(1); }
  if (!m) { console.error(`✗ png·jpg·webp만 돼: ${p}`); process.exit(1); }
  return `data:${m};base64,${readFileSync(f).toString("base64")}`;
});
const here = dirname(fileURLToPath(import.meta.url));

const isWSL = process.platform === "linux" && (() => { try { return /microsoft/i.test(readFileSync("/proc/version", "utf8")); } catch { return false; } })();
const findChrome = () => {
  if (process.env.CHROME) return process.env.CHROME;
  const cands = process.platform === "darwin" ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
    : process.platform === "win32" ? ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"]
    : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/snap/bin/chromium",
       ...(isWSL ? ["/mnt/c/Program Files/Google/Chrome/Application/chrome.exe", "/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe"] : [])];
  return cands.find((p) => existsSync(p)) || cands[0];
};
const chrome = findChrome();
const winChrome = isWSL && /\.exe$/i.test(chrome);
let base = tmpdir();
if (winChrome) {
  base = "/mnt/c/Users/Public/nodak-village-tmp";
  try {
    const t = execFileSync("cmd.exe", ["/c", "echo %TEMP%"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (t && !t.includes("%")) base = execFileSync("wslpath", ["-u", t], { encoding: "utf8" }).trim();
  } catch {}
  mkdirSync(base, { recursive: true });
}
const tmp = mkdtempSync(join(base, "nodak-village-"));
const forChrome = (p) => winChrome ? execFileSync("wslpath", ["-m", p], { encoding: "utf8" }).trim() : p;
const fileUrl = (p) => winChrome ? "file:///" + encodeURI(forChrome(p)) : pathToFileURL(p).href;

copyFileSync(join(here, "..", "fonts", "Pretendard-Black.woff2"), join(tmp, "Pretendard-Black.woff2"));
const tpl = n === 6 ? "keyring-day.html" : "keyring-board.html";
const kr = { name: String(name).slice(0, 20), imgs, ...(n === 6 ? DAY : {}) };
const html = readFileSync(join(here, "..", "references", tpl), "utf8")
  .replace("<script>", `<script>window.KR = ${JSON.stringify(kr)};</script>\n<script>`);
const page = join(tmp, "page.html");
writeFileSync(page, html);
const shot = join(tmp, "out.png");
try {
  execFileSync(chrome, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
    "--force-device-scale-factor=1", "--virtual-time-budget=15000",
    "--window-size=1080,1080", `--screenshot=${forChrome(shot)}`, fileUrl(page),
  ], { stdio: "ignore" });
} catch {}
if (!existsSync(shot)) {
  console.error(`✗ 크롬이 자랑판을 못 찍었어 (${chrome}). 크롬 경로가 다르면 CHROME=/경로/chrome 을 붙여서 다시 실행해줘`);
  process.exit(1);
}
copyFileSync(shot, resolve(outPath));
try { rmSync(tmp, { recursive: true, force: true }); } catch {}
console.log(`자랑판 완료 → ${resolve(outPath)}`);
