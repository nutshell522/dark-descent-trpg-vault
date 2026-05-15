/**
 * apply-checkpoint.ts
 * 套用 Claude /checkpoint 輸出的 checkpoint_summary.yaml
 *
 * 用法：npx ts-node tools/apply-checkpoint.ts checkpoint.yaml
 *
 * 執行內容：
 *   - 更新 player_state.yaml（資源 + 傷勢）
 *   - 列出標記 persist_flag=true 的 NPC（提醒 SESSION END 時處理）
 *   - 列出 new_information（玩家本局獲得的情報）
 *   - 列出 world_conflicts_noted（設定矛盾，提醒玩家）
 *   - 顯示 endgame_check 狀態
 *   - 備份 checkpoint.yaml 到 /sessions/
 *
 * 注意：
 *   - 不會建立 NPC 持久化檔（等 SESSION END 時 Gemini 處理）
 *   - 不需要替換 KB 文件（等 SESSION END 時一起做）
 */

import * as fs   from "fs";
import * as path from "path";
import * as yaml from "js-yaml";

// ─────────────────────────────────────────────────────────────
// 型別定義
// ─────────────────────────────────────────────────────────────

interface NpcChange {
  npc_id: string;
  name: string;
  attitude_delta?: string;
  trust_delta?: number;
  new_memory?: { event: string; emotional_weight: string };
  persist_flag?: boolean;
  persist_reason?: string;
}

interface CreatureChange {
  encounter_id: string;
  template_id?: string;
  outcome?: string;
  persist_flag?: boolean;
  persist_reason?: string;
  backfill_candidate?: boolean;
}

interface ResourceChange {
  resource: string;
  delta: number;
  current_total?: string | number;
}

interface InjuryUpdate {
  description: string;
  clock_slot: number;
  permanent: boolean;
  permanent_detail?: string;
}

interface NewInformation {
  content: string;
  source?: string;
  reliability?: string;
}

interface WorldConflict {
  conflict: string;
  player_decision?: string;
}

interface CheckpointSummary {
  checkpoint_summary: {
    session_id: string;
    date_ingame?: string;
    time_elapsed_ingame?: string;
    npc_changes?: NpcChange[];
    creature_changes?: CreatureChange[];
    resource_changes?: ResourceChange[];
    injury_updates?: InjuryUpdate[];
    new_information?: NewInformation[];
    world_conflicts_noted?: WorldConflict[];
    endgame_check?: string;
    endgame_trigger_condition?: string;
  };
}

// ─────────────────────────────────────────────────────────────
// 工具函式
// ─────────────────────────────────────────────────────────────

const VAULT_ROOT = process.cwd();
const SEP  = "─".repeat(52);
const SEP2 = "═".repeat(52);

function log(msg: string)  { console.log(`  ${msg}`); }
function head(msg: string) { console.log(`\n${SEP}\n  ${msg}\n${SEP}`); }
function warn(msg: string) { console.log(`  ⚠  ${msg}`); }
function ok(msg: string)   { console.log(`  ✓  ${msg}`); }
function skip(msg: string) { console.log(`  –  ${msg}`); }
function info(msg: string) { console.log(`  ·  ${msg}`); }

function loadYaml<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return yaml.load(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    warn(`無法解析 ${path.basename(filePath)}`);
    return null;
  }
}

function saveYaml(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    yaml.dump(data, { lineWidth: 120, quotingType: '"', forceQuotes: false }),
    "utf-8"
  );
}

function resolve(...parts: string[]): string {
  return path.join(VAULT_ROOT, ...parts);
}

// ─────────────────────────────────────────────────────────────
// 更新玩家狀態（player_state.yaml）
// ─────────────────────────────────────────────────────────────

function updatePlayerState(cp: CheckpointSummary["checkpoint_summary"]): void {
  const filePath = resolve("system", "_live", "player_state.yaml");

  if (!fs.existsSync(filePath)) {
    warn("player_state.yaml 不存在，跳過（請先執行 tools/splitter.ts 初始化）");
    return;
  }

  const state = loadYaml<Record<string, unknown>>(filePath) ?? {};
  let anyUpdate = false;

  // ── 資源變化 ──────────────────────────────────────────────
  if (cp.resource_changes?.length) {
    const resources = (state.resources ?? {}) as Record<string, unknown>;

    for (const rc of cp.resource_changes) {
      const key = rc.resource.toLowerCase().replace(/[\s\-]+/g, "_");

      if (rc.current_total !== undefined && rc.current_total !== null) {
        // 優先使用明確的最終值
        resources[key] = rc.current_total;
        ok(`資源更新：${rc.resource} → ${rc.current_total}`);
      } else {
        // fallback：delta 加減
        const current = typeof resources[key] === "number"
          ? (resources[key] as number)
          : parseFloat(String(resources[key] ?? "0")) || 0;
        const newVal = current + rc.delta;
        resources[key] = newVal;
        ok(`資源更新：${rc.resource} ${rc.delta >= 0 ? "+" : ""}${rc.delta} → ${newVal}`);
      }
    }
    state.resources = resources;
    anyUpdate = true;
  } else {
    skip("resource_changes 為空，跳過資源更新");
  }

  // ── 傷勢更新 ──────────────────────────────────────────────
  if (cp.injury_updates?.length) {
    const injuries = ((state.injuries ?? []) as Array<Record<string, unknown>>);

    for (const iu of cp.injury_updates) {
      // 避免重複加入相同描述
      const exists = injuries.some(i => i.description === iu.description);
      if (!exists) {
        injuries.push({
          description:      iu.description,
          clock_slot:       iu.clock_slot,
          permanent:        iu.permanent,
          permanent_detail: iu.permanent_detail ?? null,
          acquired_date:    cp.date_ingame ?? "unknown",
        });
        if (iu.permanent) {
          warn(`永久傷害：${iu.description}${iu.permanent_detail ? `（${iu.permanent_detail}）` : ""}`);
        } else {
          ok(`傷勢新增：${iu.description}（時鐘格 ${iu.clock_slot}）`);
        }
      } else {
        skip(`傷勢已存在，跳過：${iu.description}`);
      }
    }
    state.injuries = injuries;

    // 自動計算 body_clock（取所有非 permanent 傷勢中最高的時鐘格）
    const maxSlot = injuries.reduce((max, i) => {
      const slot = typeof i.clock_slot === "number" ? i.clock_slot : 0;
      return slot > max ? slot : max;
    }, 0);
    state.body_clock = `${maxSlot}/4`;
    ok(`body_clock 更新 → ${maxSlot}/4`);

    anyUpdate = true;
  } else {
    skip("injury_updates 為空，跳過傷勢更新");
  }

  // ── 更新時間戳 ────────────────────────────────────────────
  state.last_updated = `${cp.session_id} checkpoint / ${cp.date_ingame ?? "unknown"}`;

  if (anyUpdate) {
    saveYaml(filePath, state);
    ok("player_state.yaml 已儲存");
  }
}

// ─────────────────────────────────────────────────────────────
// 列出待持久化 NPC（提醒用，不建立檔案）
// ─────────────────────────────────────────────────────────────

function printPersistFlags(cp: CheckpointSummary["checkpoint_summary"]): void {
  const toPerish = (cp.npc_changes ?? []).filter(n => n.persist_flag === true);
  const creaturesToPerish = (cp.creature_changes ?? []).filter(c => c.persist_flag === true);
  const backfillCandidates = (cp.creature_changes ?? []).filter(c => c.backfill_candidate === true);

  if (!toPerish.length && !creaturesToPerish.length) return;

  head("📌 SESSION END 時需要持久化的項目");
  log("（這些項目將在你輸入 SESSION END 後，由 Gemini STEP 3 Gem 正式處理）");
  console.log("");

  if (toPerish.length) {
    log("NPC（需持久化）：");
    for (const n of toPerish) {
      log(`  - ${n.name}（${n.npc_id}）：${n.persist_reason ?? "未說明原因"}`);
    }
  }

  if (creaturesToPerish.length) {
    log("具名生物（需持久化）：");
    for (const c of creaturesToPerish) {
      log(`  - ${c.encounter_id}：${c.persist_reason ?? "未說明原因"}`);
    }
  }

  if (backfillCandidates.length) {
    log("Backfill 候選（SESSION END 後 Gemini 評估）：");
    for (const c of backfillCandidates) {
      log(`  - ${c.encounter_id}（模板：${c.template_id ?? "未知"}）`);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 列出本局獲得的新情報
// ─────────────────────────────────────────────────────────────

function printNewInformation(cp: CheckpointSummary["checkpoint_summary"]): void {
  if (!cp.new_information?.length) return;

  head("💡 本局獲得的情報");
  for (const ni of cp.new_information) {
    const reliability = ni.reliability === "confirmed" ? "✓ 確認"
      : ni.reliability === "suspected" ? "? 推測"
      : "～ 謠言";
    log(`[${reliability}] ${ni.content}`);
    if (ni.source) log(`  來源：${ni.source}`);
  }
}

// ─────────────────────────────────────────────────────────────
// 列出世界設定衝突
// ─────────────────────────────────────────────────────────────

function printWorldConflicts(cp: CheckpointSummary["checkpoint_summary"]): void {
  if (!cp.world_conflicts_noted?.length) return;

  head("⚠  世界設定衝突（已記錄）");
  log("（這些衝突已在本次 checkpoint 記錄，SESSION END 後會整合進世界結算）");
  console.log("");
  for (const wc of cp.world_conflicts_noted) {
    log(`衝突：${wc.conflict}`);
    if (wc.player_decision) log(`裁定：${wc.player_decision}`);
  }
}

// ─────────────────────────────────────────────────────────────
// Endgame 狀態
// ─────────────────────────────────────────────────────────────

function printEndgameCheck(cp: CheckpointSummary["checkpoint_summary"]): void {
  if (!cp.endgame_check || cp.endgame_check === "false") return;

  console.log("");
  if (cp.endgame_check === "imminent") {
    console.log(`  ⚠  ${SEP2.slice(4)}`);
    console.log(`  ⚠  endgame_check: IMMINENT`);
    if (cp.endgame_trigger_condition) console.log(`  ⚠  ${cp.endgame_trigger_condition}`);
    console.log(`  ⚠  請立刻切換至 Claude Opus + 延伸思考`);
    console.log(`  ⚠  ${SEP2.slice(4)}`);
  } else if (cp.endgame_check === "true") {
    console.log(`  ★  ${SEP2.slice(4)}`);
    console.log(`  ★  endgame_check: TRUE — 結局已觸發`);
    if (cp.endgame_trigger_condition) console.log(`  ★  ${cp.endgame_trigger_condition}`);
    console.log(`  ★  請輸入 SESSION END 執行最終結算`);
    console.log(`  ★  ${SEP2.slice(4)}`);
  }
}

// ─────────────────────────────────────────────────────────────
// 備份 checkpoint.yaml 到 /sessions/
// ─────────────────────────────────────────────────────────────

function backupCheckpoint(
  checkpointPath: string,
  cp: CheckpointSummary["checkpoint_summary"]
): void {
  const sessionId  = cp.session_id ?? "unknown";
  const dateTag    = cp.date_ingame?.replace(/[^a-zA-Z0-9_]/g, "_") ?? "unknown";
  const backupName = `${sessionId}_checkpoint_${dateTag}.yaml`;
  const backupPath = resolve("sessions", backupName);

  try {
    fs.mkdirSync(resolve("sessions"), { recursive: true });
    fs.copyFileSync(checkpointPath, backupPath);
    ok(`checkpoint 備份 → /sessions/${backupName}`);
  } catch {
    warn(`備份失敗，原始檔案保留在 ${checkpointPath}`);
  }
}

// ─────────────────────────────────────────────────────────────
// 主程式
// ─────────────────────────────────────────────────────────────

function main(): void {
  const checkpointPath = process.argv[2];

  if (!checkpointPath) {
    console.error("用法：npx ts-node tools/apply-checkpoint.ts checkpoint.yaml");
    process.exit(1);
  }

  const absPath = path.resolve(checkpointPath);
  if (!fs.existsSync(absPath)) {
    console.error(`✗ 找不到 ${absPath}`);
    process.exit(1);
  }

  const file = loadYaml<CheckpointSummary>(absPath);
  if (!file?.checkpoint_summary) {
    console.error("✗ checkpoint.yaml 格式錯誤：找不到 checkpoint_summary 頂層鍵");
    process.exit(1);
  }

  const cp = file.checkpoint_summary;

  console.log(`\n${SEP2}`);
  console.log(`  Dark Descent TRPG — 套用 Checkpoint`);
  console.log(`  Session：${cp.session_id}　${cp.date_ingame ? `/ ${cp.date_ingame}` : ""}`);
  if (cp.time_elapsed_ingame) console.log(`  本局歷時：${cp.time_elapsed_ingame}`);
  console.log(`${SEP2}`);

  // 更新玩家狀態
  head("玩家狀態更新（player_state.yaml）");
  updatePlayerState(cp);

  // 資訊報告（只顯示，不寫檔）
  printNewInformation(cp);
  printWorldConflicts(cp);
  printPersistFlags(cp);
  printEndgameCheck(cp);

  // 備份
  head("備份");
  backupCheckpoint(absPath, cp);

  // 完成摘要
  console.log(`\n${SEP2}`);
  console.log(`  Checkpoint 套用完成`);
  console.log(`  player_state.yaml 已更新`);
  console.log(`  ⚠  KB 不需要現在替換（等 SESSION END 時一起換）`);
  console.log(`${SEP2}\n`);
}

main();
