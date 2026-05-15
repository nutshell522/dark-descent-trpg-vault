/**
 * validate-world.ts
 * 驗證 world.json 格式是否符合 Dark Descent TRPG 規範
 * 用法：npx ts-node tools/validate-world.ts world.json
 */

import * as fs from "fs";
import * as path from "path";

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

interface Relations {
  region_faction: Array<{ region_id: string; faction_id: string; control_type: string }>;
  region_religion: Array<{ region_id: string; religion_id: string; type: string }>;
}

interface WorldJson {
  world: World;
  regions: Region[];
  factions: Faction[];
  religions: Religion[];
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

const VALID_ATMOSPHERE = ["peaceful", "tense", "grim", "chaotic", "desolate"];
const VALID_DANGER = ["safe", "low", "medium", "high", "deadly"];
const VALID_MAGIC = ["none", "rare", "low", "medium", "high"];
const VALID_TECH = ["primitive", "medieval", "renaissance", "industrial"];
const VALID_CONTROL = ["controls", "contests", "influences", "opposes"];
const VALID_RELIGION_TYPE = ["state_religion", "tolerated", "underground", "banned"];
const VALID_WAR_PRESSURE = ["none", "low", "medium", "high", "critical"];
const VALID_FOOD_SCARCITY = ["none", "low", "medium", "high", "famine"];
const VALID_LAW = ["strict", "moderate", "low", "absent"];
const VALID_POP_STATUS = ["thriving", "stable", "declining", "devastated"];
const SNAKE_CASE = /^[a-z][a-z0-9_]*$/;

// ────────────────────────────────────────────────────────
// 工具函式
// ────────────────────────────────────────────────────────

class Validator {
  private errors: string[] = [];
  private warnings: string[] = [];

  error(msg: string) { this.errors.push(`  ✗ ${msg}`); }
  warn(msg: string)  { this.warnings.push(`  ⚠ ${msg}`); }

  requireField(obj: Record<string, unknown>, field: string, context: string) {
    if (obj[field] === undefined || obj[field] === null || obj[field] === "") {
      this.error(`${context} 缺少必填欄位：${field}`);
      return false;
    }
    return true;
  }

  requireEnum(value: string, valid: string[], context: string) {
    if (!valid.includes(value)) {
      this.error(`${context} 的值「${value}」無效，合法值：${valid.join(" | ")}`);
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

  get hasErrors() { return this.errors.length > 0; }

  report() {
    if (this.warnings.length > 0) {
      console.log("\n⚠  警告：");
      this.warnings.forEach(w => console.log(w));
    }
    if (this.hasErrors) {
      console.log("\n✗  錯誤：");
      this.errors.forEach(e => console.log(e));
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
  for (const key of ["world", "regions", "factions", "religions", "relations", "initial_state"]) {
    v.requireField(raw, key, "world.json 頂層");
  }
  if (v.hasErrors) return v; // 頂層缺欄位就不繼續

  // ── 2. world ─────────────────────────────────────────
  const w = data.world as unknown as Record<string, unknown>;
  for (const f of ["name","summary","tone","magic_level","tech_level","core_conflict","core_theme","current_day"]) {
    v.requireField(w, f, "world");
  }
  // magic_level / tech_level：World Generator 常輸出敘述性文字（含中文），與 splitter 輸出表格相容；
  // 僅在非空字串通過後，若剛好是英文 slug 才對照建議列舉，否則不強制。
  if (typeof data.world.magic_level !== "string" || !data.world.magic_level.trim()) {
    v.error("world.magic_level 必須為非空字串");
  } else if (VALID_MAGIC.includes(data.world.magic_level)) {
    /* 已是規範列舉之一 */
  } else if (/^[a-z_]+$/.test(data.world.magic_level.trim())) {
    v.warn(`world.magic_level「${data.world.magic_level}」看似 slug 但不屬於建議值：${VALID_MAGIC.join(" | ")}`);
  }
  if (typeof data.world.tech_level !== "string" || !data.world.tech_level.trim()) {
    v.error("world.tech_level 必須為非空字串");
  } else if (VALID_TECH.includes(data.world.tech_level)) {
    /* 已是規範列舉之一 */
  } else if (/^[a-z_]+$/.test(data.world.tech_level.trim())) {
    v.warn(`world.tech_level「${data.world.tech_level}」看似 slug 但不屬於建議值：${VALID_TECH.join(" | ")}`);
  }
  if (data.world.current_day !== 1) {
    v.warn(`world.current_day 初始值通常為 1，目前為 ${data.world.current_day}`);
  }

  // ── 3. regions ───────────────────────────────────────
  if (!Array.isArray(data.regions) || data.regions.length === 0) {
    v.error("regions 必須是非空陣列");
    return v;
  }

  const regionIds = data.regions.map(r => r.id);
  v.requireUnique(regionIds, "regions");

  for (const r of data.regions) {
    const ctx = `region[${r.id}]`;
    const rr = r as unknown as Record<string, unknown>;
    for (const f of ["id","name","x","y","description","atmosphere","danger_level","notable_locations","settlement_seed"]) {
      v.requireField(rr, f, ctx);
    }
    v.requireSnakeCase(r.id, ctx);
    v.requireEnum(r.atmosphere,  VALID_ATMOSPHERE, `${ctx}.atmosphere`);
    v.requireEnum(r.danger_level, VALID_DANGER,    `${ctx}.danger_level`);
    v.requireMinLength(r.notable_locations, 3, `${ctx}.notable_locations`);

    // settlement_seed
    if (r.settlement_seed) {
      const ss = r.settlement_seed;
      const sc = `${ctx}.settlement_seed`;
      const ssr = ss as unknown as Record<string, unknown>;
      for (const f of ["population_estimate","economy","culture","current_status","npc_probability_weights","npc_generation_notes"]) {
        v.requireField(ssr, f, sc);
      }

      if (ss.culture) {
        v.requireMinLength(ss.culture.dominant_traits,    1, `${sc}.culture.dominant_traits`);
        v.requireMinLength(ss.culture.common_prejudices,  1, `${sc}.culture.common_prejudices`);
        v.requireMinLength(ss.culture.social_tensions,    1, `${sc}.culture.social_tensions`);
      }

      if (ss.current_status) {
        v.requireEnum(ss.current_status.war_pressure,   VALID_WAR_PRESSURE, `${sc}.current_status.war_pressure`);
        v.requireEnum(ss.current_status.food_scarcity,  VALID_FOOD_SCARCITY, `${sc}.current_status.food_scarcity`);
        v.requireEnum(ss.current_status.law_enforcement, VALID_LAW,          `${sc}.current_status.law_enforcement`);
      }

      // 機率權重總和檢查
      if (ss.npc_probability_weights) {
        const pw = ss.npc_probability_weights;
        const sum = (pw.desperate_people || 0) + (pw.opportunists || 0) +
                    (pw.loyal_faction_members || 0) + (pw.idealists || 0);
        const rounded = Math.round(sum * 100) / 100;
        if (Math.abs(rounded - 1.0) > 0.01) {
          v.error(`${sc}.npc_probability_weights 四個權重總和必須為 1.0，目前為 ${rounded}`);
        }
        for (const key of ["desperate_people","opportunists","loyal_faction_members","idealists"]) {
          const val = (pw as unknown as Record<string, unknown>)[key];
          if (typeof val !== "number" || val < 0 || val > 1) {
            v.error(`${sc}.npc_probability_weights.${key} 必須是 0.0-1.0 之間的數字`);
          }
        }
      }
    }
  }

  // ── 4. factions ──────────────────────────────────────
  if (!Array.isArray(data.factions) || data.factions.length === 0) {
    v.error("factions 必須是非空陣列");
  } else {
    const factionIds = data.factions.map(f => f.id);
    v.requireUnique(factionIds, "factions");

    for (const f of data.factions) {
      const ctx = `faction[${f.id}]`;
      const fr = f as unknown as Record<string, unknown>;
      for (const field of ["id","name","summary","ideology","public_goal","secret_goal","typical_member_traits"]) {
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
    v.error("religions 必須是陣列");
  } else {
    const religionIds = data.religions.map(r => r.id);
    v.requireUnique(religionIds, "religions");

    for (const r of data.religions) {
      const ctx = `religion[${r.id}]`;
      const rr = r as unknown as Record<string, unknown>;
      for (const f of ["id","name","summary","deity","core_tenets","taboos","typical_believer_traits"]) {
        v.requireField(rr, f, ctx);
      }
      v.requireSnakeCase(r.id, ctx);
      v.requireExactLength(r.core_tenets, 3, `${ctx}.core_tenets`);
      v.requireMinLength(r.taboos, 2, `${ctx}.taboos`);
    }
  }

  // ── 6. relations 引用驗證 ────────────────────────────
  const regionSet  = new Set(data.regions?.map(r => r.id) ?? []);
  const factionSet = new Set(data.factions?.map(f => f.id) ?? []);
  const religionSet = new Set(data.religions?.map(r => r.id) ?? []);

  if (data.relations?.region_faction) {
    for (const rel of data.relations.region_faction) {
      v.requireRef(rel.region_id,  regionSet,  `relations.region_faction region_id`);
      v.requireRef(rel.faction_id, factionSet, `relations.region_faction faction_id`);
      v.requireEnum(rel.control_type, VALID_CONTROL, `relations.region_faction[${rel.region_id}→${rel.faction_id}].control_type`);
    }
    // 每個 faction 至少有一條 region_faction
    for (const f of data.factions ?? []) {
      const linked = data.relations.region_faction.some(r => r.faction_id === f.id);
      if (!linked) v.error(`faction[${f.id}] 沒有任何 region_faction 關係`);
    }
  }

  if (data.relations?.region_religion) {
    for (const rel of data.relations.region_religion) {
      v.requireRef(rel.region_id,   regionSet,   `relations.region_religion region_id`);
      v.requireRef(rel.religion_id, religionSet, `relations.region_religion religion_id`);
      v.requireEnum(rel.type, VALID_RELIGION_TYPE, `relations.region_religion[${rel.region_id}].type`);
    }
  }

  // ── 7. initial_state ─────────────────────────────────
  if (data.initial_state?.region_overrides) {
    for (const ro of data.initial_state.region_overrides) {
      v.requireRef(ro.region_id, regionSet, `initial_state.region_overrides region_id`);
      if (ro.controlled_by !== null) {
        v.requireRef(ro.controlled_by, factionSet, `initial_state.region_overrides controlled_by`);
      }
      v.requireEnum(ro.population_status, VALID_POP_STATUS, `initial_state.region_overrides[${ro.region_id}].population_status`);
    }
  }

  // ── 8. 禁止含有 NPC 欄位 ──────────────────────────────
  if ((raw as Record<string, unknown>)["npcs"]) {
    v.error("world.json 不應包含 npcs 陣列（NPC 在遊玩時動態生成）");
  }

  return v;
}

// ────────────────────────────────────────────────────────
// 主程式
// ────────────────────────────────────────────────────────

function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("用法：npx ts-node tools/validate-world.ts world.json");
    process.exit(1);
  }

  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    console.error(`✗ 找不到檔案：${absPath}`);
    process.exit(1);
  }

  let data: WorldJson | undefined;
  try {
    data = JSON.parse(fs.readFileSync(absPath, "utf-8")) as WorldJson;
  } catch (e) {
    console.error(`✗ JSON 解析失敗：${(e as Error).message}`);
    process.exit(1);
  }

  console.log(`\n驗證中：${path.basename(absPath)}\n${"─".repeat(50)}`);

  const v = validate(data!);
  v.report();

  if (v.hasErrors) {
    console.log(`\n${"─".repeat(50)}`);
    console.log("✗  驗證失敗，請修正以上錯誤後再執行 tools/splitter.ts");
    process.exit(1);
  } else {
    console.log(`\n${"─".repeat(50)}`);
    console.log("✅ 驗證通過！");
    console.log("   下一步：npx ts-node tools/splitter.ts world.json");
  }
}

main();
