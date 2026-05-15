/**
 * validate-world.ts
 * 驗證 world.json 格式是否符合 Dark Descent TRPG 規範
 * 用法：npx ts-node tools/validate-world.ts world.json
 *
 * v1.1 變更：新增 races、backgrounds、ecology_seed 驗證
 */

import * as fs from 'fs';
import * as path from 'path';

// ────────────────────────────────────────────────────────
// 型別定義
// ────────────────────────────────────────────────────────

interface World {
  name: string;
  summary: string;
  tone: string;
  magic_level: string;
  tech_level: string;
  core_conflict: string;
  core_theme: string;
  current_day: number;
}

interface NpcProbabilityWeights {
  desperate_people: number;
  opportunists: number;
  loyal_faction_members: number;
  idealists: number;
}

interface CreatureProbabilityWeights {
  mundane_wildlife: number;
  corrupted_wildlife: number;
  human_threats: number;
  folklore_entities: number;
}

interface FlavorDensity {
  level: string;
  common_flavor_creatures: string[];
}

interface FriendlyEncounterChance {
  enabled: boolean;
  examples: string[];
}

interface NamedCreatureRumor {
  exists: boolean;
  local_name?: string;
  known_behavior?: string;
  confirmed: boolean;
}

interface EcologySeed {
  max_tier: string;
  creature_probability_weights: CreatureProbabilityWeights;
  flavor_density?: FlavorDensity;
  friendly_encounter_chance?: FriendlyEncounterChance;
  environment_modifiers?: string[];
  named_creature_rumor?: NamedCreatureRumor;
}

interface SettlementSeed {
  population_estimate: string;
  economy: string;
  culture: {
    dominant_traits: string[];
    common_prejudices: string[];
    social_tensions: string[];
  };
  current_status: {
    war_pressure: string;
    food_scarcity: string;
    law_enforcement: string;
  };
  npc_probability_weights: NpcProbabilityWeights;
  npc_generation_notes: string;
  ecology_seed?: EcologySeed;
}

interface Region {
  id: string;
  name: string;
  x: number;
  y: number;
  description: string;
  atmosphere: string;
  danger_level: string;
  notable_locations: string[];
  settlement_seed: SettlementSeed;
}

interface Faction {
  id: string;
  name: string;
  summary: string;
  ideology: string;
  public_goal: string;
  secret_goal: string;
  typical_member_traits: string[];
}

interface Religion {
  id: string;
  name: string;
  summary: string;
  deity: string;
  core_tenets: string[];
  taboos: string[];
  typical_believer_traits: string[];
}

interface Race {
  id: string;
  name: string;
  appearance_traits: string[];
  cultural_defaults: string[];
  common_prejudices_against_them: string[];
  typical_social_class: string;
  stat_modifier_hint: null;
  npc_generation_notes: string;
}

interface BackgroundAnchor {
  type: string;
  ref_id: string;
  relation: string;
}

interface EquipmentItem {
  name: string;
  description: string;
}

interface Background {
  id: string;
  name: string;
  description: string;
  anchor: BackgroundAnchor;
  stat_priority: string[];
  specialty_candidates: string[];
  starting_region_hint: string[];
  equipment_package: EquipmentItem[];
  gold: number;
  rations: number;
}

interface Relations {
  region_faction: Array<{ region_id: string; faction_id: string; control_type: string }>;
  region_religion: Array<{ region_id: string; religion_id: string; type: string }>;
}

interface WorldJson {
  world: World;
  regions: Region[];
  factions: Faction[];
  religions: Religion[];
  races?: Race[];
  backgrounds?: Background[];
  relations: Relations;
  initial_state: {
    world_flags: Record<string, boolean>;
    region_overrides: Array<{
      region_id: string;
      controlled_by: string | null;
      population_status: string;
    }>;
  };
}

// ────────────────────────────────────────────────────────
// 常數
// ────────────────────────────────────────────────────────

const VALID_ATMOSPHERE    = ['peaceful', 'tense', 'grim', 'chaotic', 'desolate'];
const VALID_DANGER        = ['safe', 'low', 'medium', 'high', 'deadly'];
const VALID_MAGIC         = ['none', 'rare', 'low', 'medium', 'high'];
const VALID_TECH          = ['primitive', 'medieval', 'renaissance', 'industrial'];
const VALID_CONTROL       = ['controls', 'contests', 'influences', 'opposes'];
const VALID_RELIGION_TYPE = ['state_religion', 'tolerated', 'underground', 'banned'];
const VALID_WAR_PRESSURE  = ['none', 'low', 'medium', 'high', 'critical'];
const VALID_FOOD_SCARCITY = ['none', 'low', 'medium', 'high', 'famine'];
const VALID_LAW           = ['strict', 'moderate', 'low', 'absent'];
const VALID_POP_STATUS    = ['thriving', 'stable', 'declining', 'devastated'];
const VALID_MAX_TIER      = ['tier_0_mundane', 'tier_1_low_fantasy', 'tier_2_mid_fantasy', 'tier_3_cosmic'];
const VALID_FLAVOR_LEVEL  = ['low', 'medium', 'high'];
const VALID_ANCHOR_TYPE   = ['faction', 'religion', 'region'];
const VALID_STATS         = ['PHY', 'AGI', 'MND', 'SOC', 'WIL'];
const SNAKE_CASE          = /^[a-z][a-z0-9_]*$/;

// ────────────────────────────────────────────────────────
// 工具函式
// ────────────────────────────────────────────────────────

class Validator {
  private errors: string[] = [];
  private warnings: string[] = [];

  error(msg: string) {
    this.errors.push(`  ✗ ${msg}`);
  }
  warn(msg: string) {
    this.warnings.push(`  ⚠ ${msg}`);
  }

  requireField(obj: Record<string, unknown>, field: string, context: string) {
    if (obj[field] === undefined || obj[field] === null || obj[field] === '') {
      this.error(`${context} 缺少必填欄位：${field}`);
      return false;
    }
    return true;
  }

  requireEnum(value: string, valid: string[], context: string) {
    if (!valid.includes(value)) {
      this.error(`${context} 的值「${value}」無效，合法值：${valid.join(' | ')}`);
    }
  }

  requireSnakeCase(id: string, context: string) {
    if (!SNAKE_CASE.test(id)) {
      this.error(`${context} 的 id「${id}」不是合法的 snake_case`);
    }
  }

  requireUnique(ids: string[], context: string) {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) this.error(`${context} 有重複的 id：${id}`);
      seen.add(id);
    }
  }

  requireRef(id: string, validSet: Set<string>, context: string) {
    if (!validSet.has(id)) {
      this.error(`${context} 引用了不存在的 id：${id}`);
    }
  }

  requireMinLength(arr: unknown[], min: number, context: string) {
    if (!Array.isArray(arr) || arr.length < min) {
      this.error(`${context} 至少需要 ${min} 個項目，目前有 ${Array.isArray(arr) ? arr.length : 0} 個`);
    }
  }

  requireExactLength(arr: unknown[], exact: number, context: string) {
    if (!Array.isArray(arr) || arr.length !== exact) {
      this.error(`${context} 必須剛好有 ${exact} 個項目，目前有 ${Array.isArray(arr) ? arr.length : 0} 個`);
    }
  }

  requireNumber(val: unknown, context: string): val is number {
    if (typeof val !== 'number') {
      this.error(`${context} 必須是數字`);
      return false;
    }
    return true;
  }

  get hasErrors() {
    return this.errors.length > 0;
  }

  report() {
    if (this.warnings.length > 0) {
      console.log('\n⚠  警告：');
      this.warnings.forEach((w) => console.log(w));
    }
    if (this.hasErrors) {
      console.log('\n✗  錯誤：');
      this.errors.forEach((e) => console.log(e));
    }
  }
}

// ────────────────────────────────────────────────────────
// 驗證邏輯
// ────────────────────────────────────────────────────────

function validate(data: WorldJson): Validator {
  const v = new Validator();
  const raw = data as unknown as Record<string, unknown>;

  // ── 1. 頂層結構 ──────────────────────────────────────
  for (const key of ['world', 'regions', 'factions', 'religions', 'relations', 'initial_state']) {
    v.requireField(raw, key, 'world.json 頂層');
  }
  if (v.hasErrors) return v;

  // ── 2. world ─────────────────────────────────────────
  const w = data.world as unknown as Record<string, unknown>;
  for (const f of ['name', 'summary', 'tone', 'magic_level', 'tech_level', 'core_conflict', 'core_theme', 'current_day']) {
    v.requireField(w, f, 'world');
  }
  if (typeof data.world.magic_level !== 'string' || !data.world.magic_level.trim()) {
    v.error('world.magic_level 必須為非空字串');
  } else if (VALID_MAGIC.includes(data.world.magic_level)) {
    /* 已是規範列舉之一 */
  } else if (/^[a-z_]+$/.test(data.world.magic_level.trim())) {
    v.warn(`world.magic_level「${data.world.magic_level}」看似 slug 但不屬於建議值：${VALID_MAGIC.join(' | ')}`);
  }
  if (typeof data.world.tech_level !== 'string' || !data.world.tech_level.trim()) {
    v.error('world.tech_level 必須為非空字串');
  } else if (VALID_TECH.includes(data.world.tech_level)) {
    /* 已是規範列舉之一 */
  } else if (/^[a-z_]+$/.test(data.world.tech_level.trim())) {
    v.warn(`world.tech_level「${data.world.tech_level}」看似 slug 但不屬於建議值：${VALID_TECH.join(' | ')}`);
  }
  if (data.world.current_day !== 1) {
    v.warn(`world.current_day 初始值通常為 1，目前為 ${data.world.current_day}`);
  }

  // ── 3. regions ───────────────────────────────────────
  if (!Array.isArray(data.regions) || data.regions.length === 0) {
    v.error('regions 必須是非空陣列');
    return v;
  }

  const regionIds = data.regions.map((r) => r.id);
  v.requireUnique(regionIds, 'regions');

  for (const r of data.regions) {
    const ctx = `region[${r.id}]`;
    const rr = r as unknown as Record<string, unknown>;
    for (const f of ['id', 'name', 'x', 'y', 'description', 'atmosphere', 'danger_level', 'notable_locations', 'settlement_seed']) {
      v.requireField(rr, f, ctx);
    }
    v.requireSnakeCase(r.id, ctx);
    v.requireEnum(r.atmosphere, VALID_ATMOSPHERE, `${ctx}.atmosphere`);
    v.requireEnum(r.danger_level, VALID_DANGER, `${ctx}.danger_level`);
    v.requireMinLength(r.notable_locations, 3, `${ctx}.notable_locations`);

    // settlement_seed
    if (r.settlement_seed) {
      const ss = r.settlement_seed;
      const sc = `${ctx}.settlement_seed`;
      const ssr = ss as unknown as Record<string, unknown>;
      for (const f of ['population_estimate', 'economy', 'culture', 'current_status', 'npc_probability_weights', 'npc_generation_notes']) {
        v.requireField(ssr, f, sc);
      }

      if (ss.culture) {
        v.requireMinLength(ss.culture.dominant_traits, 1, `${sc}.culture.dominant_traits`);
        v.requireMinLength(ss.culture.common_prejudices, 1, `${sc}.culture.common_prejudices`);
        v.requireMinLength(ss.culture.social_tensions, 1, `${sc}.culture.social_tensions`);
      }

      if (ss.current_status) {
        v.requireEnum(ss.current_status.war_pressure, VALID_WAR_PRESSURE, `${sc}.current_status.war_pressure`);
        v.requireEnum(ss.current_status.food_scarcity, VALID_FOOD_SCARCITY, `${sc}.current_status.food_scarcity`);
        v.requireEnum(ss.current_status.law_enforcement, VALID_LAW, `${sc}.current_status.law_enforcement`);
      }

      // npc_probability_weights 總和檢查
      if (ss.npc_probability_weights) {
        const pw = ss.npc_probability_weights;
        const sum = (pw.desperate_people || 0) + (pw.opportunists || 0) + (pw.loyal_faction_members || 0) + (pw.idealists || 0);
        const rounded = Math.round(sum * 100) / 100;
        if (Math.abs(rounded - 1.0) > 0.01) {
          v.error(`${sc}.npc_probability_weights 四個權重總和必須為 1.0，目前為 ${rounded}`);
        }
        for (const key of ['desperate_people', 'opportunists', 'loyal_faction_members', 'idealists']) {
          const val = (pw as unknown as Record<string, unknown>)[key];
          if (typeof val !== 'number' || val < 0 || val > 1) {
            v.error(`${sc}.npc_probability_weights.${key} 必須是 0.0-1.0 之間的數字`);
          }
        }
      }

      // ── ecology_seed（選填，存在時完整驗證）────────────
      if (ss.ecology_seed) {
        const ec = ss.ecology_seed;
        const ecc = `${sc}.ecology_seed`;
        const ecr = ec as unknown as Record<string, unknown>;

        for (const f of ['max_tier', 'creature_probability_weights']) {
          v.requireField(ecr, f, ecc);
        }

        if (ec.max_tier) {
          v.requireEnum(ec.max_tier, VALID_MAX_TIER, `${ecc}.max_tier`);
        }

        // magic_level 為 none 時 max_tier 不得超過 tier_0_mundane
        if (data.world.magic_level === 'none' && ec.max_tier && ec.max_tier !== 'tier_0_mundane') {
          v.error(`${ecc}.max_tier 為「${ec.max_tier}」，但 world.magic_level 為 none，max_tier 不得超過 tier_0_mundane`);
        }

        // creature_probability_weights
        if (ec.creature_probability_weights) {
          const cw = ec.creature_probability_weights;
          const cwc = `${ecc}.creature_probability_weights`;
          const cwSum =
            (cw.mundane_wildlife || 0) +
            (cw.corrupted_wildlife || 0) +
            (cw.human_threats || 0) +
            (cw.folklore_entities || 0);
          const cwRounded = Math.round(cwSum * 100) / 100;
          if (Math.abs(cwRounded - 1.0) > 0.01) {
            v.error(`${cwc} 四個權重總和必須為 1.0，目前為 ${cwRounded}`);
          }
          for (const key of ['mundane_wildlife', 'corrupted_wildlife', 'human_threats', 'folklore_entities']) {
            const val = (cw as unknown as Record<string, unknown>)[key];
            if (typeof val !== 'number' || val < 0 || val > 1) {
              v.error(`${cwc}.${key} 必須是 0.0-1.0 之間的數字`);
            }
          }
          // magic_level 為 none 時 corrupted_wildlife 必須為 0
          if (data.world.magic_level === 'none' && (cw.corrupted_wildlife ?? 0) !== 0) {
            v.error(`${cwc}.corrupted_wildlife 在 magic_level 為 none 時必須為 0`);
          }
          // max_tier 低於 tier_1 時 folklore_entities 不應大於 0.05
          if (ec.max_tier === 'tier_0_mundane' && (cw.folklore_entities ?? 0) > 0.05) {
            v.warn(`${cwc}.folklore_entities 為 ${cw.folklore_entities}，但 max_tier 為 tier_0_mundane，建議 ≤ 0.05`);
          }
        }

        // flavor_density（選填）
        if (ec.flavor_density) {
          const fd = ec.flavor_density;
          if (fd.level) v.requireEnum(fd.level, VALID_FLAVOR_LEVEL, `${ecc}.flavor_density.level`);
          if (!Array.isArray(fd.common_flavor_creatures)) {
            v.error(`${ecc}.flavor_density.common_flavor_creatures 必須是陣列`);
          }
        }

        // friendly_encounter_chance（選填）
        if (ec.friendly_encounter_chance) {
          const fe = ec.friendly_encounter_chance;
          if (typeof fe.enabled !== 'boolean') {
            v.error(`${ecc}.friendly_encounter_chance.enabled 必須是 boolean`);
          }
          if (fe.enabled && (!Array.isArray(fe.examples) || fe.examples.length === 0)) {
            v.warn(`${ecc}.friendly_encounter_chance.enabled 為 true，但 examples 為空`);
          }
        }

        // named_creature_rumor（選填）
        if (ec.named_creature_rumor) {
          const nr = ec.named_creature_rumor;
          if (typeof nr.exists !== 'boolean') {
            v.error(`${ecc}.named_creature_rumor.exists 必須是 boolean`);
          }
          if (nr.exists) {
            if (!nr.local_name)    v.error(`${ecc}.named_creature_rumor.local_name 在 exists 為 true 時為必填`);
            if (!nr.known_behavior) v.error(`${ecc}.named_creature_rumor.known_behavior 在 exists 為 true 時為必填`);
          }
          if (nr.confirmed !== false) {
            v.warn(`${ecc}.named_creature_rumor.confirmed 初始值通常為 false`);
          }
        }
      }
    }
  }

  // ── 4. factions ──────────────────────────────────────
  if (!Array.isArray(data.factions) || data.factions.length === 0) {
    v.error('factions 必須是非空陣列');
  } else {
    const factionIds = data.factions.map((f) => f.id);
    v.requireUnique(factionIds, 'factions');

    for (const f of data.factions) {
      const ctx = `faction[${f.id}]`;
      const fr = f as unknown as Record<string, unknown>;
      for (const field of ['id', 'name', 'summary', 'ideology', 'public_goal', 'secret_goal', 'typical_member_traits']) {
        v.requireField(fr, field, ctx);
      }
      v.requireSnakeCase(f.id, ctx);
      v.requireMinLength(f.typical_member_traits, 1, `${ctx}.typical_member_traits`);

      if (f.public_goal && f.secret_goal && f.public_goal === f.secret_goal) {
        v.warn(`${ctx} 的 public_goal 與 secret_goal 完全相同，應有張力或矛盾`);
      }
    }
  }

  // ── 5. religions ─────────────────────────────────────
  if (!Array.isArray(data.religions)) {
    v.error('religions 必須是陣列');
  } else {
    const religionIds = data.religions.map((r) => r.id);
    v.requireUnique(religionIds, 'religions');

    for (const r of data.religions) {
      const ctx = `religion[${r.id}]`;
      const rr = r as unknown as Record<string, unknown>;
      for (const f of ['id', 'name', 'summary', 'deity', 'core_tenets', 'taboos', 'typical_believer_traits']) {
        v.requireField(rr, f, ctx);
      }
      v.requireSnakeCase(r.id, ctx);
      v.requireExactLength(r.core_tenets, 3, `${ctx}.core_tenets`);
      v.requireMinLength(r.taboos, 2, `${ctx}.taboos`);
    }
  }

  // ── 6. races（選填，存在時完整驗證）────────────────────
  if (data.races !== undefined) {
    if (!Array.isArray(data.races) || data.races.length === 0) {
      v.error('races 若存在必須是非空陣列（至少 1 個，上限 6 個）');
    } else {
      if (data.races.length > 6) {
        v.error(`races 上限為 6 個，目前有 ${data.races.length} 個`);
      }
      const raceIds = data.races.map((r) => r.id);
      v.requireUnique(raceIds, 'races');

      for (const r of data.races) {
        const ctx = `race[${r.id}]`;
        const rr = r as unknown as Record<string, unknown>;
        for (const f of ['id', 'name', 'appearance_traits', 'cultural_defaults', 'common_prejudices_against_them', 'typical_social_class', 'npc_generation_notes']) {
          v.requireField(rr, f, ctx);
        }
        v.requireSnakeCase(r.id, ctx);
        v.requireMinLength(r.appearance_traits, 1, `${ctx}.appearance_traits`);
        v.requireMinLength(r.cultural_defaults, 1, `${ctx}.cultural_defaults`);
        // stat_modifier_hint 應為 null
        if (rr['stat_modifier_hint'] !== null && rr['stat_modifier_hint'] !== undefined) {
          v.warn(`${ctx}.stat_modifier_hint 建議設為 null（目前為 ${JSON.stringify(rr['stat_modifier_hint'])}）`);
        }
      }
    }
  }

  // ── 7. backgrounds（選填，存在時完整驗證）──────────────
  const regionSet  = new Set(data.regions?.map((r) => r.id) ?? []);
  const factionSet = new Set(data.factions?.map((f) => f.id) ?? []);
  const religionSet = new Set(data.religions?.map((r) => r.id) ?? []);

  if (data.backgrounds !== undefined) {
    if (!Array.isArray(data.backgrounds) || data.backgrounds.length === 0) {
      v.error('backgrounds 若存在必須是非空陣列');
    } else {
      const bgIds = data.backgrounds.map((b) => b.id);
      v.requireUnique(bgIds, 'backgrounds');

      // 規則：至少一個底層背景（gold ≤ 6）
      const hasLowGold = data.backgrounds.some((b) => typeof b.gold === 'number' && b.gold <= 6);
      if (!hasLowGold) {
        v.warn('backgrounds 中沒有 gold ≤ 6 的底層背景，建議至少一個讓玩家從社會底層開始');
      }

      // 規則：至少一個與 faction 有直接關聯的背景
      const hasFactionAnchor = data.backgrounds.some((b) => b.anchor?.type === 'faction');
      if (!hasFactionAnchor) {
        v.warn('backgrounds 中沒有 anchor.type 為 faction 的背景，建議至少一個與派系有直接關聯');
      }

      for (const bg of data.backgrounds) {
        const ctx = `background[${bg.id}]`;
        const bgr = bg as unknown as Record<string, unknown>;
        for (const f of ['id', 'name', 'description', 'anchor', 'stat_priority', 'specialty_candidates', 'starting_region_hint', 'equipment_package', 'gold', 'rations']) {
          v.requireField(bgr, f, ctx);
        }
        v.requireSnakeCase(bg.id, ctx);

        // anchor 驗證
        if (bg.anchor) {
          const ac = bg.anchor as unknown as Record<string, unknown>;
          for (const f of ['type', 'ref_id', 'relation']) {
            v.requireField(ac, f, `${ctx}.anchor`);
          }
          if (bg.anchor.type) {
            v.requireEnum(bg.anchor.type, VALID_ANCHOR_TYPE, `${ctx}.anchor.type`);
          }
          if (bg.anchor.ref_id) {
            // ref_id 必須對應到真實存在的 entity
            let refValid = false;
            if (bg.anchor.type === 'faction')  refValid = factionSet.has(bg.anchor.ref_id);
            if (bg.anchor.type === 'religion') refValid = religionSet.has(bg.anchor.ref_id);
            if (bg.anchor.type === 'region')   refValid = regionSet.has(bg.anchor.ref_id);
            if (!refValid) {
              v.error(`${ctx}.anchor.ref_id「${bg.anchor.ref_id}」在對應的 ${bg.anchor.type} 中找不到`);
            }
          }
        }

        // stat_priority 驗證
        if (Array.isArray(bg.stat_priority)) {
          v.requireMinLength(bg.stat_priority, 1, `${ctx}.stat_priority`);
          for (const stat of bg.stat_priority) {
            if (!VALID_STATS.includes(stat)) {
              v.error(`${ctx}.stat_priority 包含非法屬性「${stat}」，合法值：${VALID_STATS.join(' | ')}`);
            }
          }
        }

        // specialty_candidates 驗證
        v.requireMinLength(bg.specialty_candidates ?? [], 3, `${ctx}.specialty_candidates`);

        // starting_region_hint 驗證：每個 ref 必須存在
        if (Array.isArray(bg.starting_region_hint)) {
          for (const rid of bg.starting_region_hint) {
            v.requireRef(rid, regionSet, `${ctx}.starting_region_hint`);
          }
        }

        // equipment_package 驗證
        if (Array.isArray(bg.equipment_package)) {
          for (const item of bg.equipment_package) {
            const ir = item as unknown as Record<string, unknown>;
            if (!ir['name'])        v.error(`${ctx}.equipment_package 有項目缺少 name`);
            if (!ir['description']) v.error(`${ctx}.equipment_package 有項目缺少 description`);
          }
        }

        // gold / rations 型別
        if (typeof bg.gold !== 'number')   v.error(`${ctx}.gold 必須是數字`);
        if (typeof bg.rations !== 'number') v.error(`${ctx}.rations 必須是數字`);
      }
    }
  }

  // ── 8. relations 引用驗證 ────────────────────────────
  if (data.relations?.region_faction) {
    for (const rel of data.relations.region_faction) {
      v.requireRef(rel.region_id, regionSet, `relations.region_faction region_id`);
      v.requireRef(rel.faction_id, factionSet, `relations.region_faction faction_id`);
      v.requireEnum(rel.control_type, VALID_CONTROL, `relations.region_faction[${rel.region_id}→${rel.faction_id}].control_type`);
    }
    // 每個 faction 至少有一條 region_faction
    for (const f of data.factions ?? []) {
      const linked = data.relations.region_faction.some((r) => r.faction_id === f.id);
      if (!linked) v.error(`faction[${f.id}] 沒有任何 region_faction 關係`);
    }
  }

  if (data.relations?.region_religion) {
    for (const rel of data.relations.region_religion) {
      v.requireRef(rel.region_id, regionSet, `relations.region_religion region_id`);
      v.requireRef(rel.religion_id, religionSet, `relations.region_religion religion_id`);
      v.requireEnum(rel.type, VALID_RELIGION_TYPE, `relations.region_religion[${rel.region_id}].type`);
    }
  }

  // ── 9. initial_state ─────────────────────────────────
  if (data.initial_state?.region_overrides) {
    for (const ro of data.initial_state.region_overrides) {
      v.requireRef(ro.region_id, regionSet, `initial_state.region_overrides region_id`);
      if (ro.controlled_by !== null) {
        v.requireRef(ro.controlled_by, factionSet, `initial_state.region_overrides controlled_by`);
      }
      v.requireEnum(ro.population_status, VALID_POP_STATUS, `initial_state.region_overrides[${ro.region_id}].population_status`);
    }
  }

  // ── 10. 禁止含有 NPC 欄位 ──────────────────────────────
  if ((raw as Record<string, unknown>)['npcs']) {
    v.error('world.json 不應包含 npcs 陣列（NPC 在遊玩時動態生成）');
  }

  return v;
}

// ────────────────────────────────────────────────────────
// 主程式
// ────────────────────────────────────────────────────────

function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('用法：npx ts-node tools/validate-world.ts world.json');
    process.exit(1);
  }

  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    console.error(`✗ 找不到檔案：${absPath}`);
    process.exit(1);
  }

  let data: WorldJson | undefined;
  try {
    data = JSON.parse(fs.readFileSync(absPath, 'utf-8')) as WorldJson;
  } catch (e) {
    console.error(`✗ JSON 解析失敗：${(e as Error).message}`);
    process.exit(1);
  }

  console.log(`\n驗證中：${path.basename(absPath)}\n${'─'.repeat(50)}`);

  const v = validate(data!);
  v.report();

  if (v.hasErrors) {
    console.log(`\n${'─'.repeat(50)}`);
    console.log('✗  驗證失敗，請修正以上錯誤後再執行 tools/splitter.ts');
    process.exit(1);
  } else {
    console.log(`\n${'─'.repeat(50)}`);
    console.log('✅ 驗證通過！');
    console.log('   下一步：npx ts-node tools/splitter.ts world.json');
  }
}

main();