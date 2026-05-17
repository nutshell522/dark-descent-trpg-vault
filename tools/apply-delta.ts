/**
 * apply-delta.ts
 * 自動套用 Gemini 世界結算輸出（world_delta.yaml）到 Obsidian Vault
 * 可選：同時套用 session_summary.yaml 以更新 player_state.yaml
 *
 * 用法：
 *   npx ts-node tools/apply-delta.ts world_delta.yaml [session_summary.yaml]
 *
 * 注意：backfill_proposals 不會自動寫入，需手動確認後寫入 bestiary_library.json
 */

import * as fs   from "fs";
import * as path from "path";
import * as yaml from "js-yaml";

// ─────────────────────────────────────────────────────────────
// 型別定義
// ─────────────────────────────────────────────────────────────

interface RelationshipDelta {
  trust?: number;
  fear?: number;
  respect?: number;
  open_debts?: string[];
}

interface DecisionMemory {
  date?: string;
  event: string;
  emotional_weight: "low" | "medium" | "high";
  attitude_effect?: string;
}

interface SexualityData {
  orientation?: string[];
  strict_preferences?: {
    requires_race?: string[];
    requires_gender?: string[];
    absolute_exclusions?: { race?: string[]; gender?: string[] };
  };
}

interface IdentityData {
  gender?: string;
  sexuality?: SexualityData;
  race?: string;
}

interface QuirkProfile {
  has_quirk?: boolean;
  speech_quirk?: string | null;
  verbal_tic?: string | null;
  quirk_intensity?: "low" | "medium" | "high";
  speech_examples?: string[];
}

interface StanceData {
  worldview_summary?: string;
  strong_opinions?: Array<{
    topic: string;
    position: string;
    reaction_if_challenged: string;
  }>;
}

interface BiasesData {
  hates?: string[];
  respects?: string[];
  dealbreakers?: string[];
  emotional_weakness?: string;
  exploitable_leverage?: string;
}

interface PsychologyData {
  coping_mechanism?: string;
  social_posture?: string;
  deception_style?: string;
}

interface NpcUpdate {
  action: "create" | "update" | "tier_change" | "archived";
  id: string;
  name: string;
  tier?: number;
  last_seen?: string;
  personality_seed?: Record<string, string>;
  speech_examples?: string[];
  speech_register?: string;
  identity?: IdentityData;
  appearance?: { build?: string; notable_feature?: string; clothing_style?: string };
  quirk_profile?: QuirkProfile;
  stance?: StanceData;
  biases?: BiasesData;
  psychology?: PsychologyData;
  relationship_to_player?: RelationshipDelta;
  decision_memories?: DecisionMemory[];
  knows_about_player?: string[];
  suspects_about_player?: string[];
  current_goal?: string;
  location?: string;
  faction_affiliation?: string | null;
  memory_decay_exempt?: boolean;
}

interface CreatureUpdate {
  action: "persist" | "archived";
  creature_id: string;
  name: string;
  template_id?: string;
  last_seen?: string;
  stance_to_player?: string;
  notable_traits?: string[];
  current_location?: string;
  persistence_reason?: string;
}

interface RegionChange {
  region_id: string;
  atmosphere?: string;
  notable_event?: string;
  abstract_state?: string;
}

interface FactionChange {
  faction_id: string;
  power_shift?: string;
  reason?: string;
}

interface CrisisUpdate {
  id: string;
  name?: string;
  status: string;
  resolution_note?: string;
}

interface WorldUpdates {
  region_changes?: RegionChange[];
  faction_changes?: FactionChange[];
  crisis_updates?: CrisisUpdate[];
}

interface BackfillProposal {
  proposed_id: string;
  base_template_id?: string;
  variant_name?: string;
  ecology_tier?: string;
  role?: string;
  attack_modifier?: number;
  durability?: number;
  world_event_cause?: string;
  first_encountered_region?: string;
  numerical_anchor_check?: string;
  key_differences_from_base?: string[];
}

interface MemoryDecayResult {
  npc_id: string;
  npc_name?: string;
  original_memory: string;
  decay_type: "forgotten" | "distorted" | "reinforced";
  new_memory?: string;
  attitude_effect?: string;
}

interface WorldLimitCheck {
  active_major_factions?: string;
  tier3_npcs?: string;
  tier2_npcs?: string;
  active_crises?: string;
  named_creatures?: string;
  persistent_rumors?: string;
  cleanup_actions?: string[];
}

interface WorldDelta {
  world_delta: {
    session_id: string;
    processed_date?: string;
    days_advanced?: number;
    new_current_date?: string;
    world_updates?: WorldUpdates;
    npc_updates?: NpcUpdate[];
    creature_updates?: CreatureUpdate[];
    backfill_proposals?: BackfillProposal[];
    memory_decay_results?: MemoryDecayResult[];
    world_limit_check?: WorldLimitCheck;
    endgame_check?: { status: string; trigger_condition?: string };
  };
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

interface MajorEvent {
  date?: string;
  event: string;
  world_impact?: string;
}

interface SessionSummary {
  session_summary: {
    session_id: string;
    date_ingame?: string;
    major_events?: MajorEvent[];
    resource_changes?: ResourceChange[];
    injury_updates?: InjuryUpdate[];
    pending_threads?: string[];
    next_session_hooks?: string[];
    endgame_check?: string;
  };
}

// ─────────────────────────────────────────────────────────────
// 工具函式
// ─────────────────────────────────────────────────────────────

const VAULT_ROOT = process.cwd();
const SEP = "─".repeat(52);

function log(msg: string)  { console.log(`  ${msg}`); }
function head(msg: string) { console.log(`\n${SEP}\n  ${msg}\n${SEP}`); }
function warn(msg: string) { console.log(`  ⚠  ${msg}`); }
function ok(msg: string)   { console.log(`  ✓  ${msg}`); }
function skip(msg: string) { console.log(`  –  ${msg}`); }

function loadYaml<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return yaml.load(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    warn(`無法解析 ${path.basename(filePath)}，跳過`);
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

function appendMarkdown(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, content, "utf-8");
}

function resolveVault(...parts: string[]): string {
  return path.join(VAULT_ROOT, ...parts);
}

// ─────────────────────────────────────────────────────────────
// 模組一：NPC 更新
// ─────────────────────────────────────────────────────────────

function applyNpcUpdates(delta: WorldDelta["world_delta"]): string[] {
  const changes: string[] = [];
  if (!delta.npc_updates?.length) { skip("npc_updates 為空，跳過"); return changes; }

  for (const update of delta.npc_updates) {
    const filePath = resolveVault("npcs", "persistent", `${update.id}.yaml`);

    if (update.action === "archived") {
      if (fs.existsSync(filePath)) {
        const existing = loadYaml<Record<string, unknown>>(filePath) ?? {};
        existing.archived = true;
        existing.archived_date = delta.new_current_date ?? delta.processed_date;
        saveYaml(filePath, existing);
        ok(`NPC [${update.name}] 標記為 archived`);
        changes.push(`NPC archived: ${update.name} (${update.id})`);
      } else {
        skip(`NPC [${update.id}] 不存在，略過 archived`);
      }
      continue;
    }

    if (update.action === "create") {
      // 建立新的持久化 NPC 檔
      const npcData: Record<string, unknown> = {
        id: update.id,
        name: update.name,
        tier: update.tier ?? 2,
        last_seen: update.last_seen,
        personality_seed: update.personality_seed ?? {},
        speech_examples:        update.speech_examples ?? [],
        speech_register:        update.speech_register ?? "",
        relationship_to_player: {
          trust:       update.relationship_to_player?.trust ?? 0,
          fear:        update.relationship_to_player?.fear  ?? 0,
          respect:     update.relationship_to_player?.respect ?? 0,
          open_debts:  update.relationship_to_player?.open_debts ?? [],
        },
        decision_memories:      update.decision_memories ?? [],
        knows_about_player:     update.knows_about_player ?? [],
        suspects_about_player:  update.suspects_about_player ?? [],
        current_goal:           update.current_goal,
        location:               update.location,
        faction_affiliation:    update.faction_affiliation ?? null,
        memory_decay: { last_decay_check: delta.new_current_date },
      };
      if (update.memory_decay_exempt) npcData.memory_decay_exempt = true;
      if (update.identity)      npcData.identity      = update.identity;
      if (update.appearance)    npcData.appearance    = update.appearance;
      if (update.quirk_profile) npcData.quirk_profile = update.quirk_profile;
      if (update.stance)        npcData.stance        = update.stance;
      if (update.biases)        npcData.biases        = update.biases;
      if (update.psychology)    npcData.psychology    = update.psychology;
      saveYaml(filePath, npcData);
      ok(`NPC [${update.name}] 建立 Tier ${update.tier ?? 2} 持久化檔`);
      changes.push(`NPC created: ${update.name} (${update.id})`);
      continue;
    }

    if (update.action === "update" || update.action === "tier_change") {
      if (!fs.existsSync(filePath)) {
        warn(`NPC [${update.id}] 檔案不存在，改為 create`);
        // fallback to create
        update.action = "create";
        applyNpcUpdates({ ...delta, npc_updates: [update] });
        continue;
      }

      const existing = loadYaml<Record<string, unknown>>(filePath) ?? {};

      // 更新關係數值（delta 加減，非覆蓋）
      if (update.relationship_to_player) {
        const rel = (existing.relationship_to_player ?? {}) as Record<string, unknown>;
        const d = update.relationship_to_player;
        if (d.trust  !== undefined) rel.trust   = ((rel.trust  as number) ?? 0) + d.trust;
        if (d.fear   !== undefined) rel.fear    = ((rel.fear   as number) ?? 0) + d.fear;
        if (d.respect !== undefined) rel.respect = ((rel.respect as number) ?? 0) + d.respect;
        // 鉗位 -10 ~ +10
        for (const k of ["trust","fear","respect"]) {
          if (typeof rel[k] === "number") {
            rel[k] = Math.max(-10, Math.min(10, rel[k] as number));
          }
        }
        if (d.open_debts?.length) {
          rel.open_debts = [...((rel.open_debts as string[]) ?? []), ...d.open_debts];
        }
        existing.relationship_to_player = rel;
      }

      // Append 新記憶
      if (update.decision_memories?.length) {
        const mems = ((existing.decision_memories as DecisionMemory[]) ?? []);
        mems.push(...update.decision_memories);
        // 超過 10 條時摘要警告
        if (mems.length > 10) {
          warn(`NPC [${update.name}] decision_memories 超過 10 條（${mems.length}），建議手動合併`);
        }
        existing.decision_memories = mems;
      }

      // 更新其他欄位
      if (update.knows_about_player?.length) {
        const kap = ((existing.knows_about_player as string[]) ?? []);
        for (const k of update.knows_about_player) {
          if (!kap.includes(k)) kap.push(k);
        }
        existing.knows_about_player = kap;
      }
      if (update.current_goal)          existing.current_goal = update.current_goal;
      if (update.location)              existing.location     = update.location;
      if (update.tier)                  existing.tier         = update.tier;
      if (update.last_seen)             existing.last_seen    = update.last_seen;

      // 更新 speech_examples（覆蓋，因為台詞範例代表當下人格狀態）
      if (update.speech_examples?.length) {
        existing.speech_examples = update.speech_examples;
      }
      if (update.speech_register)       existing.speech_register = update.speech_register;

      // 身份欄位：覆寫（不累加，角色卡以最新 persist_snapshot 為準）
      if (update.identity)      existing.identity      = update.identity;
      if (update.appearance)    existing.appearance    = update.appearance;
      if (update.quirk_profile) existing.quirk_profile = update.quirk_profile;
      if (update.stance)        existing.stance        = update.stance;
      if (update.biases)        existing.biases        = update.biases;
      if (update.psychology)    existing.psychology    = update.psychology;

      // 更新 memory_decay 時間戳
      const md = (existing.memory_decay ?? {}) as Record<string, unknown>;
      md.last_decay_check = delta.new_current_date ?? delta.processed_date;
      existing.memory_decay = md;

      saveYaml(filePath, existing);
      const actionLabel = update.action === "tier_change" ? `升格 Tier ${update.tier}` : "更新";
      ok(`NPC [${update.name}] ${actionLabel}`);
      changes.push(`NPC ${update.action}: ${update.name} (${update.id})`);
    }
  }
  return changes;
}

// ─────────────────────────────────────────────────────────────
// 模組二：具名生物更新
// ─────────────────────────────────────────────────────────────

function applyCreatureUpdates(delta: WorldDelta["world_delta"]): string[] {
  const changes: string[] = [];
  if (!delta.creature_updates?.length) { skip("creature_updates 為空，跳過"); return changes; }

  for (const cu of delta.creature_updates) {
    const filePath = resolveVault("world", "bestiary", "named", `${cu.creature_id}.yaml`);

    if (cu.action === "archived") {
      if (fs.existsSync(filePath)) {
        const existing = loadYaml<Record<string, unknown>>(filePath) ?? {};
        existing.archived = true;
        existing.archived_date = delta.new_current_date;
        saveYaml(filePath, existing);
        ok(`生物 [${cu.name}] 標記為 archived`);
        changes.push(`Creature archived: ${cu.name} (${cu.creature_id})`);
      } else {
        skip(`生物 [${cu.creature_id}] 不存在，略過 archived`);
      }
      continue;
    }

    if (cu.action === "persist") {
      const creatureData: Record<string, unknown> = {
        creature_id:         cu.creature_id,
        name:                cu.name,
        template_id:         cu.template_id,
        last_seen:           cu.last_seen,
        stance_to_player:    cu.stance_to_player ?? "wary",
        notable_traits:      cu.notable_traits ?? [],
        current_location:    cu.current_location,
        persistence_reason:  cu.persistence_reason,
        archived:            false,
      };
      saveYaml(filePath, creatureData);
      ok(`生物 [${cu.name}] 建立具名持久化檔`);
      changes.push(`Creature persisted: ${cu.name} (${cu.creature_id})`);
    }
  }
  return changes;
}

// ─────────────────────────────────────────────────────────────
// 模組三：世界狀態更新（world_state.yaml）
// ─────────────────────────────────────────────────────────────

function applyWorldStateUpdates(delta: WorldDelta["world_delta"]): string[] {
  const changes: string[] = [];
  const filePath = resolveVault("system", "_live", "world_state.yaml");

  if (!fs.existsSync(filePath)) {
    warn("world_state.yaml 不存在，跳過世界狀態更新");
    return changes;
  }

  const state = loadYaml<Record<string, unknown>>(filePath) ?? {};

  // 更新時間
  if (delta.new_current_date) {
    const gt = (state.global_time ?? {}) as Record<string, unknown>;
    const old = gt.current_date;
    gt.current_date = delta.new_current_date;
    if (delta.days_advanced !== undefined) {
      gt.days_since_campaign_start =
        ((gt.days_since_campaign_start as number) ?? 0) + delta.days_advanced;
    }
    state.global_time = gt;
    ok(`時間推進：${old} → ${delta.new_current_date}（+${delta.days_advanced ?? "?"}天）`);
    changes.push(`time_advanced: ${delta.days_advanced ?? "?"} days → ${delta.new_current_date}`);
  }

  // 更新地區狀態
  if (delta.world_updates?.region_changes?.length) {
    const rm = (state.resolution_map ?? {}) as Record<string, unknown>;
    const hi = ((rm.high_detail ?? []) as Record<string, unknown>[]);
    const ab = ((rm.abstract_state ?? []) as Record<string, unknown>[]);
    const rsList = ((state.region_status ?? []) as Record<string, unknown>[]);

    for (const rc of delta.world_updates.region_changes) {
      // 1. 更新 resolution_map
      const hiRegion = hi.find(r => r.region_id === rc.region_id);
      const abRegion = ab.find(r => r.region_id === rc.region_id);
      const target   = hiRegion ?? abRegion;

      if (target) {
        if (rc.atmosphere) target.atmosphere = rc.atmosphere;
        if (rc.notable_event) {
          const events = ((target.local_events ?? []) as string[]);
          events.push(`${delta.new_current_date}: ${rc.notable_event}`);
          target.local_events = events;
        }
        if (rc.abstract_state) target.status = rc.abstract_state;
        (target as Record<string, unknown>).last_updated = delta.new_current_date;
        ok(`地區 [${rc.region_id}] 狀態更新`);
        changes.push(`region_updated: ${rc.region_id}`);
      } else {
        warn(`地區 [${rc.region_id}] 不在 resolution_map 中，跳過`);
      }

      // 2. 同步更新 region_status (用於 KB 快速檢索)
      const rs = rsList.find(r => r.region_id === rc.region_id);
      if (rs) {
        if (rc.atmosphere) rs.current_atmosphere = rc.atmosphere;
        if (rc.abstract_state) rs.population_status = rc.abstract_state;
      }
    }
    rm.high_detail    = hi;
    rm.abstract_state = ab;
    state.resolution_map = rm;
    state.region_status  = rsList;
  }

  // 更新危機狀態
  if (delta.world_updates?.crisis_updates?.length) {
    const events = ((state.active_global_events ?? []) as Record<string, unknown>[]);
    for (const cu of delta.world_updates.crisis_updates) {
      const existing = events.find(e => e.id === cu.id);
      if (existing) {
        existing.status = cu.status;
        if (cu.resolution_note) existing.resolution_note = cu.resolution_note;
        ok(`危機 [${cu.name ?? cu.id}] 狀態 → ${cu.status}`);
        changes.push(`crisis_updated: ${cu.id} → ${cu.status}`);
      }
    }
    state.active_global_events = events;
  }

  saveYaml(filePath, state);
  return changes;
}

// ─────────────────────────────────────────────────────────────
// 模組七：派系變更更新（/world/factions/*.yaml）
// ─────────────────────────────────────────────────────────────

function applyFactionUpdates(delta: WorldDelta["world_delta"]): string[] {
  const changes: string[] = [];
  if (!delta.world_updates?.faction_changes?.length) return changes;

  for (const fc of delta.world_updates.faction_changes) {
    const filePath = resolveVault("world", "factions", `${fc.faction_id}.yaml`);
    if (!fs.existsSync(filePath)) {
      warn(`派系 [${fc.faction_id}] 檔案不存在，跳過`);
      continue;
    }

    const faction = loadYaml<Record<string, unknown>>(filePath) ?? {};
    
    // 記錄歷史變遷
    const history = (faction.recent_history ?? []) as Array<{ date: string; event: string; impact: string }>;
    history.push({
      date:   delta.new_current_date ?? "unknown",
      event:  fc.reason ?? "勢力變動",
      impact: fc.power_shift ?? "未知",
    });
    // 只保留最近 10 條
    faction.recent_history = history.slice(-10);

    saveYaml(filePath, faction);
    ok(`派系 [${fc.faction_id}] 歷史紀錄已更新`);
    changes.push(`faction_updated: ${fc.faction_id}`);
  }
  return changes;
}

// ─────────────────────────────────────────────────────────────
// 模組四：Session Log 追加（session_log.md）
// ─────────────────────────────────────────────────────────────

function appendSessionLog(
  delta: WorldDelta["world_delta"],
  summary: SessionSummary["session_summary"] | null
): void {
  const filePath = resolveVault("system", "_live", "session_log.md");

  const sessionId   = delta.session_id ?? summary?.session_id ?? "unknown";
  const dateIngame  = delta.new_current_date ?? summary?.date_ingame ?? "?";
  const lines: string[] = [
    ``,
    `---`,
    ``,
    `## ${sessionId} 結算（${dateIngame}）`,
    ``,
  ];

  // 重大事件
  if (summary?.major_events?.length) {
    lines.push(`### 重大事件`);
    for (const ev of summary.major_events) {
      lines.push(`- **${ev.date ?? dateIngame}**：${ev.event}（影響：${ev.world_impact ?? "local"}）`);
    }
    lines.push(``);
  }

  // NPC 變化摘要
  if (delta.npc_updates?.length) {
    const created  = delta.npc_updates.filter(n => n.action === "create").map(n => n.name);
    const updated  = delta.npc_updates.filter(n => n.action === "update").map(n => n.name);
    const archived = delta.npc_updates.filter(n => n.action === "archived").map(n => n.name);
    if (created.length)  lines.push(`- 新持久化 NPC：${created.join("、")}`);
    if (updated.length)  lines.push(`- 更新 NPC：${updated.join("、")}`);
    if (archived.length) lines.push(`- 歸檔 NPC：${archived.join("、")}`);
    lines.push(``);
  }

  // 具名生物
  if (delta.creature_updates?.length) {
    const persisted = delta.creature_updates.filter(c => c.action === "persist").map(c => c.name);
    if (persisted.length) lines.push(`- 具名生物：${persisted.join("、")}`);
    lines.push(``);
  }

  // 時間推進
  if (delta.days_advanced) {
    lines.push(`- 世界時間推進 ${delta.days_advanced} 天`);
  }

  // 待處理線索
  if (summary?.pending_threads?.length) {
    lines.push(`### 待處理線索`);
    for (const t of summary.pending_threads) lines.push(`- ${t}`);
    lines.push(``);
  }

  // 下次鉤子
  if (summary?.next_session_hooks?.length) {
    lines.push(`### 下次 Session 鉤子`);
    for (const h of summary.next_session_hooks) lines.push(`- ${h}`);
    lines.push(``);
  }

  // Endgame 狀態
  const egStatus = delta.endgame_check?.status ?? summary?.endgame_check;
  if (egStatus && egStatus !== "false") {
    lines.push(`> **endgame_check: ${egStatus}**${delta.endgame_check?.trigger_condition ? ` — ${delta.endgame_check.trigger_condition}` : ""}`);
    lines.push(``);
  }

  appendMarkdown(filePath, lines.join("\n"));
  ok(`session_log.md 已追加 ${sessionId} 記錄`);
}

// ─────────────────────────────────────────────────────────────
// 模組五：Bestiary Index 更新
// ─────────────────────────────────────────────────────────────

function updateBestiaryIndex(delta: WorldDelta["world_delta"]): void {
  const filePath = resolveVault("world", "bestiary_index.yaml");
  if (!fs.existsSync(filePath)) { skip("bestiary_index.yaml 不存在，跳過"); return; }

  const index = loadYaml<Record<string, unknown>>(filePath) ?? {};
  const counts = (index.current_counts ?? {}) as Record<string, number>;

  // 重新計算 named_creatures 數量與列表
  const namedDir = resolveVault("world", "bestiary", "named");
  if (fs.existsSync(namedDir)) {
    const files = fs.readdirSync(namedDir).filter(f => f.endsWith(".yaml") && f !== ".gitkeep");
    const activeIds: string[] = [];
    for (const f of files) {
      const c = loadYaml<Record<string, unknown>>(path.join(namedDir, f));
      if (c && !c.archived) {
        activeIds.push(path.basename(f, ".yaml"));
      }
    }
    index.named_creatures = activeIds;
    counts.named_creatures = activeIds.length;
  }

  // backfill 計數（只計算非 base_skeleton 的）
  const libPath = resolveVault("bestiary_library.json");
  if (fs.existsSync(libPath)) {
    try {
      const lib = JSON.parse(fs.readFileSync(libPath, "utf-8")) as {
        base_skeletons?: Array<{ backfill_source?: string }>;
      };
      const backfilled = (lib.base_skeletons ?? [])
        .filter(s => s.backfill_source === "runtime_generated").length;
      counts.backfilled_templates = backfilled;
      // 若有 backfilled_templates 列表需求可在這裡擴充
    } catch { /* ignore */ }
  }

  index.current_counts = counts;
  index.last_updated = delta.new_current_date ?? delta.processed_date;
  saveYaml(filePath, index);
  ok(`bestiary_index.yaml 計數更新`);
}

// ─────────────────────────────────────────────────────────────
// 模組六：玩家狀態更新（player_state.yaml）
// ─────────────────────────────────────────────────────────────

function applyPlayerStateUpdates(
  delta: WorldDelta["world_delta"],
  summary: SessionSummary["session_summary"] | null
): string[] {
  const changes: string[] = [];
  const filePath = resolveVault("system", "_live", "player_state.yaml");

  if (!fs.existsSync(filePath)) {
    warn("player_state.yaml 不存在，跳過（請先用 tools/splitter.ts 初始化）");
    return changes;
  }

  const state = loadYaml<Record<string, unknown>>(filePath) ?? {};
  let updated = false;

  // 資源變化（來自 session_summary）
  if (summary?.resource_changes?.length) {
    const resources = (state.resources ?? {}) as Record<string, unknown>;
    for (const rc of summary.resource_changes) {
      const key = rc.resource.toLowerCase().replace(/[\s\-]+/g, "_");
      if (rc.current_total !== undefined && rc.current_total !== null) {
        // 優先用明確的最終值
        resources[key] = rc.current_total;
      } else {
        // fallback：用 delta 加減
        const current = typeof resources[key] === "number"
          ? (resources[key] as number)
          : parseFloat(String(resources[key] ?? "0")) || 0;
        resources[key] = current + rc.delta;
      }
    }
    state.resources = resources;
    ok(`玩家資源已更新（${summary.resource_changes.length} 項）`);
    changes.push(`player_resources_updated: ${summary.resource_changes.map(r => r.resource).join(", ")}`);
    updated = true;
  }

  // 傷勢更新（來自 session_summary）
  if (summary?.injury_updates?.length) {
    const injuries = ((state.injuries ?? []) as Array<Record<string, unknown>>);
    for (const iu of summary.injury_updates) {
      injuries.push({
        description:      iu.description,
        clock_slot:       iu.clock_slot,
        permanent:        iu.permanent,
        permanent_detail: iu.permanent_detail ?? null,
        acquired_date:    delta.new_current_date,
      });
    }
    state.injuries = injuries;

    // 自動計算 body_clock（取最高已填格數，排除永久傷勢）
    const maxSlot = injuries
      .filter(i => !i.permanent)
      .reduce((max, i) => {
        const slot = typeof i.clock_slot === "number" ? i.clock_slot : 0;
        return slot > max ? slot : max;
      }, 0);
    state.body_clock = `${maxSlot}/4`;

    ok(`玩家傷勢已更新（${summary.injury_updates.length} 項）`);
    changes.push(`player_injuries_updated: ${summary.injury_updates.length} injuries`);
    updated = true;
  }

  // last_updated 時間戳
  state.last_updated = `${delta.session_id} / ${delta.new_current_date ?? delta.processed_date}`;

  if (updated) {
    saveYaml(filePath, state);
  } else {
    skip("player_state 無需更新（session_summary 未提供 resource_changes 或 injury_updates）");
  }
  return changes;
}

// ─────────────────────────────────────────────────────────────
// 報告：Backfill 提案（不自動寫入，僅顯示）
// ─────────────────────────────────────────────────────────────

function printBackfillProposals(delta: WorldDelta["world_delta"]): void {
  if (!delta.backfill_proposals?.length) return;

  head("★ Backfill 提案（需手動確認後寫入 bestiary_library.json）");
  for (const bp of delta.backfill_proposals) {
    console.log(`\n  提案 ID：${bp.proposed_id}`);
    console.log(`  基礎模板：${bp.base_template_id ?? "無"}`);
    console.log(`  名稱：${bp.variant_name ?? "未命名"}`);
    console.log(`  Tier：${bp.ecology_tier ?? "?"} / Role：${bp.role ?? "?"}`);
    console.log(`  Attack Modifier：${bp.attack_modifier ?? "?"} / Durability：${bp.durability ?? "?"}`);
    console.log(`  數值錨點：${bp.numerical_anchor_check ?? "?"}`);
    console.log(`  世界事件來源：${bp.world_event_cause ?? "未說明"}`);
    if (bp.key_differences_from_base?.length) {
      console.log(`  與基礎骨架差異：`);
      for (const d of bp.key_differences_from_base) console.log(`    - ${d}`);
    }
  }
  console.log(``);
  warn("以上提案請手動評估後寫入 bestiary_library.json 的 base_skeletons 陣列");
}

// ─────────────────────────────────────────────────────────────
// 報告：世界容量檢查
// ─────────────────────────────────────────────────────────────

function printWorldLimitCheck(delta: WorldDelta["world_delta"]): void {
  const wlc = delta.world_limit_check;
  if (!wlc) return;

  head("世界容量狀態");
  const rows = [
    ["主要派系",   wlc.active_major_factions],
    ["Tier 3 NPC", wlc.tier3_npcs],
    ["Tier 2 NPC", wlc.tier2_npcs],
    ["活躍危機",   wlc.active_crises],
    ["具名生物",   wlc.named_creatures],
    ["持久流言",   wlc.persistent_rumors],
  ];
  for (const [label, val] of rows) {
    if (val && label) log(`${String(label).padEnd(12)} ${val}`);
  }
  if (wlc.cleanup_actions?.length) {
    console.log(``);
    warn("系統執行了以下清理動作：");
    for (const a of wlc.cleanup_actions) log(`  → ${a}`);
  }
}

// ─────────────────────────────────────────────────────────────
// 報告：Endgame 檢查
// ─────────────────────────────────────────────────────────────

function printEndgameCheck(delta: WorldDelta["world_delta"]): void {
  const eg = delta.endgame_check;
  if (!eg || eg.status === "false") return;

  console.log(``);
  if (eg.status === "imminent") {
    console.log(`  ⚠  ════════════════════════════════════════════`);
    console.log(`  ⚠  endgame_check: IMMINENT`);
    console.log(`  ⚠  ${eg.trigger_condition ?? ""}`);
    console.log(`  ⚠  請在下次 Session 切換至 Claude Opus + 延伸思考`);
    console.log(`  ⚠  ════════════════════════════════════════════`);
  } else if (eg.status === "true") {
    console.log(`  ★  ════════════════════════════════════════════`);
    console.log(`  ★  endgame_check: TRUE — 結局已觸發`);
    console.log(`  ★  ${eg.trigger_condition ?? ""}`);
    console.log(`  ★  ════════════════════════════════════════════`);
  }
}

// ─────────────────────────────────────────────────────────────
// 主程式
// ─────────────────────────────────────────────────────────────

function main(): void {
  const deltaPath   = process.argv[2];
  const summaryPath = process.argv[3];

  if (!deltaPath) {
    console.error("用法：npx ts-node tools/apply-delta.ts world_delta.yaml [session_summary.yaml]");
    process.exit(1);
  }
  if (!fs.existsSync(deltaPath)) {
    console.error(`✗ 找不到 ${deltaPath}`);
    process.exit(1);
  }

  // 載入檔案
  const deltaFile   = loadYaml<WorldDelta>(deltaPath);
  const summaryFile = summaryPath ? loadYaml<SessionSummary>(summaryPath) : null;

  if (!deltaFile?.world_delta) {
    console.error("✗ world_delta.yaml 格式錯誤：找不到 world_delta 頂層鍵");
    process.exit(1);
  }

  const delta   = deltaFile.world_delta;
  const summary = summaryFile?.session_summary ?? null;

  console.log(`\n${"═".repeat(52)}`);
  console.log(`  Dark Descent TRPG — 套用結算`);
  console.log(`  Session：${delta.session_id}　→　${delta.new_current_date ?? "?"}`);
  console.log(`${"═".repeat(52)}`);

  const allChanges: string[] = [];

  head("模組一：NPC 更新");
  allChanges.push(...applyNpcUpdates(delta));

  head("模組二：具名生物更新");
  allChanges.push(...applyCreatureUpdates(delta));

  head("模組三：世界狀態更新（world_state.yaml）");
  allChanges.push(...applyWorldStateUpdates(delta));

  head("模組七：派系變更更新（/world/factions/*.yaml）");
  allChanges.push(...applyFactionUpdates(delta));

  head("模組四：Session Log 追加");
  appendSessionLog(delta, summary);

  head("模組五：Bestiary Index 更新");
  updateBestiaryIndex(delta);

  head("模組六：玩家狀態更新（player_state.yaml）");
  allChanges.push(...applyPlayerStateUpdates(delta, summary));

  // 記憶衰退摘要（僅顯示，已在 npc_updates 中處理）
  if (delta.memory_decay_results?.length) {
    head("記憶衰退摘要");
    for (const md of delta.memory_decay_results) {
      log(`[${md.npc_name ?? md.npc_id}] ${md.decay_type}: ${md.original_memory.substring(0, 40)}...`);
    }
  }

  printBackfillProposals(delta);
  printWorldLimitCheck(delta);
  printEndgameCheck(delta);

  // 最終報告
  head(`完成 — 共 ${allChanges.length} 項變更`);
  for (const c of allChanges) log(c);

  console.log(`\n${"═".repeat(52)}`);
  console.log(`  接下來請將以下 3 個檔案替換至 Claude Project KB：`);
  console.log(`  1. system/_live/world_state.yaml`);
  console.log(`  2. system/_live/session_log.md`);
  console.log(`  3. system/_live/player_state.yaml`);
  console.log(`${"═".repeat(52)}\n`);
}

main();
