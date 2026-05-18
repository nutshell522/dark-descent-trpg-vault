# SETUP — 系統架設手冊

> 這份文件只需要讀一次。架設完成後就可以封存，日常遊玩請改看 [PLAY.md](PLAY.md)。

---

## 你需要準備的工具

| 工具 | 用途 | 費用 |
|------|------|------|
| [Obsidian](https://obsidian.md) | 世界資料庫 | 免費 |
| [Git](https://git-scm.com) | 版本控制與備份 | 免費 |
| [Node.js 18+](https://nodejs.org) | 執行腳本 | 免費 |
| [Claude.ai Pro](https://claude.ai) | 即時 DM（需要 Project 功能） | 付費 |
| [Google Gemini](https://gemini.google.com) | 世界生成與結算 | 免費方案可用 |

---

## STEP 1 — 安裝 Node 套件

```bash
cd 你的Vault根目錄
npm init -y
npm install js-yaml @types/js-yaml @types/node typescript
```

建立 `tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "types": ["node"]
  }
}
```

建議在 `.gitignore` 加入：

```
node_modules/
dist/
.obsidian/workspace*
```

---

## STEP 2 — 建立 Gemini Gems

在 Gemini 建立兩個固定 Gem：

| Gem 名稱 | Prompt 來源 | 知識庫 |
|----------|-------------|--------|
| `[DD] WorldGenerator` | `prompts/gemini/GEM_world_generator.md` | `prompts/gemini/template_library.json` |
| `[DD] STEP 3 世界結算` | `prompts/gemini/GEM_world_settlement.md` | 無 |

---

## STEP 3 — 建立 Claude Project

1. 到 claude.ai → Projects → 建立新 Project
2. 在 **Project Instructions** 貼入 `prompts/claude/PROJECT_INSTRUCTIONS.md` 全文

Knowledge Base 先留空，世界生成後才有東西可以上傳。

---

## STEP 4 — 世界生成（只做一次）

```
1. 開啟 [DD] WorldGenerator Gem
   輸入「劇本」列出模板後選定，或輸入「自訂」填寫世界設定

2. Gem 輸出可讀的世界種子摘要，等待你確認
   輸入「確認」，或說明想調整的地方（可來回多次）

3. Gem 輸出完整 world.json
   複製後存到 Vault 根目錄

4. 雙擊 world_setup.bat
   自動執行：驗證格式 → 拆分目錄結構 → 生成 system/_static/world_kb.md
            → 生成 system/_live/player_state.yaml 初始模板 → git commit
            → 自動開啟 system/ 資料夾

5. 上傳以下 3 個檔案至 Claude Project KB（永久放著，幾乎不動）：
   system/_static/world_kb.md
   system/_static/rules.yaml
   system/_static/output_schemas.yaml
```

---

## STEP 5 — 建立角色（只做一次）

```
1. 開啟 Claude Project，開新對話
2. 貼入 prompts/claude/CHARACTER_CREATION.md 全文
3. 照著導學逐步回答（12 個必填問題 + 1 個選填選單）
   涵蓋：種族、性別呈現、出身背景、姓名、起始地點、特技、
         屬性分配、恕懼觸發、長期目標、裝備確認

4. Claude 自動輸出完整 player_state.yaml
   複製後存成 system/_live/player_state.yaml

5. 將以下 3 個檔案首次上傳至 Claude Project KB：
   system/_live/player_state.yaml
   system/_live/world_state.yaml
   system/_live/session_log.md

6. CHARACTER_CREATION.md 任務完成，之後不再使用
```

架設完成。之後開局只需貼入 Reset，Claude 自動開場。日常遊玩請看 [PLAY.md](PLAY.md)。

---

## 附錄：完整文件與腳本索引

### Prompt 文件

| 編號 | 路徑 | 用途 |
|------|------|------|
| P0 | `prompts/claude/CHARACTER_CREATION.md` | 建角色導學（一次性） |
| P1 | `prompts/claude/SESSION_RESET.md` | 每次 Session 開頭重貼（300 字） |
| P2 | `prompts/claude/PROJECT_INSTRUCTIONS.md` | 貼入 Project Instructions |
| G1 | `prompts/gemini/GEM_world_generator.md` | WorldGenerator Gem prompt |
| G2 | `prompts/gemini/GEM_world_settlement.md` | 世界結算 Gem prompt |

### 靜態資料文件

| 編號 | 路徑 | 用途 |
|------|------|------|
| D1 | `system/_static/rules.yaml` | 核心規則系統（上傳 KB） |
| D1b | `system/_static/output_schemas.yaml` | 結算輸出 Schema（上傳 KB） |
| D2 | `system/world_rules.md` | 世界物理法則（GM Only，不上傳 KB） |
| D3 | `bestiary_library.json` | 生物骨架庫（隨遊玩 Backfill 擴充） |
| D4 | `prompts/gemini/template_library.json` | WorldGenerator Gem 知識庫 |

### 自動生成的動態文件

| 路徑 | 由誰產生 | Claude KB |
|------|---------|-----------|
| `system/_static/world_kb.md` | `world_setup.bat` | ✅ 永久放著 |
| `system/_live/world_state.yaml` | `world_setup.bat` 初始化，`apply_delta` 維護 | 🔄 每次結算替換 |
| `system/_live/session_log.md` | `world_setup.bat` 初始化，`apply_delta` append | 🔄 每次結算替換 |
| `system/_live/player_state.yaml` | 角色建立後手動存入，兩個 capture bat 維護 | 🔄 每次結算替換 |

### 腳本

| 腳本 | 用途 |
|------|------|
| `world_setup.bat` | 世界初始化一鍵執行（只用一次） |
| `validate_only.bat` | 單獨驗證 world.json |
| `capture_checkpoint.bat` | ★ 日常用：剪貼板 → checkpoint → 套用 |
| `capture_session_end.bat` | ★ 日常用：剪貼板 → session_summary → 開 Gemini |
| `capture_world_delta.bat` | ★ 日常用：剪貼板 → world_delta → 套用 → 開 Claude KB |
| `apply_checkpoint.bat` | 備用（正常由 capture bat 呼叫） |
| `apply_delta.bat` | 備用（正常由 capture bat 呼叫） |
| `tools/validate-world.ts` | 驗證邏輯 |
| `tools/splitter.ts` | 拆分 world.json + 生成 world_kb.md |
| `tools/apply-delta.ts` | SESSION END 結算套用邏輯 |
| `tools/apply-checkpoint.ts` | /checkpoint 小結算套用邏輯 |
