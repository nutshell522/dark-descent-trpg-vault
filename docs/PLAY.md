# PLAY — 遊玩手冊

> 這是你每次開局需要的唯一文件。

---

## 開局（每次，約 10 秒）

```
1. 開啟 Claude Project，開新對話
2. 貼入 prompts/claude/SESSION_RESET.md 全文
3. 送出
```

Claude 會自動讀取 KB、計算 session_id、從上次的 `scene_checkpoint` 直接描述場景，不需要填任何欄位。

**想覆蓋開場？** 在文件後面直接加一句話就好：
> 「這次從兩天後的貴族區開始，我剛接到一個新委託。」

**想修正上次的漂移？** 同樣直接說：
> 「上次 Veth 對我太客氣，這次她應該更官僚冷淡。」

---

## 遊玩中：模型切換時機

| 情境 | 用哪個模型 |
|------|-----------|
| 純敘事、移動、環境描寫、簡單骰子判定 | **Haiku** |
| 任何需要輸出 YAML 的指令（/npc、/encounter、/checkpoint） | **Sonnet**（必須切換） |
| NPC 深度對話、審訊、談判、戰鬥超過 3 回合 | **Sonnet** |
| SESSION END | **Sonnet** |
| /checkpoint 結尾出現 `endgame_check: imminent` | **Opus**（開延伸思考） |

不確定要用哪個時，選 **Sonnet**。

---

## 遊玩中：常用指令

| 指令 | 時機 | 後續動作 |
|------|------|---------|
| `/npc [描述]` | 接觸新 NPC | 無，Claude 即時生成（切 Sonnet） |
| `/encounter [描述]` | 主動探索危險地區 | 無，Claude 即時生成（切 Sonnet） |
| `/tone_check` | 感覺 NPC 態度開始變軟、偏袒玩家 | 無，Claude 即時自我審查並回報 |
| `/npc_upgrade [id]` | 想讓某 NPC 升格為核心角色 | 無，Claude 確認後記錄 |
| `/status` | 想確認雙軌時鐘、傷勢、背包 | 無，即時輸出狀態快照 |
| `/help` | 忘記有哪些指令可用 | 無，即時列出指令清單 |
| `/stakes [行動]` | 行動前想知道風險底牌 | Claude 亮牌後暫停，等玩家確認才擲骰 |
| `/recall [關鍵字]` | 想確認角色是否知曉某資訊 | 常識免費給出；冷僻知識觸發 MND 判定 |
| `/loot` 或 `/inspect` | 想搜索場景或屍體 | 安全環境直接給資源；危險環境觸發判定 |
| `/downtime [天數] [目標]` | 想快進休整、等待或訓練 | 扣除口糧、計算回復、輸出蒙太奇旁白 |
| `/insight [NPC名]` | 想解讀某 NPC 的態度與肢體語言 | 輸出可觀察行為側寫，嚴守防讀心協議 |
| `/push [body\|mind]` | 擲骰前願意付出代價換取勝算 | 立即填入 1 格時鐘，當前判定 +1 修正 |
| `/threads` | 想整理當前所有未解懸念與任務線 | 無，即時列出線索清單，不推進時間 |

戰鬥中：Claude 每 3 回合自動輸出 `combat_snapshot`，不需要下指令。

---

## /checkpoint（任務結束後做）

切換到 **Sonnet**，然後：

```
1. 輸入 /checkpoint
2. Claude 輸出 checkpoint_summary YAML
3. 全選輸出 → Ctrl+C
4. 雙擊 capture_checkpoint.bat
   → 自動存成 checkpoint.yaml
   → 更新 player_state.yaml（資源、傷勢）
   → 備份到 /sessions/
   → git commit
   → 顯示本局獲得的情報、待持久化 NPC 清單
5. 繼續遊玩（KB 不需要現在替換）
```

---

## SESSION END（對話接近上限、或一段落後做）

確認在 **Sonnet**，然後：

```
1. 輸入 SESSION END
2. Claude 輸出 session_summary YAML
3. 全選輸出 → Ctrl+C → 雙擊 capture_session_end.bat
   → 自動存成 session_summary.yaml
   → 自動開啟瀏覽器到 Gemini 世界結算 Gem

4. 開啟 session_summary.yaml → 全選 → 貼入 Gemini
5. Gemini 輸出 world_delta YAML
6. 全選輸出 → Ctrl+C → 雙擊 capture_world_delta.bat
   → 自動存成 world_delta.yaml 並套用所有結算
   → git commit
   → 自動開啟 system/_live/ 資料夾 + Claude Project KB 頁面

7. 把 system/_live/ 資料夾中的3 個檔案拖曳到 Claude Project KB（替換舊版）：
   world_state.yaml
   session_log.md
   player_state.yaml

8. 下次開局貼入 Reset，Claude 自動從 scene_checkpoint 繼續
```

---

## Endgame

每次 `/checkpoint` 結尾觀察 `endgame_check` 欄位：

| 值 | 代表 | 動作 |
|----|------|------|
| `false` | 正常 | 繼續遊玩 |
| `imminent` | 危險邊緣 | 立刻切換 Opus，開延伸思考 |
| `true` | 結局觸發 | 輸入 SESSION END，執行最後一次完整結算 |

結局結算完成後，可以開新角色繼續——世界會持續存在。

---

## Claude Project KB 對照表

| 文件 | 更新時機 |
|------|---------|
| `system/_static/world_kb.md` | ✅ 永久放著，幾乎不動 |
| `system/_static/rules.yaml` | ✅ 永久放著，規則調整時才換 |
| `system/_static/output_schemas.yaml` | ✅ 永久放著，幾乎不動 |
| `system/_live/world_state.yaml` | 🔄 每次 SESSION END 後替換 |
| `system/_live/session_log.md` | 🔄 每次 SESSION END 後替換 |
| `system/_live/player_state.yaml` | 🔄 每次 SESSION END 後替換 |
| `world/world_setting.md` / `/world/bestiary/` / `/npcs/` | ❌ 絕對不要上傳 |

---

## 常見問題

**Claude 開始偏袒玩家、幫玩家製造命運感？**
輸入 `/tone_check`，Claude 會立即審查並回報最近 5 輪的漂移情況。
若已嚴重漂移，開新對話重貼 `prompts/claude/SESSION_RESET.md`，在文件後面直接說明觀察到的問題（例：「上次 Veth 態度太軟，這次要更冷淡」）。

**Claude 說了和世界設定不符的事？**
直接告訴 Claude 修正，並在下一次 `/checkpoint` 的 `world_conflicts_noted` 欄位記錄。SESSION END 後 Gemini 會把衝突整合進世界結算。

**對話快到上限了怎麼辦？**
立刻輸入 SESSION END，照 SESSION END 流程走完，再開新對話繼續。

**KB 裡的資料和我記憶中的不一樣？**
以對話裡的即時修正為準，記錄在 `/checkpoint` 的 `world_conflicts_noted`，結算時統一處理。

**Backfill 提案需要全部接受嗎？**
不需要。`capture_world_delta.bat` 只顯示提案，你確認合理後才手動寫入 `bestiary_library.json`。
