/**
 * splitter.ts
 * 把 world.json 拆分成 Dark Descent TRPG 的 Obsidian 目錄結構
 * 用法：npx ts-node tools/splitter.ts world.json [output_dir]
 *
 * 輸出結構：
 *   /world/regions/[id].yaml
 *   /world/factions/[id].yaml
 *   /world/religions/[id].yaml
 *   /npcs/settlements/[region_id].yaml          ← Tier 0 城鎮種子（含生態種子）
 *   /world/bestiary/ecology/[region_id].yaml   ← Tier 0 生態種子（從 settlement_seed 拆出）
 *   /world/bestiary/named/                     ← 空目錄，具名生物持久化
 *   /world/races/[id].yaml                           ← 種族資料（若 world.json 包含）
 *   /world/world_setting.md                          ← GM Only 世界設定（含秘密目標）
 *   /world/npc_database.yaml                         ← NPC 資料庫空索引
 *   /world/bestiary_index.yaml                       ← 生物索引空索引
 *   /system/_static/world_kb.md                      ← Claude KB 上傳用（已過濾 GM Only，幾乎不動）
 *   /system/_static/world_limits.yaml                ← 世界容量限制（靜態設定）
 *   /system/_live/world_state.yaml                   ← 每次結算後替換至 KB
 *   /system/_live/session_log.md                     ← 每次結算後替換至 KB
 *   /system/_live/player_state.yaml                  ← 每次結算後替換至 KB
 *   /sessions/                                       ← 空目錄
 *   /player/                                         ← 空目錄（本地備用）
 *   /npcs/persistent/                                ← 空目錄
 *   /npcs/tier3_core/                                ← 空目錄
 */

import * as fs   from "fs";
import * as path from "path";
import * as yaml from "js-yaml";

// ────────────────────────────────────────────────────────
// 工具函式
// ────────────────────────────────────────────────────────

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeYaml(filePath: string, data: unknown) {
  const dir = path.dirname(filePath);
  ensureDir(dir);
  fs.writeFileSync(filePath, yaml.dump(data, { lineWidth: 120, quotingType: '"' }), "utf-8");
}

function writeMarkdown(filePath: string, content: string) {
  const dir = path.dirname(filePath);
  ensureDir(dir);
  fs.writeFileSync(filePath, content, "utf-8");
}

function touchDir(dirPath: string) {
  ensureDir(dirPath);
  const keepPath = path.join(dirPath, ".gitkeep");
  if (!fs.existsSync(keepPath)) {
    fs.writeFileSync(keepPath, "", "utf-8");
  }
}

function log(msg: string) { console.log(`  ${msg}`); }

// ────────────────────────────────────────────────────────
// 主程式
// ────────────────────────────────────────────────────────

interface EcologySeed {
  max_tier: string;
  creature_probability_weights: {
    mundane_wildlife: number;
    corrupted_wildlife: number;
    human_threats: number;
    folklore_entities: number;
  };
  environment_modifiers?: string[];
  named_creature_rumor?: {
    exists: boolean;
    local_name?: string;
    known_behavior?: string;
    confirmed: boolean;
  };
}

interface SettlementSeedWithEcology {
  ecology_seed?: EcologySeed;
  [key: string]: unknown;
}

interface EquipmentItem {
  name: string;
  description: string;
}

interface Background {
  id: string;
  name: string;
  description: string;
  anchor: {
    type: string;
    ref_id: string;
    relation: string;
  };
  stat_priority: string[];
  specialty_candidates: string[];
  starting_region_hint: string[];
  equipment_package: EquipmentItem[];
  gold: number;
  rations: number;
}

interface WorldJson {
  world: Record<string, unknown>;
  regions: Array<Record<string, unknown> & {
    id: string;
    name: string;
    atmosphere: string;
    settlement_seed: SettlementSeedWithEcology;
  }>;
  factions: Array<Record<string, unknown> & { id: string }>;
  religions: Array<Record<string, unknown> & { id: string }>;
  races?: Array<Record<string, unknown> & { id: string }>;
  backgrounds?: Background[];
  relations: Record<string, unknown>;
  initial_state: {
    world_flags: Record<string, boolean>;
    region_overrides: Array<{ region_id: string; controlled_by: string | null; population_status: string }>;
  };
}

function main() {
  const filePath  = process.argv[2];
  const outputDir = process.argv[3] ? path.resolve(process.argv[3]) : process.cwd();

  if (!filePath) {
    console.error("用法：npx ts-node tools/splitter.ts world.json [output_dir]");
    process.exit(1);
  }

  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    console.error(`✗ 找不到檔案：${absPath}`);
    process.exit(1);
  }

  let data: WorldJson;
  try {
    data = JSON.parse(fs.readFileSync(absPath, "utf-8"));
  } catch (e) {
    console.error(`✗ JSON 解析失敗：${(e as Error).message}`);
    process.exit(1);
  }

  console.log(`\n拆分中：${path.basename(absPath)}`);
  console.log(`輸出目錄：${outputDir}`);
  console.log(`${"─".repeat(50)}`);

  // ── 1. 空目錄初始化 ────────────────────────────────────
  touchDir(path.join(outputDir, "sessions"));
  touchDir(path.join(outputDir, "player"));
  touchDir(path.join(outputDir, "npcs", "persistent"));
  touchDir(path.join(outputDir, "npcs", "tier3_core"));
  touchDir(path.join(outputDir, "world", "bestiary", "named"));
  log("✓ 空目錄初始化完成（sessions / player / npcs/persistent / npcs/tier3_core / world/bestiary/named）");

  // ── 2. 拆分 regions ────────────────────────────────────
  const regionDir = path.join(outputDir, "world", "regions");
  for (const region of data.regions) {
    const { settlement_seed, ...regionCore } = region;
    const outPath = path.join(regionDir, `${region.id}.yaml`);
    writeYaml(outPath, regionCore);
  }
  log(`✓ regions 拆分完成（${data.regions.length} 個）→ /world/regions/`);

  // ── 3. 拆分 factions ───────────────────────────────────
  const factionDir = path.join(outputDir, "world", "factions");
  for (const faction of data.factions) {
    writeYaml(path.join(factionDir, `${faction.id}.yaml`), faction);
  }
  log(`✓ factions 拆分完成（${data.factions.length} 個）→ /world/factions/`);

  // ── 4a. 拆分 races（若存在）──────────────────────────
  if (data.races && data.races.length > 0) {
    const raceDir = path.join(outputDir, "world", "races");
    for (const race of data.races) {
      writeYaml(path.join(raceDir, `${race.id}.yaml`), race);
    }
    log(`✓ races 拆分完成（${data.races.length} 個）→ /world/races/`);
  } else {
    log(`⚠ 未偵測到 races 欄位（可之後手動補充 /world/races/）`);
  }

  // ── 4b-2. 拆分 backgrounds（若存在）─────────────────
  if (data.backgrounds && data.backgrounds.length > 0) {
    const bgDir = path.join(outputDir, "world", "backgrounds");
    for (const bg of data.backgrounds) {
      writeYaml(path.join(bgDir, `${bg.id}.yaml`), bg);
    }
    log(`✓ backgrounds 拆分完成（${data.backgrounds.length} 個）→ /world/backgrounds/`);
  } else {
    log(`⚠ 未偵測到 backgrounds 欄位（可之後手動補充 /world/backgrounds/）`);
  }

  // ── 4b. 拆分 religions ──────────────────────────────────
  const religionDir = path.join(outputDir, "world", "religions");
  for (const religion of data.religions) {
    writeYaml(path.join(religionDir, `${religion.id}.yaml`), religion);
  }
  log(`✓ religions 拆分完成（${data.religions.length} 個）→ /world/religions/`);

  // ── 5. 拆分 settlement_seed → Tier 0 城鎮種子 + 生態種子 ──
  const settlementDir = path.join(outputDir, "npcs", "settlements");
  const ecologyDir    = path.join(outputDir, "world", "bestiary", "ecology");
  let ecologyCount = 0;

  for (const region of data.regions) {
    const { ecology_seed, ...settlementOnly } = region.settlement_seed;

    // 城鎮種子（不含 ecology_seed）
    const seed = {
      region_id:   region.id,
      region_name: region.name,
      ...settlementOnly,
    };
    writeYaml(path.join(settlementDir, `${region.id}.yaml`), seed);

    // 生態種子（單獨存放）
    if (ecology_seed) {
      const ecoSeed = {
        region_id:   region.id,
        region_name: region.name,
        ...ecology_seed,
      };
      writeYaml(path.join(ecologyDir, `${region.id}.yaml`), ecoSeed);
      ecologyCount++;
    }
  }
  log(`✓ Tier 0 城鎮種子拆分完成（${data.regions.length} 個）→ /npcs/settlements/`);
  if (ecologyCount > 0) {
    log(`✓ Tier 0 生態種子拆分完成（${ecologyCount} 個）→ /world/bestiary/ecology/`);
  } else {
    log(`⚠ 未偵測到 ecology_seed 欄位，/world/bestiary/ecology/ 為空（可之後補充）`);
  }

  // ── 6. 生成 world_setting.md ────────────────────────
  const systemDir       = path.join(outputDir, "system");
  const systemStaticDir = path.join(outputDir, "system", "_static");
  const systemLiveDir   = path.join(outputDir, "system", "_live");
  const worldMd = [
    `# ${data.world.name}`,
    ``,
    `## 世界概述`,
    `${data.world.summary}`,
    ``,
    `## 核心衝突`,
    `${data.world.core_conflict}`,
    ``,
    `## 核心主題（玩家反覆面對的道德困境）`,
    `${data.world.core_theme}`,
    ``,
    `## 世界基本參數`,
    `| 項目 | 值 |`,
    `|------|---|`,
    `| 氛圍 | ${data.world.tone} |`,
    `| 魔法水平 | ${data.world.magic_level} |`,
    `| 科技水平 | ${data.world.tech_level} |`,
    ``,
    `## 派系一覽`,
    ...data.factions.map(f =>
      `### ${f.name}\n- **公開目標**：${f.public_goal}\n- **核心信念**：${f.ideology}\n`
    ),
    `## 宗教一覽`,
    ...data.religions.map(r =>
      `### ${r.name}（${r.deity}）\n${r.summary}\n`
    ),
    `## 地區一覽`,
    ...data.regions.map(r =>
      `### ${r.name}\n${r.description}\n- 氛圍：${r.atmosphere} | 危險等級：${r.danger_level}\n`
    ),
  ].join("\n");

  writeMarkdown(path.join(outputDir, "world", "world_setting.md"), worldMd);
  log(`✓ world_setting.md 生成完成 → /world/`);

  // ── 7. 生成 world_state.yaml ────────────────────────────
  const regionOverridesMap: Record<string, { controlled_by: string | null; population_status: string }> = {};
  for (const ro of data.initial_state.region_overrides ?? []) {
    regionOverridesMap[ro.region_id] = {
      controlled_by: ro.controlled_by,
      population_status: ro.population_status,
    };
  }

  const resolutionMap = {
    high_detail: data.regions.slice(0, 1).map(r => ({
      region: r.name,
      region_id: r.id,
      detail_level: "full",
      active_npcs: [],
      local_events: [],
    })),
    abstract_state: data.regions.slice(1).map(r => ({
      region: r.name,
      region_id: r.id,
      status: r.atmosphere,
      last_updated: "Year1_Day_1",
      player_relevance: "low",
    })),
  };

  const activeWorldState = {
    global_time: {
      current_date: "Year1_Day_1",
      current_season: "待設定",
      moon_cycle:     "待設定",
      days_since_campaign_start: 0,
    },
    travel_time_reference: "待填寫（例：地區A_to_地區B: 8_days_on_foot）",
    active_global_events: Object.entries(data.initial_state.world_flags ?? {})
      .filter(([, v]) => v === true)
      .map(([k], i) => ({
        id: `evt_${String(i + 1).padStart(3, "0")}`,
        name: k,
        start_date: "Year1_Day_1",
        status: "ongoing",
        affected_regions: [],
      })),
    resolution_map: resolutionMap,
    region_status: data.regions.map(r => ({
      region_id: r.id,
      region_name: r.name,
      controlled_by: regionOverridesMap[r.id]?.controlled_by ?? null,
      population_status: regionOverridesMap[r.id]?.population_status ?? "stable",
      current_atmosphere: r.atmosphere,
    })),
    information_delay_rule:
      "遠方事件的情報抵達時間 = 距離(天) × 1.5，傳遞過程中必然失真，距離越遠失真越高。",
  };

  writeYaml(path.join(systemLiveDir, "world_state.yaml"), activeWorldState);
  log("✓ world_state.yaml 生成完成 → /system/_live/");

  // ── 8. 生成 world_limits.yaml ─────────────────────────
  const worldLimits = {
    world_limits: {
      active_major_factions: 12,
      tier3_npcs_max: 30,
      tier2_npcs_max: 100,
      active_crises_max: 5,
      persistent_rumors_max: 20,
      regions_high_detail_max: 3,
    },
    auto_cleanup_rules: [
      "超過 tier3_npcs_max：最久未登場者降級，不刪除記憶",
      "超過 active_crises_max：最舊危機以「低調收尾」方式結案",
      "超過 persistent_rumors_max：傳播力最低者標記為 expired",
    ],
  };

  writeYaml(path.join(systemStaticDir, "world_limits.yaml"), worldLimits);
  log("✓ world_limits.yaml 生成完成 → /system/_static/");

  // ── 9a. 生成 bestiary_index.yaml（空索引）─────────────
  const bestiaryIndex = {
    _note: "生物資料庫索引，隨遊玩透過 STEP 3 Gem Backfill 自動擴充",
    named_creatures: [],
    backfilled_templates: [],
    current_counts: {
      named_creatures: 0,
      backfilled_templates: 0,
    },
    last_updated: "Year1_Day_1",
  };
  writeYaml(path.join(outputDir, "world", "bestiary_index.yaml"), bestiaryIndex);
  log("✓ bestiary_index.yaml 空索引生成完成 → /world/");

  // ── 9. 生成 npc_database.yaml（空索引）────────────────
  const npcDatabase = {
    _note: "此檔案為動態索引，遊玩開始後由 STEP 3 Gem 結算時自動更新",
    tier2_npcs: [],
    tier3_npcs: [],
    archived_npcs: [],
    current_counts: {
      tier2: 0,
      tier3: 0,
      archived: 0,
    },
  };

  writeYaml(path.join(outputDir, "world", "npc_database.yaml"), npcDatabase);
  log("✓ npc_database.yaml 空索引生成完成 → /world/");

  // ── 10. 生成 session_log.md（空檔）──────────────────────
  const sessionLog = [
    `# Session Log Summary`,
    ``,
    `> 只保留每次結算的關鍵節點，不存完整對話記錄。`,
    `> 每次 Macro Loop 結算後 append，不修改舊記錄。`,
    ``,
    `---`,
    ``,
    `## 世界初始化`,
    `- 日期：Year1_Day_1`,
    `- 世界：${data.world.name}`,
    `- 核心衝突：${data.world.core_conflict}`,
    ``,
  ].join("\n");

  writeMarkdown(path.join(systemLiveDir, "session_log.md"), sessionLog);
  log("✓ session_log.md 初始化完成 → /system/_live/");

  // ── 11. 生成 world_kb.md（★ Claude Project KB 單一上傳檔）─
  //  過濾規則：
  //   - 派系：排除 secret_goal（玩家不應知道）
  //   - 地區：排除 settlement_seed / ecology_seed（GM Only）
  //   - 種族：排除 npc_generation_notes（GM 提示）
  //   - 宗教：全部保留（對玩家公開）
  //   - relations：只保留地區-派系、地區-宗教的控制關係

  const factionControlMap: Record<string, string[]> = {};
  const regionReligionMap: Record<string, string[]> = {};

  type RegionFactionRel = { region_id: string; faction_id: string; control_type: string };
  type RegionReligionRel = { region_id: string; religion_id: string; type: string };

  for (const rf of ((data.relations?.region_faction ?? []) as RegionFactionRel[])) {
    if (!factionControlMap[rf.region_id]) factionControlMap[rf.region_id] = [];
    factionControlMap[rf.region_id].push(`${rf.faction_id}（${rf.control_type}）`);
  }
  for (const rr of ((data.relations?.region_religion ?? []) as RegionReligionRel[])) {
    if (!regionReligionMap[rr.region_id]) regionReligionMap[rr.region_id] = [];
    const religionName = data.religions.find(r => r.id === rr.religion_id)?.name ?? rr.religion_id;
    regionReligionMap[rr.region_id].push(`${religionName}（${rr.type}）`);
  }

  const kbLines: string[] = [
    `# ${data.world.name} — 世界知識庫`,
    `> 此文件由 tools/splitter.ts 自動生成，上傳至 Claude Project Knowledge Base。`,
    `> **不含 GM Only 資訊**（派系秘密目標、生物生態種子等）。`,
    ``,
    `---`,
    ``,
    `## 世界概述`,
    `${data.world.summary}`,
    ``,
    `## 核心衝突`,
    `${data.world.core_conflict}`,
    ``,
    `## 核心主題（玩家反覆面對的道德困境）`,
    `${data.world.core_theme}`,
    ``,
    `## 世界基本參數`,
    `| 項目 | 值 |`,
    `|------|---|`,
    `| 氛圍 | ${data.world.tone} |`,
    `| 魔法水平 | ${data.world.magic_level} |`,
    `| 科技水平 | ${data.world.tech_level} |`,
    ``,
    `---`,
    ``,
    `## 派系`,
    ``,
  ];

  for (const f of data.factions) {
    kbLines.push(`### ${f.name}`);
    kbLines.push(`${f.summary ?? ""}`);
    kbLines.push(`- **意識形態**：${f.ideology ?? "未設定"}`);
    kbLines.push(`- **公開目標**：${f.public_goal ?? "未設定"}`);
    if (Array.isArray(f.typical_member_traits) && f.typical_member_traits.length > 0) {
      kbLines.push(`- **典型成員特質**：${(f.typical_member_traits as string[]).join("、")}`);
    }
    kbLines.push(``);
  }

  kbLines.push(`---`, ``, `## 宗教`, ``);
  for (const r of data.religions) {
    kbLines.push(`### ${r.name}（${r.deity}）`);
    kbLines.push(`${r.summary ?? ""}`);
    if (Array.isArray(r.core_tenets)) {
      kbLines.push(`**核心教義**：`);
      for (const t of r.core_tenets as string[]) kbLines.push(`- ${t}`);
    }
    if (Array.isArray(r.taboos)) {
      kbLines.push(`**禁忌**：`);
      for (const t of r.taboos as string[]) kbLines.push(`- ${t}`);
    }
    kbLines.push(``);
  }

  kbLines.push(`---`, ``, `## 地區`, ``);
  for (const r of data.regions) {
    kbLines.push(`### ${r.name}`);
    kbLines.push(`${r.description ?? ""}`);
    kbLines.push(`- **氛圍**：${r.atmosphere} | **危險等級**：${r.danger_level}`);
    if (Array.isArray(r.notable_locations) && r.notable_locations.length > 0) {
      kbLines.push(`- **重要地標**：${(r.notable_locations as string[]).join("、")}`);
    }
    const factions = factionControlMap[r.id];
    if (factions?.length) {
      kbLines.push(`- **勢力控制**：${factions.join("、")}`);
    }
    const religions = regionReligionMap[r.id];
    if (religions?.length) {
      kbLines.push(`- **宗教**：${religions.join("、")}`);
    }
    kbLines.push(``);
  }

  if (data.races && data.races.length > 0) {
    kbLines.push(`---`, ``, `## 種族`, ``);
    for (const rc of data.races) {
      kbLines.push(`### ${rc.name}`);
      if (Array.isArray(rc.appearance_traits)) {
        kbLines.push(`- **外觀特徵**：${(rc.appearance_traits as string[]).join("、")}`);
      }
      if (Array.isArray(rc.cultural_defaults)) {
        kbLines.push(`- **文化預設**：${(rc.cultural_defaults as string[]).join("、")}`);
      }
      if (Array.isArray(rc.common_prejudices_against_them)) {
        kbLines.push(`- **常見偏見**：${(rc.common_prejudices_against_them as string[]).join("、")}`);
      }
      if (rc.typical_social_class) {
        kbLines.push(`- **社會階層**：${rc.typical_social_class}`);
      }
      kbLines.push(``);
    }
  }

  // backgrounds 輸出（全部對玩家公開，anchor 作為世界脈絡呈現）
  if (data.backgrounds && data.backgrounds.length > 0) {
    kbLines.push(`---`, ``, `## 背景`, ``);
    for (const bg of data.backgrounds) {
      kbLines.push(`### ${bg.name}`);
      kbLines.push(`${bg.description}`);
      if (bg.anchor) {
        kbLines.push(`- **世界連結**：${bg.anchor.relation}（${bg.anchor.ref_id}）`);
      }
      if (Array.isArray(bg.specialty_candidates) && bg.specialty_candidates.length > 0) {
        kbLines.push(`- **特技候選**：${bg.specialty_candidates.join(" / ")}`);
      }
      if (Array.isArray(bg.starting_region_hint) && bg.starting_region_hint.length > 0) {
        kbLines.push(`- **起點傾向**：${bg.starting_region_hint.join("、")}`);
      }
      if (Array.isArray(bg.equipment_package) && bg.equipment_package.length > 0) {
        kbLines.push(`- **起始裝備**：${bg.equipment_package.map((e: EquipmentItem) => e.name).join("、")}`);
      }
      kbLines.push(`- **起始資源**：金幣 ${bg.gold}、口糧 ${bg.rations}`);
      kbLines.push(``);
    }
  }

  writeMarkdown(path.join(systemStaticDir, "world_kb.md"), kbLines.join("\n"));
  log(`✓ world_kb.md 生成完成 → /system/_static/（Claude Project KB 上傳用，已過濾 GM Only）`);

  // ── 12. 生成 player_state.yaml（角色狀態初始模板）────────
  // 放在 /system/，與 05 和 06 一起作為「每次結算後替換至 KB」的三個檔案之一
  const playerState = {
    _note: "角色當前狀態。請在建立角色後填入數值，之後由 tools/apply-delta.ts 自動更新。",
    _kb_instruction: "此檔案需上傳至 Claude Project KB，每次結算後替換新版本。",
    name: "（請填入角色名稱）",
    race: "（請填入種族）",
    background: "（請填入背景）",
    stats: {
      PHY: 0,
      AGI: 0,
      MND: 0,
      SOC: 0,
      WIL: 0,
      _note: "分配 5 點，每個屬性 -2 到 +3",
    },
    body_clock: "0/4",
    mind_clock: "0/4",
    injuries: [],
    trauma: [],
    personal_weakness: "（玩家自訂：什麼情況會觸發精神時鐘）",
    resources: {
      food_days_remaining: 3,
      medicine_units: 2,
      ammo_or_arrows: 0,
    },
    reputation: {},
    inventory: [],
    known_secrets: [],
    permanent_changes: [],
    last_updated: "初始化 / Year1_Day_1",
  };

  writeYaml(path.join(systemLiveDir, "player_state.yaml"), playerState);
  log(`✓ player_state.yaml 初始模板生成完成 → /system/_live/（建角色後請填入數值）`);

  // ── 完成 ───────────────────────────────────────────────
  console.log(`\n${"─".repeat(50)}`);
  console.log("✅ 拆分完成！各檔已寫入 system、world、npcs 等目錄，請見上方逐行路徑。");
  console.log("後續要上傳到 Claude Project KB 的檔案清單與注意事項，請看 world_setup.bat 跑完後印出的「精簡版」摘要，或 README.md。");
  console.log("若只單跑 splitter、沒有 bat：靜態 KB 用 system/_static/world_kb.md 與 system/_static/rules.yaml；每次結算後替換 system/_live/ 底下的 world_state.yaml、session_log.md、player_state.yaml。勿把 world/bestiary、npcs 等 GM 資料夾當 KB 上傳。");
}

main();
