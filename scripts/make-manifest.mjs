// 공개 레포에 올리기 직전에 돌린다: node scripts/make-manifest.mjs <버전>
// manifest.json = 버전 + 스킬 파일마다 sha256. 봇 쪽 _selfupdate.mjs가 이걸로 새 버전인지·커스텀했는지 본다
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version || "")) { console.error("버전을 줘: node scripts/make-manifest.mjs 1.12.0"); process.exit(1); }
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
