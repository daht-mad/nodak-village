// 스킬 저절로 최신 유지 (닿 2026-10-06 "스킬 쓸 때 항상 업데이트해서 쓰게끔 — 매번 공지하는 게 아니라")
// village-api.mjs가 맨 처음 부른다. 한 시간에 한 번 공개 레포의 manifest.json 버전과 비교해서
//   - 새 버전이 있고 내 스킬 파일을 아무도 안 고쳤으면 → openclaw skills install --force 로 받고, 같은 명령을 새 스크립트로 다시 돌린다
//   - 내 스킬 파일을 고쳐 뒀으면(커스텀) → 덮어쓰지 않는다. 새 버전이 있다는 한 줄만 찍는다
// 고치고 싶은 건 스킬 파일 말고 내 워크스페이스 메모장에 — 그래야 자동 업데이트를 계속 받는다
// manifest.json이 없으면(개발본) 아무것도 안 한다. 끄려면 VILLAGE_AUTO_UPDATE=0
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = "daht-mad/nodak-village";
const REMOTE = process.env.VILLAGE_MANIFEST_URL || `https://raw.githubusercontent.com/${REPO}/main/manifest.json`; // 시험용으로 바꿀 수 있음
const STAMP = join(ROOT, ".update-check");
const HOUR = 3600e3;

const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const newer = (a, b) => { // a가 b보다 새 버전이면 true
  const x = String(a).split(".").map(Number), y = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
};

// 받은 그대로인지 — manifest에 적힌 파일이 하나라도 다르거나 없으면 커스텀
export function customized(manifest, root = ROOT) {
  return Object.entries(manifest.files || {}).filter(([f, h]) => !existsSync(join(root, f)) || sha(join(root, f)) !== h).map(([f]) => f);
}

export async function selfUpdate({ force = false } = {}) {
  if (process.env.VILLAGE_UPDATED) return "latest"; // 방금 받고 다시 도는 중
  if (process.env.VILLAGE_AUTO_UPDATE === "0") return "skip";
  const mf = join(ROOT, "manifest.json");
  if (!existsSync(mf)) return "skip";
  let stamp = {};
  try { stamp = JSON.parse(readFileSync(STAMP, "utf8")); } catch {}
  if (!force && Date.now() - (stamp.at || 0) < HOUR) return "skip";
  try { writeFileSync(STAMP, JSON.stringify({ at: Date.now() })); } catch {}

  const local = JSON.parse(readFileSync(mf, "utf8"));
  let remote;
  try {
    const r = await fetch(REMOTE, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return "offline";
    remote = await r.json();
  } catch { return "offline"; } // 인터넷이 안 되면 그냥 지금 버전으로
  if (!newer(remote.version, local.version)) return "latest";

  const changed = customized(local);
  if (changed.length) {
    console.error(`ℹ️ 노닥빌리지 스킬 새 버전 v${remote.version}이 있어 (지금 v${local.version}). 스킬 파일을 고친 데가 있어서(${changed.slice(0, 3).join(", ")}${changed.length > 3 ? " 등" : ""}) 자동으로 덮어쓰지 않았어. 집사한테 물어보고 받으려면: openclaw skills install --force git:${REPO}`);
    return "custom";
  }
  console.error(`⬆️ 노닥빌리지 스킬 v${local.version} → v${remote.version} 받는 중…`);
  const inst = spawnSync("openclaw", ["skills", "install", "--force", `git:${REPO}`], { stdio: ["ignore", "ignore", "pipe"], timeout: 120e3, encoding: "utf8" });
  let now = local.version;
  try { now = JSON.parse(readFileSync(mf, "utf8")).version; } catch {}
  if (inst.status !== 0 || now === local.version) {
    // 다른 자리에 깔렸거나 실패 — 하루 동안은 다시 안 시도한다
    try { writeFileSync(STAMP, JSON.stringify({ at: Date.now() + 23 * HOUR })); } catch {}
    console.error(`⚠️ 자동 업데이트를 못 했어 (${(inst.stderr || inst.error?.message || "설치 위치가 달라").trim().split("\n").pop()}). 지금 버전으로 계속할게. 직접 받으려면: openclaw skills install --force git:${REPO}`);
    return "failed";
  }
  console.error(`✅ v${now} 받았어. 새 버전으로 이어서 할게`);
  const again = spawnSync(process.execPath, process.argv.slice(1), { stdio: "inherit", env: { ...process.env, VILLAGE_UPDATED: "1" } });
  process.exit(again.status ?? 1);
}
