# REFERENCE — 系統設計文件

> 這份文件解釋系統「為什麼這樣設計」，以及所有 YAML schema 的完整定義。
> 日常遊玩不需要看這裡。要客製化規則、理解設計邏輯、或 debug 時才查閱。

---

## 核心哲學

| 原則 | 說明 |
|------|------|
| Claude 不保存世界 | Claude 只負責即時 RP，不記憶世界狀態 |
| Gemini 不負責 RP | Gemini 只做世界模擬、結算壓縮、記憶衰退 |
| NPC 不預設存在 | 被需要時才誕生，不需要時直接丟棄 |
| 生物不預設存在 | 遭遇由 ecology_seed 動態生成，圖鑑庫隨遊玩自我擴充 |
| 只儲存影響決策的記憶 | 不存完整對話，只存未來會改變行為的事件 |
| 資訊嚴格隔離 | NPC 只知道該知道的事，Claude 只看得到局部資訊 |
| 永久後果 | 死亡、斷肢、政治變化、NPC 記憶全部不可逆 |
| 局部高解析度 | 玩家附近完整模擬，遠方只維持 abstract_state |
| GM 人格每次重置 | 每次 Session 重貼 Session Reset，防止漂移 |
| GM 不生成命運劇情 | 所有重大事件必須源自世界既有因果，禁止憑空製造史詩 |

---

## AI 分工

| 工作類型 | 模型 |
|----------|------|
| 純敘事、移動、環境描寫、簡單骰子判定 | Claude Haiku |
| /npc、/encounter、/checkpoint 等 YAML 輸出 | Claude Sonnet（Haiku 遵從率不足，必須切換） |
| NPC 深度對話、談判、審訊、戰鬥超過 3 回合 | Claude Sonnet |
| SESSION END | Claude Sonnet |
| endgame_check: imminent 或 true 之後 | Claude Opus（開延伸思考，嚴格限於此情境） |
| 世界結算、NPC/生物記憶壓縮、衰退、流言 | Gemini 2.5 Pro |
| 批次生成、快速結算 | Gemini 2.5 Flash |

---

## 三層迴圈架構

```
[Macro Loop] 章節/年度
  觸發：對話達 80% context、遊戲內時間過一個月/季度、SESSION END
  執行：Claude Sonnet 產 session_summary → Gemini 產 world_delta → capture_world_delta.bat 套用
  └─[Meso Loop] 任務/事件
      觸發：任務完成、重大事件、玩家輸入 /checkpoint
      執行：Claude Sonnet 輸出 checkpoint_summary → capture_checkpoint.bat 套用
      └─[Micro Loop] 場景/回合
          執行：Claude Haiku 推進，不結算
          特例：戰鬥每 3 回合輸出 combat_snapshot
```

Macro Loop 的輸入是結構化的 `session_summary`，不是整段對話原文。

---

## 動態解析度（LOD）

```yaml
resolution_map:
  high_detail:          # 玩家所在地及鄰近，上限 3 個地區
    - region: 灰港
      detail_level: full
      active_npcs: []
      local_events: []

  abstract_state:       # 遠方地區，不完整模擬
    - region: 北境戰線
      status: ongoing_war
      casualties_estimate: heavy
      last_updated: Year3_Day_130
      player_relevance: low
```

玩家移動到新地區時，該地區升為 high_detail，最久未到訪的降為 abstract_state。

---

## 全域時間系統

整合在 `system/_live/world_state.yaml` 中：

```yaml
global_time:
  current_date: Year3_Day_142
  current_season: 晚秋
  moon_cycle: 殘月第三夜
  days_since_campaign_start: 142

information_delay_rule: |
  遠方事件的情報抵達時間 = 距離(天) × 1.5
  傳遞過程中必然失真，距離越遠失真越高。
```

---

## 世界容量上限（world_limits.yaml）

```yaml
world_limits:
  active_major_factions: 12
  tier3_npcs_max: 30
  tier2_npcs_max: 100
  active_crises_max: 5
  persistent_rumors_max: 20
  named_creatures_max: 10
  regions_high_detail_max: 3
```

超限時 Gemini 自動執行淘汰（合併派系、降格 NPC、歸檔生物等）。

---

## NPC 系統

### 生命週期

```
Tier 0  城鎮文化種子（無人物，只有機率參數）
   ↓ 玩家進入接觸範圍
Tier 1  Claude 即時生成 Runtime NPC
   ↓ 多次登場 / 知道秘密 / 關係改變 / 玩家主動記住
Tier 2  SESSION END 結算後持久化（/npcs/persistent/）
   ↓ 成為核心關係人物
Tier 3  完整人格 NPC（上限 30 人）
   ↓ 時間流逝 / 長期未接觸
記憶衰退  Gemini 世界更新時執行 memory_decay
```

### 持久化判斷標準

| 必須持久化 | 可以丟棄 |
|-----------|---------|
| 知道玩家秘密 | 只互動一次且無特殊事件 |
| 態度發生明顯改變 | 玩家已離開地區且無聯繫方式 |
| 玩家欠他債/仇/情 | 完全標準化的職能角色 |
| 是派系成員 | |
| 玩家問過他的名字 | |

### 禁讀心協議

```
1. NPC 只能知道 knows_about_player 明確列出的事項
2. suspects_about_player 只能以懷疑口吻表現，不能當事實行動
3. definitely_does_not_know 的事項，即使玩家暗示，NPC 也不得突然「理解」
4. NPC 之間情報傳遞必須有時間延遲，且依距離失真
5. 玩家未被目擊的行動，永遠不得讓 NPC 知情
```

### 記憶衰退規則（Gemini 執行）

```yaml
memory_decay_rules:
  time_threshold: 30        # 遊戲內超過 30 天未接觸
  emotional_weight:
    high: 永不自動衰退
    medium: 60 天後降級為 low
    low: 30 天後有機率遺忘
decay_outcomes:
  forgotten: 低影響的單次互動細節
  distorted: NPC 在壓力下誤記細節，情緒放大威脅
  reinforced: 強烈背叛感、初次印象（若後來關係深厚）
```

### Tier 0 城鎮種子格式

```yaml
settlement:
  name: 灰港
  npc_probability_weights:
    desperate_people: 0.4
    opportunists: 0.3
    loyal_faction_members: 0.2
    idealists: 0.1
  culture:
    dominant_traits: [排外, 重利益]
    common_prejudices: [歧視外族口音者]
    social_tensions: [本地人 vs 難民湧入]
  current_status:
    war_pressure: high
    food_scarcity: medium
    law_enforcement: low
```

### Tier 1 Runtime NPC 格式

```yaml
npc_runtime:
  temp_id: runtime_ash_021
  name: 哈洛德
  generated_at: session_12
  age: 52
  occupation: 鐵匠

  identity:
    gender: male
    sexuality: [straight]
    race: imperial_human

  appearance:
    build: 寬肩厚背，右手換了義體但左手還是肉的，反差很明顯
    notable_feature: 鼻梁有一道舊的壓扁痕跡，像是被鐵錘正面打過
    clothing_style: 永遠穿著燒出小洞的皮圍裙，從不換

  speech_style: 惜字如金，回答問題只給最少的字數
  speech_quirk: 說話前會用義體手指敲一下工作台，像是在確認對方值得他開口
  verbal_tic: 所有數量都用「幾個」代替，從不說具體數字
  speech_examples:
    - "（敲台）要幾個？"
    - "你要問就快說。"
    - "（不看你）先給錢。幾個。"

  current_state:
    mood: 煩躁
    stress_level: high
    immediate_need: 今天之內完成軍方訂單
    hidden_problem: 兒子參軍後失聯三個月
    today_trigger: 早上軍方來催貨，給的期限比說好的短了兩天

  first_impression_of_player:
    notices_first: 機械化手臂的型號——他能看出是哪個廠的
    default_assumption: 來修義體的，或者來買刀的
    initial_stance: neutral

  personality_seed:
    greed: medium
    loyalty: high
    paranoia: low
    trauma_level: medium

  biases:
    hates: [帝國貴族, 逃兵]
    respects: [老兵, 手藝人]
    dealbreakers: [說謊超過一次]
    emotional_weakness: 提到兒子會明顯僵住，然後加快手上的動作
    exploitable_leverage: 軍方訂單裡有一批是違禁改造，他知道

  combat:
    ability: high
    will_fight_if: 有人動他的工具或提到他兒子是逃兵

  knows_about_player: []
  suspects_about_player: []
  definitely_does_not_know: []
  immediate_goal: 今天之內完成訂單
  hidden_goal: 找到兒子下落
```

---

## 生物系統

### 三層架構

```
bestiary_library.json
  生物的生成規則，不是完整個體
    ↓
ecology_seed（整合在 settlement_seed 內）
  這個地區出現哪類生物、機率多高
    ↓
遭遇實例（Claude 動態生成，只存在當前 context）
    ↓ 若：逃跑了/有名字/劇情繫留
具名生物持久化（/world/bestiary/named/[id].yaml）
    ↓ 若：全新機制/重大生態變異/跨地點重複
Backfill 提案（Gemini 輸出，玩家確認後才寫入）
```

核心原則：**儲存生成規則，不儲存生成結果。**

### 生態威脅等級

| Tier | 典型生物 | 適用劇本 |
|------|---------|---------|
| tier_0_mundane | 狼群、盜匪、疾病 | 所有劇本 |
| tier_1_low_fantasy | 腐化獸、怨靈、詛咒人類 | 大多數劇本 |
| tier_2_mid_fantasy | 守護者、神明眷屬、智慧怪物 | 奇幻/神話劇本 |
| tier_3_cosmic | 古神碎片、概念實體化 | 克蘇魯類劇本 |

### 遭遇觸發管制

**嚴禁 Claude GM 在敘事中憑空主動生成敵對遭遇。**

正式遭遇（需要輸出 YAML）只在以下三種情況觸發：
1. 玩家主動輸入 `/encounter`
2. 骰子判定 7-9 或 6-，且 GM 判定代價為意外襲擊（同一 Session 最多一次）
3. 劇情抵達明確預設的危險節點

背景點綴生物（飛過的烏鴉、窗台的貓）可自由加入敘事，禁止生成戰鬥 YAML。

### 遭遇實例格式

```yaml
creature_encounter:
  instance_id: enc_ash_023
  template_id: wolf_pack
  ecology_tier: tier_0_mundane
  role: standard
  generated_at: session_12
  location: 灰港北方森林
  group_size: 5
  current_state:
    hunger_level: high
    behavior_mode: 積極獵食
  special_condition: 其中一隻明顯異常，可能是突變個體
  player_can_observe:
    - 毛皮上的腐爛斑點
    - 眼睛是暗紅色而非正常黃色
  player_cannot_know:
    - 疫病爪擊的觸發條件
    - 頭狼位置
  combat_bounds_check:
    attack_modifier: 0
    durability: 2
    within_bounds: true
  non_combat_resolution_eligible: true
  backfill_candidate: false
```

### 非戰鬥解決方案（minion/standard 限定）

| 判定結果 | 效果 |
|---------|------|
| 10+ | 生物離開，無代價 |
| 7-9 | 生物離開，但有代價（噪音/消耗物品/花費時間） |
| 6- | 正式進入遭遇，或情勢惡化 |

elite / boss 不適用，必須正式處理。

### Backfill 品質控制

觸發條件（滿足一項即可）：
- 玩家主動研究或記錄（心智判定成功或劇情調查）
- 同一變體在不同地點出現超過一次
- 有因果明確的世界事件作為來源且具持續影響
- 具備全新戰鬥機制（不只是數值調整）
- 發生重大生態變異且有世界內因果邏輯

嚴禁 Backfill：
- 僅有外觀差異（毛色、體型）
- 一次性環境效果（因下雪移動緩慢）
- 與現有模板差異不足 15%（應合併而非新建）

Backfill 是 Gemini 的提案，**玩家確認後才手動寫入** `bestiary_library.json`。

---

## 戰鬥系統

### Combat Snapshot（每 3 回合自動輸出）

```yaml
combat_snapshot:
  round: 6
  player:
    body_clock: 3/4
    mind_clock: 1/4
    injuries: [左臂流血]
    resources_consumed: [已用 1 份藥品]
    status: 體力透支，但意志堅定
  enemies:
    - name: 城市守衛隊長
      role: elite
      status: wounded        # full / wounded / critical / down
  environment_changes:
    - 巷口火把被打翻，視線降低
    - 地面血跡使移動困難
  round_notes: 守衛下回合若 status 歸 critical 將觸發逃跑判定
```

### 戰鬥後代價規則

戰鬥結束後，無論勝敗，必須描寫至少一個現實代價：
- 耗盡的箭矢或藥品
- 損壞或染血的裝備
- 留下的傷口或疲勞
- 製造的噪音或目擊者
- 屍體需要處理，否則成為世界事件

### 重傷判定

```yaml
serious_injury_procedure:
  trigger: 肉體時鐘填入第 3 格
  action: 執行後遺症判定（玩家擲 2D6+PHY）
  results:
    10+: 傷勢可完全恢復
    7-9: 留下輕微後遺症（長期疼痛、某動作受限）
    6-:  永久傷害（斷肢、失明、慢性病），標記 permanent
```

### 屍體即世界事件

戰鬥留下的屍體不會自動消失：
- NPC 可能發現並展開調查
- 派系可能追查死者身份
- 謠言在地區內擴散

---

## Session 結算 Schema

### checkpoint_summary（/checkpoint 輸出）

`capture_checkpoint.bat` 讀取此格式，更新 `system/_live/player_state.yaml`。

```yaml
checkpoint_summary:
  session_id: [string]
  checkpoint_index: [數字]
  date_ingame: [Year_X_Day_XXX]
  player_state_delta:
    resources: {}
    injuries: []
    body_clock: [數字/4]
    mind_clock: [數字/4]
  intel_gained: []
  npc_interactions: []
  npcs_to_persist: []
  world_conflicts_noted: []
  endgame_check: [false|imminent|true]
  endgame_trigger_condition: [string]
```

### session_summary（SESSION END 輸出）

此格式貼入 Gemini 世界結算 Gem，產出 world_delta。

```yaml
session_summary:
  session_id: [string]
  date_ingame: [Year_X_Day_XXX]
  duration_ingame_days: [數字]
  major_events:
    - date: [Year_X_Day_XXX]
      event: [string]
      world_impact: [none|local|regional|global]
  npc_changes:
    - npc_id: [string]
      name: [string]
      attitude_delta: [improved|worsened|unchanged]
      trust_delta: [數字]
      persist_flag: [true|false]
      persist_reason: [string]
  creature_changes:
    - encounter_id: [string]
      outcome: [defeated|fled|resolved_nonviolent|persisted]
      persist_flag: [true|false]
      backfill_candidate: [true|false]
  resource_changes:
    - resource: [string]
      delta: [數字]
      current_total: [string]
  injury_updates:
    - description: [string]
      clock_slot: [1|2|3|4]
      permanent: [true|false]
  rumors_created: []
  world_impacts: []
  world_conflicts_noted: []
  pending_threads: []
  next_session_hooks: []
  endgame_check: [false|imminent|true]
  endgame_trigger_condition: [string]
  scene_checkpoint:                  # 選填，Claude 填寫，Gemini 中繼至 session_log.md
    date_ingame: [Year_X_Day_XXX]
    location: [string]
    situation_snapshot: [string]
    last_critical_dialogue: [string]
    player_next_intent: [string]
    active_thread: [string]
```

**所有結算 YAML 均為強制 schema，欄位不得增減、不得改名。**

---

## Endgame 觸發條件

```yaml
endgame_triggers:
  death:
    - 肉體時鐘危急且後遺症判定失敗
    - 精神時鐘危機累積超過三次且容量降至 1
    - 被俘且無逃脫手段超過七天遊戲內時間

  victory:
    - 完成主線目標（需在 `world/world_setting.md` 明確定義）

  ambiguous_ending:
    - 玩家成為傀儡（失去自主行動權超過一個月）
    - 世界進入不可逆崩壞（由 Gemini 世界結算判定）
    - 玩家主動選擇放棄角色身份
```

---

## 永久傷害與世界標記

```yaml
permanent_changes:
  injuries:
    missing_eye: true
    chronic_pain: true
    severed_finger_left_ring: true
  trauma:
    fear_of_fire: true
    trust_issues_with_nobles: true
  world_marks:
    wanted_in: [north_empire, border_city_kaleth]
    reputation:
      smugglers_guild: trusted_ally
      city_guard: kill_on_sight
```

---

## 世界規則核心（world_rules.md）

```yaml
world_principles:
  grimdark: true
  player_is_not_special: true
  npc_has_free_will: true
  information_is_limited: true
  death_is_permanent: true
  war_changes_world: true
  economy_is_simulated: true
  rumors_can_be_false: true
  morality_is_gray: true

magic_principles:
  magic_has_cost: true
  magic_is_not_reliable: true
  magic_is_not_common: true
```
