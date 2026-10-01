// 그림일기 한 장 렌더: node render.mjs <diary.json> <out.jpg>  → 인스타 세로 1080×1350 (확장자 .jpg면 JPEG ~300KB, .png면 PNG ~1.3MB)
// diary.json = { date, weather(맑음|구름|흐림|비|눈), title, image(그림 경로, json 기준 상대), text, sign? }
// 크롬 경로가 다르면 CHROME=/경로/chrome node render.mjs ...
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

const [, , jsonPath, outPath] = process.argv;
if (!jsonPath || !outPath) {
  console.error("사용법: node render.mjs <diary.json> <out.png>");
  process.exit(1);
}
const here = dirname(fileURLToPath(import.meta.url));
const d = JSON.parse(readFileSync(jsonPath, "utf8"));
d.image = pathToFileURL(resolve(dirname(jsonPath), d.image)).href;

const html = readFileSync(join(here, "template.html"), "utf8")
  .replaceAll("__FONT_DIR__", pathToFileURL(join(here, "..", "fonts")).href)
  .replace("<script>", `<script>window.DIARY = ${JSON.stringify(d)};</script>\n<script>`);
const tmp = mkdtempSync(join(tmpdir(), "nodak-village-"));
const page = join(tmp, "page.html");
writeFileSync(page, html);

const chrome = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
execFileSync(chrome, [
  "--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
  "--force-device-scale-factor=1", "--virtual-time-budget=4000",
  "--window-size=1080,1350", `--screenshot=${resolve(outPath)}`, pathToFileURL(page).href,
], { stdio: "ignore" });
console.log(`렌더 완료 → ${resolve(outPath)}`);
