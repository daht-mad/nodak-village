// 그림일기 한 장 렌더: node render.mjs <diary.json> <out.jpg>  → 인스타 세로 1080×1350 (확장자 .jpg면 JPEG ~300KB, .png면 PNG ~1.3MB)
// diary.json = { date, weather(맑음|구름|흐림|비|눈), title, image(그림 경로, json 기준 상대), text, sign? }
// 크롬 경로가 다르면 CHROME=/경로/chrome node render.mjs ...
// WSL(윈도우 안 리눅스)에서 윈도우 크롬(chrome.exe)을 쓰면, 윈도우 크롬은 리눅스 쪽 /tmp 를 못 읽고 못 쓴다 →
// 작업 폴더를 윈도우 디스크(/mnt/c/…)에 만들고 그림·폰트를 거기로 복사해서 찍은 뒤 결과만 옮겨 온다 (10/6 다비스네 제보)
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

const [, , jsonPath, outPath] = process.argv;
if (!jsonPath || !outPath) {
  console.error("사용법: node render.mjs <diary.json> <out.png>");
  process.exit(1);
}
const here = dirname(fileURLToPath(import.meta.url));
const d = JSON.parse(readFileSync(jsonPath, "utf8"));
const imgSrc = resolve(dirname(jsonPath), d.image);

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
const winChrome = isWSL && /\.exe$/i.test(chrome); // WSL에서 윈도우 크롬을 부르는 경우

// 크롬이 읽고 쓸 작업 폴더 — 윈도우 크롬이면 윈도우 디스크 위에
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
// 크롬에 넘길 경로: 윈도우 크롬이면 C:/… 꼴, 아니면 그대로
const forChrome = (p) => winChrome ? execFileSync("wslpath", ["-m", p], { encoding: "utf8" }).trim() : p;
const fileUrl = (p) => winChrome ? "file:///" + encodeURI(forChrome(p)) : pathToFileURL(p).href;

// 그림·폰트를 작업 폴더로 복사해 상대 경로로 부른다 (어느 크롬이든 이 폴더만 보면 됨)
const imgName = "picture" + (extname(imgSrc) || ".png");
copyFileSync(imgSrc, join(tmp, imgName));
copyFileSync(join(here, "..", "fonts", "PoorStory-Regular.ttf"), join(tmp, "PoorStory-Regular.ttf"));
d.image = imgName;

const html = readFileSync(join(here, "template.html"), "utf8")
  .replaceAll("__FONT_DIR__", ".")
  .replace("<script>", `<script>window.DIARY = ${JSON.stringify(d)};</script>\n<script>`);
const page = join(tmp, "page.html");
writeFileSync(page, html);

const shot = join(tmp, "out" + (extname(outPath) || ".png"));
try {
  execFileSync(chrome, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
    "--force-device-scale-factor=1", "--virtual-time-budget=4000",
    "--window-size=1080,1350", `--screenshot=${forChrome(shot)}`, fileUrl(page),
  ], { stdio: "ignore" });
} catch {}
if (!existsSync(shot)) {
  console.error(`✗ 크롬이 그림일기를 못 찍었어 (${chrome}). 크롬 경로가 다르면 CHROME=/경로/chrome 을 붙여서 다시 실행해줘`);
  process.exit(1);
}
copyFileSync(shot, resolve(outPath));
try { rmSync(tmp, { recursive: true, force: true }); } catch {}
console.log(`렌더 완료 → ${resolve(outPath)}`);
