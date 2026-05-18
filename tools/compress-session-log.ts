/**
 * compress-session-log.ts
 * 壓縮 session_log.md：保留最近 3 場完整記錄，更早的折疊為摘要（只留 major_events）。
 * archived: true 的 session 不重複壓縮。
 *
 * 用法：
 *   npx ts-node tools/compress-session-log.ts [session_log_path]
 */

import * as fs   from "fs";
import * as path from "path";

const DEFAULT_LOG_PATH = path.join(__dirname, "..", "system", "_live", "session_log.md");
const KEEP_FULL_SESSIONS = 3;

interface SessionBlock {
  heading: string;
  content: string;
  sessionNum: number;
  archived: boolean;
}

function parseSessionBlocks(raw: string): { preamble: string; blocks: SessionBlock[] } {
  const firstIdx = raw.indexOf("\n## Session ");
  const preamble = firstIdx >= 0 ? raw.slice(0, firstIdx + 1) : "";
  const body     = firstIdx >= 0 ? raw.slice(firstIdx + 1) : raw;

  const blocks: SessionBlock[] = [];
  const lines = body.split("\n");
  let current: SessionBlock | null = null;

  for (const line of lines) {
    const m = line.match(/^## Session (\d+)/);
    if (m) {
      if (current) blocks.push(current);
      current = {
        heading:    line,
        content:    line + "\n",
        sessionNum: parseInt(m[1], 10),
        archived:   line.includes("<!-- archived -->"),
      };
    } else if (current) {
      current.content += line + "\n";
    }
  }
  if (current) blocks.push(current);
  return { preamble, blocks };
}

function extractSummary(block: SessionBlock): string {
  const lines        = block.content.split("\n");
  const result: string[] = [];

  // Heading — mark archived
  result.push(block.heading.replace(/\s*<!-- archived -->/, "") + " <!-- archived -->");

  // Extract major_events block (yaml key → next top-level key)
  let capture = false;
  for (const line of lines.slice(1)) {
    if (/^  major_events:/.test(line)) {
      capture = true;
      result.push(line);
      continue;
    }
    if (capture) {
      // Stop at next top-level key inside yaml (2-space indent key, not a list item)
      if (/^  [a-z_]+:/.test(line) && !/^  -/.test(line)) break;
      result.push(line);
    }
  }

  result.push("  # [詳細記錄已壓縮，僅保留重大事件摘要]");
  result.push("");
  return result.join("\n");
}

function compressLog(logPath: string): void {
  if (!fs.existsSync(logPath)) {
    console.error(`[compress-session-log] 找不到檔案：${logPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(logPath, "utf-8");
  const { preamble, blocks } = parseSessionBlocks(raw);

  if (blocks.length <= KEEP_FULL_SESSIONS) {
    console.log(
      `[compress-session-log] Session 數量（${blocks.length}）≤ ${KEEP_FULL_SESSIONS}，不需要壓縮。`
    );
    return;
  }

  const toArchive = blocks.slice(0, blocks.length - KEEP_FULL_SESSIONS);
  const toKeep    = blocks.slice(blocks.length - KEEP_FULL_SESSIONS);
  const needWork  = toArchive.filter(b => !b.archived);

  if (needWork.length === 0) {
    console.log("[compress-session-log] 所有早期 session 已壓縮。");
    return;
  }

  console.log(`[compress-session-log] 壓縮 ${needWork.length} 個早期 session...`);

  const processed = toArchive.map(b => ({
    ...b,
    content: b.archived ? b.content : extractSummary(b),
  }));

  // Backup
  const backupPath = logPath + ".bak";
  fs.copyFileSync(logPath, backupPath);
  console.log(`[compress-session-log] 原始備份：${backupPath}`);

  const newContent =
    preamble +
    processed.map(b => b.content).join("") +
    toKeep.map(b => b.content).join("");

  fs.writeFileSync(logPath, newContent, "utf-8");
  console.log(
    `[compress-session-log] 完成。壓縮 ${needWork.length} 個 session，` +
    `保留 ${toKeep.length} 個完整記錄。`
  );
}

const logPath = process.argv[2] || DEFAULT_LOG_PATH;
compressLog(logPath);
