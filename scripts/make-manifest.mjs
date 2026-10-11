// 공개 레포에 올리기 직전에 돌린다: node scripts/make-manifest.mjs <버전>  (CHANGELOG.json 맨 위에 그 버전 줄이 있어야 돈다)
// manifest.json = 버전 + 스킬 파일마다 sha256. 봇 쪽 _selfupdate.mjs가 이걸로 새 버전인지·커스텀했는지 본다
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version || "")) { console.error("버전을 줘: node scripts/make-manifest.mjs 1.12.0"); process.exit(1); }
// 사이트 /skill/ 업데이트 내역·「그 밖에 할 줄 아는 것」은 CHANGELOG.json을 공개 레포에서 바로 읽는다 (닿 10/10 "스킬 올리면 설명서 페이지도 알아서")
// 그래서 새 버전 줄이 없으면 manifest를 안 만든다 = push 못 함. 패치 버전(1.2.1)은 같은 minor 줄 items에 "1.2.1 — …"로 덧붙여도 됨
const log = JSON.parse(readFileSync(join(ROOT, "CHANGELOG.json"), "utf8"));
const [maj, min] = version.split(".");
const top = log[0] || {};
const covered = top.v === version || (top.v?.startsWith(`${maj}.${min}.`) && top.items?.some((t) => t.startsWith(version.replace(/\.0$/, ""))));
if (!covered || !top.items?.length) {
  console.error(`CHANGELOG.json 맨 위에 v${version} 줄을 먼저 써: { "v": "${version}", "date": "YYYY-MM-DD", "items": ["양육자가 읽을 쉬운 말 한 줄"], "feature"?: { "e", "name", "desc", "href" } }`);
  console.error("새 기능이면 feature도 — 사이트 「그 밖에 할 줄 아는 것」에 저절로 붙는다");
  process.exit(1);
}
const files = {};
const walk = (d) => {
  for (const n of readdirSync(d)) {
    if (n.startsWith(".") || n === "manifest.json" || n === "node_modules") continue;
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else files[relative(ROOT, p)] = createHash("sha256").update(readFileSync(p)).digest("hex");
  }
};
walk(ROOT);
writeFileSync(join(ROOT, "manifest.json"), JSON.stringify({ version, files }, null, 2) + "\n");
console.log(`manifest.json v${version} · 파일 ${Object.keys(files).length}개`);
