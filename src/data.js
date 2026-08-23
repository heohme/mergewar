const art = (id) => `https://art.hearthstonejson.com/v1/256x/${id}.jpg`;
const m = (id, name, tribe, tier, attack, health, text, extra = {}) => ({ id, cardId: id, name, tribe, tribes: extra.tribes || [tribe], tier, attack, health, text, imageUrl: art(id), ...extra });
const s = (id, name, tier, text, script, extra = {}) => ({ id, cardId: id, kind: "SPELL", name, tier, text, script, imageUrl: art(id), ...extra });

export const DATA_SNAPSHOT = {
  source: "HearthstoneJSON latest/zhCN/cards.json",
  retrievedAt: "2026-08-23",
  pool: "单人酒馆战棋：亡灵21张、龙22张",
  note: "私有玩法研究快照，不随线上版本自动漂移。",
};

export const TRIBES = {
  UNDEAD: { name: "亡灵", icon: "☠" },
  DRAGON: { name: "龙", icon: "龙" },
  NEUTRAL: { name: "中立", icon: "◇" },
};

export const HEROES = [
  { id: "TB_BaconShop_HERO_57", cardId: "TB_BaconShop_HERO_57", name: "诺兹多姆", imageUrl: art("TB_BaconShop_HERO_57"), tag: "洞察未来", description: "在你的回合开始时，获得一次免费的刷新。", power: "FREE_REFRESH" },
  { id: "TB_BaconShop_HERO_41", cardId: "TB_BaconShop_HERO_41", name: "雷诺·杰克逊", imageUrl: art("TB_BaconShop_HERO_41"), tag: "要发财了！", description: "每局对战限一次。使一个友方随从变为金色。", power: "GOLDEN_TOUCH" },
  { id: "TB_BaconShop_HERO_08", cardId: "TB_BaconShop_HERO_08", name: "伊利丹·怒风", imageUrl: art("TB_BaconShop_HERO_08"), tag: "左膀右臂", description: "战斗开始时：你最左边和最右边的随从获得+2/+1并立即攻击。", power: "EDGE_ASSAULT" },
];

export const UNDEAD = [
  m("BG25_001", "复活的骑兵", "UNDEAD", 1, 2, 1, "嘲讽，复生", { keywords: ["TAUNT", "REBORN"] }),
  m("BG25_013", "腐皮豺狼人", "UNDEAD", 1, 1, 4, "在本场战斗中，每有一个友方随从死亡，便拥有+1攻击力。", { scripts: ["ROTTING_GNOLL"] }),
  m("BG28_300", "无害的骨颅", "UNDEAD", 1, 1, 1, "亡语：召唤两个1/1的骷髅。", { deathrattle: { summon: "skeleton", count: 2 } }),
  m("BG25_008", "永恒骑士", "UNDEAD", 2, 4, 2, "在本局对战中，每有一个友方永恒骑士死亡，便拥有+4/+2（无论本随从在哪）。", { scripts: ["ETERNAL_KNIGHT"] }),
  m("BG25_011", "死亡群居蛛魔", "UNDEAD", 2, 1, 4, "战吼：在本局对战中，你的亡灵拥有+1攻击力（无论它们在哪）。", { battlecry: "NERUBIAN_DEATHSWARM" }),
  m("BG25_022", "血色骷髅", "UNDEAD", 2, 2, 1, "复生。亡语：使一个友方亡灵获得+1/+2。", { keywords: ["REBORN"], deathrattle: { buffRandomTribe: "UNDEAD", attack: 1, health: 2 } }),
  m("BG25_010", "断手被遗忘者", "UNDEAD", 3, 2, 1, "亡语：召唤一只2/1并具有复生的手。", { deathrattle: { summon: "forgotten_hand", count: 1 } }),
  m("BG28_309", "木乃伊工匠", "UNDEAD", 3, 5, 2, "亡语：使一个不同的友方亡灵获得复生。", { deathrattle: { grantRebornRandom: true } }),
  m("BG30_125", "遗骸看管者", "UNDEAD", 3, 3, 3, "亡语：召唤三个1/1的骷髅。", { deathrattle: { summon: "skeleton", count: 3 } }),
  m("BG33_323", "尘骨毁灭者", "UNDEAD", 3, 2, 6, "进击：在本局对战中，你的亡灵拥有+1攻击力（无论它们在哪）。", { rally: "UNDEAD_ATTACK" }),
  m("BG_DEEP_015", "义肢假手", "UNDEAD", 3, 3, 1, "磁力。复生。可以磁力吸附在机械或亡灵上。", { keywords: ["MAGNETIC", "REBORN"], scripts: ["MAGNETIC"] }),
  m("BG32_340", "噬渊施法者", "UNDEAD", 4, 4, 5, "战吼：消灭一个友方亡灵以发现一张亡灵牌。", { battlecry: "MAWCASTER", targeted: "OTHER_UNDEAD" }),
  m("BG32_880", "友善的恶鬼", "UNDEAD", 4, 6, 3, "亡语：在本局对战中，你的酒馆法术使随从额外获得+1攻击力。", { deathrattle: { modifier: "spellAttack", amount: 1 } }),
  m("BG34_690", "疫病行尸", "UNDEAD", 4, 4, 2, "亡语：在本局对战中，你的亡灵拥有+2攻击力。（如果在战斗之外触发，改为+4！）", { deathrattle: { modifier: "undeadAttack", amount: 2, recruitAmount: 4 } }),
  m("BG36_511", "丧钟死灵", "UNDEAD", 4, 3, 6, "发动（1）：使一个不同的友方亡灵获得复生，然后消灭该亡灵以获得+4/+4。", { activate: "BELL_NECRO", activateCost: 1, targeted: "OTHER_UNDEAD" }),
  m("BG32_324", "德鲁斯特堕落屠夫", "UNDEAD", 5, 2, 9, "复仇（4）：获取一张宰割。", { avenge: { count: 4, rewardSpell: "BG28_604" } }),
  m("BG36_514", "障蔽女妖", "UNDEAD", 5, 7, 7, "在一个友方随从复生后，获得圣盾和+7/+7。", { scripts: ["BANSHEE_REBORN"] }),
  m("BG25_009", "永恒召唤者", "UNDEAD", 6, 8, 1, "复生。亡语：召唤1个永恒骑士。", { keywords: ["REBORN"], deathrattle: { summon: "eternal_knight", count: 1 } }),
  m("BG31_835", "致命打击者", "UNDEAD", 6, 8, 8, "复仇（4）：随机获取一张亡灵牌。亡语：从你的手牌中召唤它，其登场仅限本场战斗。", { avenge: { count: 4, storeRandomTribe: "UNDEAD" }, deathrattle: { summonStored: true } }),
  m("BG34_692", "被遗忘者纺织工", "UNDEAD", 6, 3, 10, "在你施放一个酒馆法术后，你的亡灵在本局对战中拥有+2攻击力（无论它们在哪）。", { scripts: ["UNDEAD_SPELL_SCALER"] }),
  m("BG36_515", "时尚魅影", "UNDEAD", 6, 6, 8, "在一个友方随从复生后，使你最右边的亡灵获得等同于复生随从攻击力的属性值。", { scripts: ["FASHION_PHANTOM"] }),
];

export const DRAGONS = [
  m("BG29_888", "微光护卫者", "DRAGON", 1, 1, 4, "进击：获得+2攻击力。", { rally: "SELF_ATTACK_2" }),
  m("BG35_814", "血色幸存飞龙", "DRAGON", 1, 3, 3, "一旦本随从的攻击力达到6点，获得圣盾。", { scripts: ["SCARLET_SURVIVOR"] }),
  m("BG21_015", "泰蕾苟萨", "DRAGON", 2, 4, 4, "本随从可永久保留战斗阶段获得的额外关键词和属性值。", { scripts: ["TARECGOSA"] }),
  m("BG29_810", "千纸幼龙", "DRAGON", 2, 2, 3, "战斗开始时：使你最左边的龙获得+1/+2和风怒。", { combatStart: "PAPER_DRAKE" }),
  m("BG26_963", "电音合成师", "DRAGON", 2, 3, 4, "战吼，战斗开始时：使你的其他龙获得+1/+1。", { battlecry: "SYNTHESIZER", combatStart: "SYNTHESIZER" }),
  m("BG27_005", "时空船长钩尾", "DRAGON", 3, 1, 4, "每当你施放一个酒馆法术，使你的随从获得+1攻击力。", { tribes: ["DRAGON"], scripts: ["HOOKTAIL"] }),
  m("BG29_816", "咆哮募兵龙", "DRAGON", 3, 2, 8, "每当另一条友方的龙攻击时，使其获得+3/+1。", { scripts: ["ROARING_RECRUITER"] }),
  m("BG24_500", "琥珀卫士", "DRAGON", 3, 3, 2, "嘲讽。战斗开始时：使另一条友方的龙获得+2/+2和圣盾。", { keywords: ["TAUNT"], combatStart: "AMBER_GUARDIAN" }),
  m("BG33_924", "蓝色雏龙", "DRAGON", 3, 1, 5, "进击：在本局对战中，你的酒馆法术使随从额外获得+1生命值。", { rally: "SPELL_HEALTH" }),
  m("BG36_240", "受雇坐骑", "DRAGON", 3, 3, 5, "发动（2）：随机获取一张多彩幼龙。", { activate: "GET_CHROMATIC", activateCost: 2 }),
  m("BG36_242", "青铜时光行者", "DRAGON", 4, 2, 9, "进击：随机获取一张多彩幼龙。", { rally: "GET_CHROMATIC" }),
  m("BG36_243", "天诞逃生飞龙", "DRAGON", 4, 4, 7, "发动（1）：触发一个友方随从的进击效果。", { activate: "TRIGGER_RALLY", activateCost: 1, targeted: "RALLY" }),
  m("BG29_813", "执念诗心龙", "DRAGON", 4, 2, 3, "圣盾。相邻的龙可永久保留战斗阶段获得的额外关键词和属性值。", { keywords: ["DIVINE_SHIELD"], scripts: ["POET"] }),
  m("BG36_245", "符文奥术师", "DRAGON", 4, 2, 4, "战斗开始时：施放闪亮的戒指，触发两次。", { combatStart: "RING_TWICE" }),
  m("BGS_041", "奥术守护者卡雷苟斯", "DRAGON", 5, 4, 12, "在你触发一个战吼后，使你的龙获得+2/+2。", { scripts: ["KALECGOS"] }),
  m("BG32_820", "火鳞囤积者", "DRAGON", 5, 5, 5, "战吼，亡语：获取一张闪亮的戒指。", { tribes: ["DRAGON"], battlecry: "GET_RING", deathrattle: { rewardSpell: "BG28_168" } }),
  m("BG32_821", "邪火咒龙", "DRAGON", 5, 6, 5, "在你的回合结束时，你的酒馆法术在本局对战中使随从额外获得+1/+1。", { tribes: ["DRAGON"], endTurn: "SPELL_BONUS" }),
  m("BG34_633", "龙族看护员", "DRAGON", 5, 7, 4, "战吼，亡语：随机获取一张多彩幼龙。", { battlecry: "GET_CHROMATIC", deathrattle: { rewardChromatic: true } }),
  m("BG24_004", "折跃之翼", "DRAGON", 6, 12, 4, "攻击时免疫。", { keywords: ["ATTACK_IMMUNE"] }),
  m("BG32_822", "火铸唤魔师", "DRAGON", 6, 8, 5, "战斗开始时：使你的龙获得+2/+1。在你施放一个酒馆法术后永久提升此效果。", { combatStart: "FIRE_FORGED", scripts: ["FIRE_FORGED_SCALE"] }),
  m("BG28_595", "生火专家", "DRAGON", 6, 8, 8, "在你的回合结束时，随机获取2张酒馆法术牌。", { endTurn: "GET_TWO_SPELLS" }),
  m("BG36_241", "赤红守备巨龙", "DRAGON", 6, 8, 9, "圣盾。进击：施放威猛龙息。", { keywords: ["DIVINE_SHIELD"], rally: "MIGHTY_BREATH" }),
];

export const NEUTRALS = [
  m("BG25_354", "提图斯·瑞文戴尔", "NEUTRAL", 5, 1, 7, "你的亡语额外触发一次。", { scripts: ["DOUBLE_DEATHRATTLES"] }),
  m("BG26_ICC_901", "达卡莱附魔师", "NEUTRAL", 5, 1, 5, "你的回合结束效果会触发两次。", { scripts: ["DOUBLE_END_TURN"] }),
  m("BG_LOE_077", "布莱恩·铜须", "NEUTRAL", 5, 2, 4, "你的战吼会触发两次。", { scripts: ["DOUBLE_BATTLECRIES"] }),
];

export const MINIONS = [...UNDEAD, ...DRAGONS, ...NEUTRALS];

export const TOKENS = {
  skeleton: m("BG_ICC_026t", "骷髅", "UNDEAD", 1, 1, 1, "", { token: true }),
  forgotten_hand: m("BG25_010t", "援手", "UNDEAD", 1, 2, 1, "复生", { token: true, keywords: ["REBORN"] }),
  eternal_knight: m("BG25_008", "永恒骑士", "UNDEAD", 2, 4, 2, "", { token: true, scripts: ["ETERNAL_KNIGHT"] }),
};

export const CHROMATICS = [
  m("BG34_634t", "蓝色多彩幼龙", "DRAGON", 3, 4, 4, "战吼：随机获取一张消耗2枚铸币的酒馆法术牌。", { token: true, battlecry: "GET_RANDOM_SPELL" }),
  m("BG34_635t", "黑色多彩幼龙", "DRAGON", 3, 4, 6, "战吼：在本局对战中，你的酒馆法术使随从额外获得+1生命值。", { token: true, battlecry: "SPELL_HEALTH" }),
  m("BG34_636t", "绿色多彩幼龙", "DRAGON", 3, 3, 5, "战吼：使你的其他龙获得+1/+3。", { token: true, battlecry: "GREEN_CHROMATIC" }),
  m("BG34_637t", "青铜多彩幼龙", "DRAGON", 3, 5, 3, "战吼：使你的其他龙获得+3/+1。", { token: true, battlecry: "BRONZE_CHROMATIC" }),
  m("BG34_638t", "红色多彩幼龙", "DRAGON", 3, 6, 4, "战吼：在本局对战中，你的酒馆法术使随从额外获得+1攻击力。", { token: true, battlecry: "SPELL_ATTACK" }),
];

export const SPELLS = [
  s("BG28_168", "闪亮的戒指", 3, "使你的随从获得+1/+1。", "RING"),
  s("BG28_604", "宰割", 5, "消灭一个友方亡灵。在本局对战中，你的亡灵拥有+5攻击力。", "SLAUGHTER", { targeted: "UNDEAD" }),
  s("BG28_503", "强固", 1, "使一个随从获得+3生命值和嘲讽。", "FORTIFY", { targeted: "ANY_MINION" }),
  s("BG28_810", "酒馆币", 1, "获得1枚铸币。", "COIN"),
  s("BG28_897", "香蕉果盘", 1, "使一个随从获得+2/+2。", "BANANA", { targeted: "ANY_MINION" }),
  s("BG28_827", "快速浏览", 2, "获得2次免费的刷新。", "FREE_REFRESH"),
  s("BG36_246", "威猛龙息", 4, "使你的随从获得+2/+1。对你的龙重复一次。对具有圣盾的随从重复一次。", "MIGHTY_BREATH"),
];

export const BOT_PROFILES = [
  { id: "lichking", name: "巫妖王", hero: "复生仪式", archetype: "UNDEAD", accent: "#9bd6e5" },
  { id: "ysera", name: "伊瑟拉", hero: "梦境之门", archetype: "DRAGON", accent: "#8ddb73" },
  { id: "sindragosa", name: "辛达苟萨", hero: "冰冷静滞", archetype: "DRAGON", accent: "#73d7ff" },
  { id: "denathrius", name: "德纳修斯大帝", hero: "华丽盛宴", archetype: "UNDEAD", accent: "#ef7b7b" },
  { id: "toki", name: "永恒者托奇", hero: "时空酒馆", archetype: "MIXED", accent: "#ffd166" },
  { id: "reno", name: "雷诺·杰克逊", hero: "要发财了！", archetype: "MIXED", accent: "#c3a6ff" },
  { id: "illidan", name: "伊利丹·怒风", hero: "左膀右臂", archetype: "MIXED", accent: "#ff9f66" },
];

export const UPGRADE_BASE_COST = { 1: 5, 2: 7, 3: 8, 4: 9, 5: 10 };
export const MAX_ROUNDS = 10;
export const MAX_BOARD = 7;
export const MAX_HAND = 10;
