/**
 * generate-session-start.ts
 * 讀取 system/_live/ 的動態狀態，結合 SESSION_RESET_template.md，
 * 生成 SESSION_START.md（內嵌當前世界狀態，不需要手動上傳 KB）。
 * 生成後自動把內容複製到 Windows 剪貼板。
 *
 * 用法：npx ts-node tools/generate-session-start.ts
 */

import * as fs   from "fs";
import * as path from "path";
import { execSync } from "child_process";

const VAULT         = path.join(__dirname, "..");
const LIVE_DIR      = path.join(VAULT, "system", "_live");
const TEMPLATE_PATH = path.join(VAULT, "prompts", "claude", "SESSION_RESET_template.md");
const OUTPUT_PATH   = path.join(VAULT, "SESSION_START.md");

// ─── 工具函式 ──────────────────────────────────────────────────────────────

function readFile(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf-8");
}

/**
 * 從 session_log.md 中取出最後一個非 archived 的完整 session block。
 * 邏輯與 compress-session-log.ts 的 parseSessionBlocks 保持一致。
 */
function extractLastFullSessionBlock(log: string): string | null {
  const firstIdx = log.indexOf("\n## Session ");
  const body     = firstIdx >= 0 ? log.slice(firstIdx + 1) : log;
  const lines    = body.split("\n");

  const blocks: { content: string; archived: boolean }[] = [];
  let current: { content: string; archived: boolean } | null = null;

  for (const line of lines) {
    if (/^## Session \d+/.test(line)) {
      if (current) blocks.push(current);
      current = { content: line + "\n", archived: line.includes("<!-- archived -->") };
    } else if (current) {
      current.content += line + "\n";
    }
  }
  if (current) blocks.push(current);

  for (let i = blocks.length - 1; i >= 0; i--) {
    if (!blocks[i].archived) return blocks[i].content.trimEnd();
  }
  return null;
}

/**
 * 從 session_log.md 全文中找出最後一個 scene_checkpoint 區塊。
 * scene_checkpoint 在 YAML 中為 2-space indent 的鍵。
 */
function extractLastSceneCheckpoint(log: string): string | null {
  const lines = log.split("\n");
  let checkpointLine = -1;

  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^  scene_checkpoint:/.test(lines[i])) {
      checkpointLine = i;
      break;
    }
  }
  if (checkpointLine === -1) return null;

  const result: string[] = [lines[checkpointLine]];

  for (let i = checkpointLine + 1; i < lines.length; i++) {
    const line = lines[i];
    // 停止條件：遇到同縮排（2 空格）的下一個鍵，或 Session heading
    if (/^  [a-z_]+:/.test(line) && !/^  -/.test(line)) break;
    if (/^## Session/.test(line)) break;
    result.push(line);
  }

  // 移除尾端空行
  while (result.length > 0 && result[result.length - 1].trim() === "") result.pop();

  return result.join("\n");
}

/**
 * 計算本次 session_id：統計所有 ## Session 標題數 + 1。
 */
function calculateNextSessionId(log: string): string {
  const count = (log.match(/^## Session /gm) ?? []).length;
  return `session_${String(count + 1).padStart(2, "0")}`;
}

/**
 * 把 SESSION_START.md 的內容複製到 Windows 剪貼板（透過 PowerShell）。
 */
function copyToClipboard(filePath: string): void {
  const escaped = filePath.replace(/'/g, "''");
  execSync(
    `powershell.exe -NoProfile -Command "Get-Content '${escaped}' -Raw | Set-Clipboard"`,
    { stdio: "pipe" }
  );
}

// ─── 主流程 ────────────────────────────────────────────────────────────────

function generate(): void {
  console.log("[generate-session-start] 開始生成 SESSION_START.md...");

  // 確認 system/_live/ 存在
  if (!fs.existsSync(LIVE_DIR)) {
    console.log(
      "[generate-session-start] 跳過：system/_live/ 不存在。\n" +
      "  → 請先執行 world_setup.bat 初始化世界。"
    );
    process.exit(0);
  }

  // 確認 template 存在
  const template = readFile(TEMPLATE_PATH);
  if (template === null) {
    console.error(`[generate-session-start] 找不到 template：${TEMPLATE_PATH}`);
    process.exit(1);
  }

  // 讀取三個動態狀態檔
  const worldState   = readFile(path.join(LIVE_DIR, "world_state.yaml"));
  const playerState  = readFile(path.join(LIVE_DIR, "player_state.yaml"));
  const sessionLogRaw = readFile(path.join(LIVE_DIR, "session_log.md"));

  if (!worldState)  { console.warn("  [WARNING] world_state.yaml 不存在，跳過注入。"); }
  if (!playerState) { console.warn("  [WARNING] player_state.yaml 不存在，跳過注入。"); }

  // 解析 session_log
  const lastSession      = sessionLogRaw ? extractLastFullSessionBlock(sessionLogRaw)  : null;
  const sceneCheckpoint  = sessionLogRaw ? extractLastSceneCheckpoint(sessionLogRaw)   : null;
  const sessionId        = sessionLogRaw ? calculateNextSessionId(sessionLogRaw)       : "session_01";

  // 組裝替換內容
  const worldStateBlock     = worldState  ? worldState.trim()  : "# world_state.yaml 尚未生成";
  const playerStateBlock    = playerState ? playerState.trim() : "# player_state.yaml 尚未生成";
  const sessionLogBlock     = lastSession ?? "_（尚無 session 記錄，這是首次遊玩）_";
  const checkpointBlock     = sceneCheckpoint ?? "  # 尚無 scene_checkpoint，首次遊玩請參考角色狀態的 starting_region";

  // 替換 template 中的佔位符
  let output = template
    .replace(/\{\{INLINE_WORLD_STATE\}\}/g,    worldStateBlock)
    .replace(/\{\{INLINE_PLAYER_STATE\}\}/g,   playerStateBlock)
    .replace(/\{\{INLINE_SESSION_LOG_LAST\}\}/g, sessionLogBlock)
    .replace(/\{\{INLINE_SCENE_CHECKPOINT\}\}/g, checkpointBlock)
    .replace(/\{\{SESSION_ID\}\}/g,            sessionId);

  // 寫出 SESSION_START.md（UTF-8，無 BOM）
  const buf = Buffer.from(output, "utf8");
  fs.writeFileSync(OUTPUT_PATH, buf);
  console.log(`  SESSION_START.md 已寫入（${Math.round(buf.length / 1024 * 10) / 10} KB）`);

  // 複製到剪貼板
  try {
    copyToClipboard(OUTPUT_PATH);
    console.log("  已複製到剪貼板 → 開 Claude 直接 Ctrl+V 貼入即可開始遊玩");
  } catch (e) {
    console.warn("  [WARNING] 複製到剪貼板失敗，請手動複製 SESSION_START.md。");
  }

  console.log(`  Session ID：${sessionId}`);
  console.log("[generate-session-start] 完成。");
}

generate();
