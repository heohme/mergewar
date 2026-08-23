const art = (cardId) => `https://art.hearthstonejson.com/v1/256x/${cardId}.jpg`;

export const DATA_SNAPSHOT = {
  source: "HearthstoneJSON",
  locale: "zhCN",
  retrievedAt: "2026-08-23",
  note: "仅用于内部玩法研究，不包含于仓库，不授权公开发行。",
};

export const TRIBES = {
  MECH: { name: "机械", icon: "⚙" },
  UNDEAD: { name: "亡灵", icon: "☠" },
  BEAST: { name: "野兽", icon: "爪" },
  DRAGON: { name: "龙", icon: "龙" },
  ELEMENTAL: { name: "元素", icon: "焰" },
  NAGA: { name: "纳迦", icon: "≈" },
  NEUTRAL: { name: "中立", icon: "◇" },
};

export const HEROES = [
  {
    id: "TB_BaconShop_HERO_57",
    cardId: "TB_BaconShop_HERO_57",
    name: "诺兹多姆",
    imageUrl: art("TB_BaconShop_HERO_57"),
    tag: "洞察未来",
    description: "在你的回合开始时，获得一次免费的刷新。",
    power: "FREE_REFRESH",
  },
  {
    id: "TB_BaconShop_HERO_41",
    cardId: "TB_BaconShop_HERO_41",
    name: "雷诺·杰克逊",
    imageUrl: art("TB_BaconShop_HERO_41"),
    tag: "要发财了！",
    description: "每局对战限一次。使一个友方随从变为金色。",
    power: "GOLDEN_TOUCH",
  },
  {
    id: "TB_BaconShop_HERO_08",
    cardId: "TB_BaconShop_HERO_08",
    name: "伊利丹·怒风",
    imageUrl: art("TB_BaconShop_HERO_08"),
    tag: "左膀右臂",
    description: "战斗开始时：你最左边和最右边的随从获得+2/+1并立即发起攻击。",
    power: "EDGE_ASSAULT",
  },
];

export const MINIONS = [
  {
    id: "BG25_001", cardId: "BG25_001", name: "复活的骑兵", tribe: "UNDEAD", tier: 1, attack: 2, health: 1,
    imageUrl: art("BG25_001"), keywords: ["TAUNT", "REBORN"], text: "嘲讽，复生",
  },
  {
    id: "BG28_300", cardId: "BG28_300", name: "无害的骨颅", tribe: "UNDEAD", tier: 1, attack: 1, health: 1,
    imageUrl: art("BG28_300"), text: "亡语：召唤两个1/1的骷髅。",
    effect: { trigger: "DEATHRATTLE", action: "SUMMON_TOKEN", token: "skeleton", count: 2 },
  },
  {
    id: "BG29_611", cardId: "BG29_611", name: "拔线机", tribe: "MECH", tier: 1, attack: 1, health: 1,
    imageUrl: art("BG29_611"), keywords: ["DIVINE_SHIELD"], text: "圣盾。亡语：召唤一个1/1的微型机器人。",
    effect: { trigger: "DEATHRATTLE", action: "SUMMON_TOKEN", token: "microbot", count: 1 },
  },
  {
    id: "BGS_119", cardId: "BGS_119", name: "爆裂飓风", tribe: "ELEMENTAL", tier: 1, attack: 2, health: 1,
    imageUrl: art("BGS_119"), keywords: ["DIVINE_SHIELD", "WINDFURY"], text: "圣盾，风怒",
  },
  {
    id: "BG23_002", cardId: "BG23_002", name: "贝类收藏家", tribe: "NAGA", tier: 2, attack: 4, health: 3,
    imageUrl: art("BG23_002"), text: "战吼：获取一张酒馆币。",
    effect: { trigger: "BATTLECRY", action: "GAIN_GOLD", amount: 1 },
  },
  {
    id: "BG25_022", cardId: "BG25_022", name: "血色骷髅", tribe: "UNDEAD", tier: 2, attack: 2, health: 1,
    imageUrl: art("BG25_022"), keywords: ["REBORN"], text: "复生。亡语：使一个友方亡灵获得+1/+2。",
    effect: { trigger: "DEATHRATTLE", action: "BUFF_RANDOM_OTHER_TRIBE", tribe: "UNDEAD", attack: 1, health: 2 },
  },
  {
    id: "BG26_805", cardId: "BG26_805", name: "哼鸣蜂鸟", tribe: "BEAST", tier: 2, attack: 1, health: 4,
    imageUrl: art("BG26_805"), text: "战斗开始时：在本场战斗的剩余时间内，你的野兽拥有+1攻击力。",
    effect: { trigger: "COMBAT_START", action: "BUFF_ALL_TRIBE", tribe: "BEAST", attack: 1, health: 0 },
  },
  {
    id: "BG26_963", cardId: "BG26_963", name: "电音合成师", tribe: "DRAGON", tier: 2, attack: 3, health: 4,
    imageUrl: art("BG26_963"), text: "战吼，战斗开始时：使你的其他龙获得+1/+1。",
    effects: [
      { trigger: "BATTLECRY", action: "BUFF_ALL_OTHER_TRIBE", tribe: "DRAGON", attack: 1, health: 1 },
      { trigger: "COMBAT_START", action: "BUFF_ALL_OTHER_TRIBE", tribe: "DRAGON", attack: 1, health: 1 },
    ],
  },
  {
    id: "BG25_010", cardId: "BG25_010", name: "断手被遗忘者", tribe: "UNDEAD", tier: 3, attack: 2, health: 1,
    imageUrl: art("BG25_010"), text: "亡语：召唤一只2/1并具有复生的手。",
    effect: { trigger: "DEATHRATTLE", action: "SUMMON_TOKEN", token: "forgotten_hand", count: 1 },
  },
  {
    id: "BG30_125", cardId: "BG30_125", name: "遗骸看管者", tribe: "UNDEAD", tier: 3, attack: 3, health: 3,
    imageUrl: art("BG30_125"), text: "亡语：召唤三个1/1的骷髅。",
    effect: { trigger: "DEATHRATTLE", action: "SUMMON_TOKEN", token: "skeleton", count: 3 },
  },
  {
    id: "BGS_131", cardId: "BGS_131", name: "致命的孢子", tribe: "NEUTRAL", tier: 3, attack: 1, health: 1,
    imageUrl: art("BGS_131"), keywords: ["VENOMOUS"], text: "烈毒",
  },
  {
    id: "BG36_207", cardId: "BG36_207", name: "狼宝宝", tribe: "BEAST", tier: 3, attack: 3, health: 6,
    imageUrl: art("BG36_207"), text: "进击：使你的其他随从获得+4/+1。",
    effect: { trigger: "AFTER_ATTACK", action: "BUFF_ALL_OTHER", attack: 4, health: 1 },
  },
  {
    id: "BG25_016", cardId: "BG25_016", name: "辛多雷直射手", tribe: "NEUTRAL", tier: 4, attack: 3, health: 4,
    imageUrl: art("BG25_016"), keywords: ["WINDFURY", "DIVINE_SHIELD"], text: "风怒，圣盾。进击：移除目标的复生和嘲讽。",
    effect: { trigger: "BEFORE_ATTACK", action: "REMOVE_TARGET_KEYWORDS", keywords: ["REBORN", "TAUNT"] },
  },
  {
    id: "BG27_080", cardId: "BG27_080", name: "混编战团", tribe: "NEUTRAL", tier: 4, attack: 3, health: 3,
    imageUrl: art("BG27_080"), keywords: ["TAUNT"], text: "嘲讽。亡语：使每个类型的各一个友方随从获得+3/+3。",
    effect: { trigger: "DEATHRATTLE", action: "BUFF_ONE_EACH_TRIBE", attack: 3, health: 3 },
  },
  {
    id: "BG36_620", cardId: "BG36_620", name: "砰砰箱", tribe: "NEUTRAL", tier: 4, attack: 5, health: 10,
    imageUrl: art("BG36_620"), keywords: ["TAUNT"], text: "嘲讽。战斗开始时：对所有其他随从造成3点伤害。",
    effect: { trigger: "COMBAT_START", action: "DAMAGE_ALL_OTHER", damage: 3 },
  },
  {
    id: "BGS_116", cardId: "BGS_116", name: "刷新畸体", tribe: "ELEMENTAL", tier: 4, attack: 4, health: 5,
    imageUrl: art("BGS_116"), text: "战吼：获得2次免费的刷新。",
    effect: { trigger: "BATTLECRY", action: "GAIN_FREE_REFRESHES", amount: 2 },
  },
  {
    id: "BG25_354", cardId: "BG25_354", name: "提图斯·瑞文戴尔", tribe: "NEUTRAL", tier: 5, attack: 1, health: 7,
    imageUrl: art("BG25_354"), text: "你的亡语额外触发一次。", aura: "DOUBLE_DEATHRATTLES",
  },
  {
    id: "BG26_ICC_901", cardId: "BG26_ICC_901", name: "达卡莱附魔师", tribe: "NEUTRAL", tier: 5, attack: 1, health: 5,
    imageUrl: art("BG26_ICC_901"), text: "你的回合结束效果会触发两次。", aura: "DOUBLE_END_TURN",
  },
  {
    id: "BG_LOE_077", cardId: "BG_LOE_077", name: "布莱恩·铜须", tribe: "NEUTRAL", tier: 5, attack: 2, health: 4,
    imageUrl: art("BG_LOE_077"), text: "你的战吼会触发两次。", aura: "DOUBLE_BATTLECRIES",
  },
  {
    id: "BGS_041", cardId: "BGS_041", name: "奥术守护者卡雷苟斯", tribe: "DRAGON", tier: 5, attack: 4, health: 12,
    imageUrl: art("BGS_041"), text: "在你触发一个战吼后，使你的龙获得+2/+2。", aura: "KALECGOS",
  },
  {
    id: "BG25_009", cardId: "BG25_009", name: "永恒召唤者", tribe: "UNDEAD", tier: 6, attack: 8, health: 1,
    imageUrl: art("BG25_009"), keywords: ["REBORN"], text: "复生。亡语：召唤1个永恒骑士。",
    effect: { trigger: "DEATHRATTLE", action: "SUMMON_TOKEN", token: "eternal_knight", count: 1 },
  },
  {
    id: "BG24_004", cardId: "BG24_004", name: "折跃之翼", tribe: "DRAGON", tier: 6, attack: 12, health: 4,
    imageUrl: art("BG24_004"), keywords: ["ATTACK_IMMUNE"], text: "攻击时免疫。",
  },
  {
    id: "BG32_846", cardId: "BG32_846", name: "狂放的法力涌流", tribe: "ELEMENTAL", tier: 6, attack: 6, health: 5,
    imageUrl: art("BG32_846"), text: "在你使用一张元素牌后，使你的元素获得+4/+4。", aura: "ELEMENTAL_PLAY_BUFF",
  },
  {
    id: "BGS_018", cardId: "BGS_018", name: "巨狼戈德林", tribe: "BEAST", tier: 6, attack: 8, health: 8,
    imageUrl: art("BGS_018"), text: "亡语：直到下个回合，你的野兽拥有+8/+8。",
    effect: { trigger: "DEATHRATTLE", action: "BUFF_ALL_TRIBE", tribe: "BEAST", attack: 8, health: 8 },
  },
];

export const TOKENS = {
  skeleton: { id: "BG25_006t", cardId: "BG25_006t", name: "骷髅", tribe: "UNDEAD", tier: 1, attack: 1, health: 1, imageUrl: art("BG25_006t"), token: true },
  microbot: { id: "BOT_312t", cardId: "BOT_312t", name: "微型机器人", tribe: "MECH", tier: 1, attack: 1, health: 1, imageUrl: art("BOT_312t"), token: true },
  forgotten_hand: { id: "BG25_010t", cardId: "BG25_010t", name: "被遗忘者之手", tribe: "UNDEAD", tier: 1, attack: 2, health: 1, imageUrl: art("BG25_010t"), keywords: ["REBORN"], token: true },
  eternal_knight: { id: "BG25_008", cardId: "BG25_008", name: "永恒骑士", tribe: "UNDEAD", tier: 2, attack: 4, health: 2, imageUrl: art("BG25_008"), token: true },
};

export const BOT_PROFILES = [
  { id: "mukla", name: "穆克拉", hero: "香蕉明猩", archetype: "BEAST", accent: "#ff9f66" },
  { id: "millhouse", name: "米尔豪斯·法力风暴", hero: "法力风暴", archetype: "ELEMENTAL", accent: "#73d7ff" },
  { id: "lichking", name: "巫妖王", hero: "复生仪式", archetype: "UNDEAD", accent: "#a8dadc" },
  { id: "ysera", name: "伊瑟拉", hero: "梦境之门", archetype: "DRAGON", accent: "#8ddb73" },
  { id: "daryl", name: "舞者达瑞尔", hero: "帽子戏法", archetype: "MIXED", accent: "#c3a6ff" },
  { id: "patches", name: "海盗帕奇斯", hero: "海盗聚会！", archetype: "MIXED", accent: "#ef7b7b" },
  { id: "toki", name: "永恒者托奇", hero: "时空酒馆", archetype: "MIXED", accent: "#ffd166" },
];

export const UPGRADE_BASE_COST = { 1: 5, 2: 7, 3: 8, 4: 9, 5: 10 };
export const MAX_ROUNDS = 10;
export const MAX_BOARD = 7;
export const MAX_HAND = 10;
