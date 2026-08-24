import {
  BEASTS, BOT_PROFILES, CHROMATICS, DRAGONS, ELEMENTALS, HEROES, MAX_BOARD, MAX_HAND, MAX_ROUNDS,
  MECHS, MINIONS, QUILBOAR, SPELLS, TOKENS, UNDEAD, UPGRADE_BASE_COST,
} from "./data.js";

const clone = (value) => value == null ? value : structuredClone(value);
const randomItem = (items, rng = Math.random) => items.length ? items[Math.floor(rng() * items.length)] : null;
const shuffle = (items, rng = Math.random) => [...items].sort(() => rng() - 0.5);
const hasTribe = (minion, tribe) => minion?.tribe === tribe || minion?.tribes?.includes(tribe);
const SCRIPT_ALIASES = {
  DOUBLE_BATTLECRIES: "BG_LOE_077",
  DOUBLE_DEATHRATTLES: "BG25_354",
  DOUBLE_END_TURN: "BG26_ICC_901",
};
const hasScript = (minion, script) => minion?.scripts?.includes(script) || minion?.baseId === SCRIPT_ALIASES[script];
let instanceSeed = 1;

function baseModifiers() {
  return {
    undeadAttack: 0, eternalDeaths: 0, spellAttack: 0, spellHealth: 0, fireForged: 0,
    shopAttack: 0, shopHealth: 0, shopTribeBuffs: {}, elementalAttack: 0, elementalHealth: 0,
    bloodGemAttack: 0, bloodGemHealth: 0, beetleAttack: 0, beetleHealth: 0,
    automatonSummons: 0, mechDeathrattles: 0, firePitcher: 0, icePitcher: 0, airPitcher: 0,
    lobsterBuff: 0, beastSummonAttack: 0, refreshBuffs: [], refreshBloodGems: 0,
    elementalPlays: 0, spellsCast: 0, airSpent: 0, chooseBothUsed: false,
  };
}

function ensureModifiers(owner) {
  owner.modifiers = { ...baseModifiers(), ...(owner.modifiers || {}) };
  owner.modifiers.shopTribeBuffs ||= {};
  owner.modifiers.refreshBuffs ||= [];
  return owner.modifiers;
}

export function createMinion(definition, golden = false, modifiers = baseModifiers()) {
  const multiplier = golden ? 2 : 1;
  const minion = {
    ...clone(definition), kind: "MINION", instanceId: `${definition.id}-${instanceSeed++}`,
    baseId: definition.id, golden, attack: definition.attack * multiplier,
    health: definition.health * multiplier, maxHealth: definition.health * multiplier,
    keywords: [...(definition.keywords || [])], magneticCount: 0, bloodGems: 0, turnsHeld: 1,
  };
  if (hasTribe(minion, "UNDEAD")) minion.attack += modifiers.undeadAttack || 0;
  if (hasTribe(minion, "ELEMENTAL")) {
    minion.attack += modifiers.elementalAttack || 0;
    minion.health += modifiers.elementalHealth || 0;
    minion.maxHealth += modifiers.elementalHealth || 0;
  }
  if (hasScript(minion, "BEETLE")) {
    minion.attack += modifiers.beetleAttack || 0;
    minion.health += modifiers.beetleHealth || 0;
    minion.maxHealth += modifiers.beetleHealth || 0;
  }
  if (minion.baseId === "BG_TTN_401") {
    minion.attack += (modifiers.automatonSummons || 0) * 3;
    minion.health += (modifiers.automatonSummons || 0) * 2;
    minion.maxHealth += (modifiers.automatonSummons || 0) * 2;
  }
  if (minion.baseId === "BG35_342") {
    minion.attack += (modifiers.mechDeathrattles || 0) * 4;
    minion.health += (modifiers.mechDeathrattles || 0) * 2;
    minion.maxHealth += (modifiers.mechDeathrattles || 0) * 2;
  }
  if (hasScript(minion, "ETERNAL_KNIGHT")) {
    minion.attack += (modifiers.eternalDeaths || 0) * 4;
    minion.health += (modifiers.eternalDeaths || 0) * 2;
    minion.maxHealth += (modifiers.eternalDeaths || 0) * 2;
  }
  checkThresholds(minion);
  minion.rebornAttack = minion.attack;
  minion.rebornKeywords = [...minion.keywords];
  return minion;
}

export function createSpell(definition) {
  return { ...clone(definition), kind: "SPELL", instanceId: `${definition.id}-${instanceSeed++}`, baseId: definition.id };
}

function addCardToHand(game, definition, golden = false) {
  if (!definition || game.player.hand.length >= MAX_HAND) return false;
  const card = definition.kind === "SPELL" ? createSpell(definition) : createMinion(definition, golden, game.player.modifiers);
  game.player.hand.push(card);
  if (card.kind === "MINION" && !card.golden) checkTriples(game, card.baseId);
  return true;
}

export function createGame(heroId, rng = Math.random) {
  const hero = HEROES.find((item) => item.id === heroId) || HEROES[0];
  const bots = BOT_PROFILES.map((profile) => ({
    ...clone(profile), health: 30, armor: 0, alive: true, tier: 1, board: [], hand: [], shop: [], gold: 3, goldCap: 10,
    wins: 0, losses: 0,
    upgradeCost: UPGRADE_BASE_COST[1], modifiers: baseModifiers(),
    nextTurnGold: 0, scheduledBoardBuffs: [], pendingBattleBuffs: [], combatSpells: {},
    economy: { buys: 0, sales: 0, refreshes: 0, upgrades: 0, triples: 0 }, upgradeScaling: 0, decisions: [],
  }));
  const game = {
    version: 3, phase: "SHOP", round: 1, maxRounds: MAX_ROUNDS, hero,
    player: {
      id: "player", name: "你", hero: hero.name, health: 30, alive: true, tier: 1, gold: 3,
      armor: 0, goldCap: 10,
      board: [], hand: [], shop: [], frozen: false, freeRefresh: hero.power === "FREE_REFRESH",
      freeRefreshes: 0, heroPowerUsed: false, upgradeCost: UPGRADE_BASE_COST[1], modifiers: baseModifiers(),
      nextTurnGold: 0, scheduledBoardBuffs: [], pendingBattleBuffs: [], combatSpells: {},
    },
    bots, currentOpponent: null, pendingDiscover: null, pendingAction: null, battle: null,
    messages: ["手牌随从可拖到战队上场；场上随从可拖回酒馆出售。"],
    stats: { refreshes: 0, triples: 0, wins: 0, losses: 0, spells: 0 },
  };
  bots.forEach((bot) => recruitBot(bot, 1, rng));
  fillShop(game, true, rng);
  chooseOpponent(game, rng);
  return game;
}

export function reconcileCardDefinitions(game) {
  let changed = false;
  for (const owner of [game?.player, ...(game?.bots || [])]) {
    if (!owner) continue;
    for (const zoneName of ["hand", "shop"]) {
      for (const card of owner[zoneName] || []) {
        if (card.baseId !== "BG36_200") continue;
        if (card.battlecry) { delete card.battlecry; changed = true; }
        if (card.battlecryResolved) { delete card.battlecryResolved; changed = true; }
        if (card.rally !== "BG36_200") { card.rally = "BG36_200"; changed = true; }
        if (card.text !== "进击：召唤一只1/1的野兽。") { card.text = "进击：召唤一只1/1的野兽。"; changed = true; }
      }
    }
    for (let index = 0; index < (owner.board || []).length; index += 1) {
      const card = owner.board[index];
      if (card.baseId !== "BG36_200") continue;
      const migratedBattlecry = card.battlecry === "SUMMON_SMALL_BEAST" || card.battlecryResolved;
      if (migratedBattlecry && owner.board[index + 1]?.baseId === "BG36_200t") {
        owner.board.splice(index + 1, 1);
        changed = true;
      }
      if (card.battlecry) { delete card.battlecry; changed = true; }
      if (card.battlecryResolved) { delete card.battlecryResolved; changed = true; }
      if (card.rally !== "BG36_200") { card.rally = "BG36_200"; changed = true; }
      if (card.text !== "进击：召唤一只1/1的野兽。") { card.text = "进击：召唤一只1/1的野兽。"; changed = true; }
    }
  }
  return changed;
}

export function reconcileBotUpgradeScaling(game) {
  let changed = false;
  for (const bot of game?.bots || []) {
    const expectedScaling = bot.economy?.upgrades ?? Math.max(0, (bot.tier || 1) - 1);
    const missingScaling = Math.max(0, expectedScaling - (bot.upgradeScaling || 0));
    if (!missingScaling) continue;
    bot.upgradeScaling = expectedScaling;
    const amount = missingScaling * 2;
    bot.modifiers.shopAttack += amount;
    bot.modifiers.shopHealth += amount;
    bot.board.forEach((minion) => buff(minion, amount, amount));
    changed = true;
  }
  return changed;
}

export function shopSize(tier) { return [0, 3, 4, 4, 5, 5, 6][tier] || 6; }
const availableMinions = (tier) => MINIONS.filter((minion) => minion.tier <= tier && !minion.token);
const availableSpells = (tier) => SPELLS.filter((spell) => spell.pool && spell.tier <= tier);

function createShopMinion(owner, definition) {
  const minion = createMinion(definition, false, owner.modifiers);
  const tribeBonus = (minion.tribes || [minion.tribe]).reduce((total, tribe) => total + (owner.modifiers.shopTribeBuffs?.[tribe] || 0), 0);
  buff(minion, (owner.modifiers.shopAttack || 0) + tribeBonus, (owner.modifiers.shopHealth || 0) + tribeBonus);
  return minion;
}

function buildShop(owner, rng, mode = "NORMAL") {
  ensureModifiers(owner);
  const minionCount = shopSize(owner.tier);
  if (mode === "SPELLS") return Array.from({ length: Math.min(7, minionCount + 1) }, () => createSpell(randomItem(availableSpells(owner.tier), rng)));
  if (mode.startsWith("TRIBE:")) {
    const tribe = mode.slice(6);
    const pool = availableMinions(owner.tier).filter((item) => hasTribe(item, tribe));
    return Array.from({ length: Math.min(7, minionCount + 1) }, () => createShopMinion(owner, randomItem(pool.length ? pool : availableMinions(owner.tier), rng)));
  }
  const minions = Array.from({ length: minionCount }, () => createShopMinion(owner, randomItem(availableMinions(owner.tier), rng)));
  owner.modifiers.refreshBuffs.forEach((entry) => {
    const target = randomItem(minions, rng);
    if (target) buff(target, entry.attack || 0, entry.health || 0);
  });
  for (let index = 0; index < owner.modifiers.refreshBloodGems; index += 1) {
    const target = randomItem(minions, rng);
    if (target) applyBloodGem(owner, target);
  }
  return [...minions, createSpell(randomItem(availableSpells(owner.tier), rng))];
}

function spendGold(owner, amount) {
  owner.gold -= amount;
  const modifiers = ensureModifiers(owner);
  modifiers.airSpent += amount;
  while (modifiers.airSpent >= 7) {
    modifiers.airSpent -= 7;
    modifiers.refreshBuffs.push({ attack: 8, health: 8 });
  }
}

export function fillShop(game, forceNew = false, rng = Math.random, mode = "NORMAL") {
  const player = game.player;
  if (forceNew || !player.frozen) player.shop = [];
  if (!player.shop.length) player.shop = buildShop(player, rng, mode);
  player.frozen = false;
}

export function refreshShop(game, rng = Math.random) {
  if (game.phase !== "SHOP" || game.pendingAction) return false;
  const free = game.player.freeRefresh || game.player.freeRefreshes > 0;
  if (!free && game.player.gold < 1) return false;
  if (game.player.freeRefresh) game.player.freeRefresh = false;
  else if (game.player.freeRefreshes > 0) game.player.freeRefreshes -= 1;
  else spendGold(game.player, 1);
  game.player.shop = [];
  fillShop(game, true, rng);
  game.stats.refreshes += 1;
  message(game, free ? "免费刷新了酒馆。" : "刷新了酒馆。");
  return true;
}

export function toggleFreeze(game) {
  if (game.phase === "SHOP" && !game.pendingAction) game.player.frozen = !game.player.frozen;
}

export function buyMinion(game, instanceId) {
  const player = game.player;
  const index = player.shop.findIndex((item) => item.instanceId === instanceId);
  if (index < 0) return false;
  const card = player.shop[index];
  const cost = card.kind === "SPELL" ? card.cost : 3;
  const canPay = card.healthCost ? player.health > cost : player.gold >= cost;
  if (game.phase !== "SHOP" || game.pendingAction || !canPay || player.hand.length >= MAX_HAND) return false;
  player.shop.splice(index, 1);
  if (card.healthCost) player.health -= cost;
  else spendGold(player, cost);
  player.hand.push(card);
  const prisons = player.board.filter((item) => item.captureNextPurchase);
  prisons.forEach((source) => { buff(source, card.attack || 0, card.maxHealth || card.health || 0); source.captureNextPurchase = false; });
  message(game, `购买了${card.name}。`);
  if (card.kind === "MINION") checkTriples(game, card.baseId);
  return true;
}

function validTargets(game, card, targetType) {
  const board = game.player.board;
  if (targetType === "ANY_MINION") return board;
  if (targetType === "UNDEAD") return board.filter((item) => hasTribe(item, "UNDEAD"));
  if (targetType === "TIER_FOUR_OR_LESS") return board.filter((item) => item.tier <= 4 && !item.golden);
  if (targetType === "DEVOURABLE") return board.length > 1 ? board : [];
  if (targetType === "OTHER_UNDEAD") return board.filter((item) => hasTribe(item, "UNDEAD") && item.instanceId !== card.instanceId);
  if (targetType === "OTHER_MINION") return board.filter((item) => item.instanceId !== card.instanceId);
  if (targetType === "MECHANICAL") return board.filter((item) => hasTribe(item, "MECHANICAL"));
  if (targetType === "BEAST") return board.filter((item) => hasTribe(item, "BEAST"));
  if (targetType === "RALLY") return board.filter((item) => item.rally);
  if (targetType === "MAGNETIC") return board.filter((item) => hasTribe(item, "MECHANICAL") || hasTribe(item, "UNDEAD"));
  return [];
}

export function playCard(game, instanceId, targetId = null, forceNormal = false, rng = Math.random) {
  if (game.phase !== "SHOP") return false;
  const card = game.player.hand.find((item) => item.instanceId === instanceId);
  if (!card || card.lockedTurns > 0) return false;
  if (card.kind === "SPELL") return castSpell(game, instanceId, targetId, rng);
  const magnetic = hasScript(card, "MAGNETIC") || card.keywords.includes("MAGNETIC");
  const targetType = magnetic ? "MAGNETIC" : card.targeted;
  const targets = validTargets(game, card, targetType);
  if (!targetId && targets.length && !forceNormal) {
    game.pendingAction = { type: "PLAY", instanceId, targetType, validIds: targets.map((item) => item.instanceId), allowNoTarget: magnetic };
    return "PENDING";
  }
  const target = targetId ? targets.find((item) => item.instanceId === targetId) : null;
  if (targetId && !target) return false;
  const handIndex = game.player.hand.findIndex((item) => item.instanceId === instanceId);
  if (target && magnetic) {
    game.player.hand.splice(handIndex, 1);
    const repeats = target.captureDoubleMagnetic ? 2 : 1;
    for (let index = 0; index < repeats; index += 1) mergeMagnetic(target, card);
    target.captureDoubleMagnetic = false;
    onMinionPlayed(game, card, target, rng);
    message(game, `${card.name}已磁力吸附到${target.name}。`);
    game.pendingAction = null;
    return true;
  }
  if (game.player.board.length >= MAX_BOARD) return false;
  game.player.hand.splice(handIndex, 1);
  game.player.board.push(card);
  triggerBattlecry(game, card, target, rng);
  onMinionPlayed(game, card, card, rng);
  if (card.chooseOne) beginChooseOne(game, card, target, rng);
  message(game, `${card.name}加入了战队。`);
  if (card.diesIfPlayedRound === game.round) {
    destroyRecruitMinion(game, card.instanceId, rng);
    message(game, `${card.name}受到惊扰墓穴的诅咒并死亡。`);
  }
  game.pendingAction = null;
  return true;
}

export const playMinion = playCard;

export function resolvePendingTarget(game, targetId = null, rng = Math.random) {
  const pending = game.pendingAction;
  if (!pending) return false;
  if (targetId && !pending.validIds.includes(targetId)) return false;
  game.pendingAction = null;
  if (pending.type === "PLAY") return playCard(game, pending.instanceId, targetId, !targetId, rng);
  if (pending.type === "SPELL") return castSpell(game, pending.instanceId, targetId, rng, true);
  if (pending.type === "ACTIVATE") return activateMinion(game, pending.instanceId, targetId, rng, true);
  if (pending.type === "HERO_POWER") return useHeroPower(game, targetId);
  return false;
}

export function cancelPendingAction(game) {
  if (!game.pendingAction) return false;
  game.pendingAction = null;
  return true;
}

function triggerBattlecry(game, source, target, rng) {
  if (!source.battlecry) return;
  const repeats = game.player.board.some((item) => hasScript(item, "DOUBLE_BATTLECRIES")) ? 2 : 1;
  for (let index = 0; index < repeats; index += 1) runBattlecry(game, source, target, rng);
  game.player.board.filter((item) => hasScript(item, "KALECGOS")).forEach((kalecgos) => {
    const amount = kalecgos.golden ? 4 : 2;
    game.player.board.filter((item) => hasTribe(item, "DRAGON")).forEach((item) => buff(item, amount, amount));
  });
}

function grantCards(game, definition, amount) {
  for (let index = 0; index < amount; index += 1) addCardToHand(game, definition);
}

function applyBloodGem(owner, target, amount = 1) {
  const modifiers = ensureModifiers(owner);
  for (let index = 0; index < amount; index += 1) {
    buff(target, 1 + modifiers.bloodGemAttack, 1 + modifiers.bloodGemHealth);
    target.bloodGems = (target.bloodGems || 0) + 1;
  }
}

function addElementalModifier(game, attack, health) {
  const modifiers = ensureModifiers(game.player);
  modifiers.elementalAttack += attack;
  modifiers.elementalHealth += health;
  game.player.board.filter((item) => hasTribe(item, "ELEMENTAL")).forEach((item) => buff(item, attack, health));
}

function onMinionPlayed(game, card, affected, rng) {
  const board = game.player.board;
  if (hasTribe(card, "MECHANICAL")) {
    board.filter((item) => hasScript(item, "BG31_177")).forEach((item) => buff(affected, item.golden ? 6 : 3, item.golden ? 2 : 1));
    board.filter((item) => hasScript(item, "BG36_851")).forEach((item) => {
      const amount = item.sparkBonus || 2;
      buff(affected, amount, amount); affected.magneticCount = (affected.magneticCount || 0) + 1;
      item.sparkBonus = amount + (item.golden ? 4 : 2);
    });
  }
  if (hasTribe(card, "ELEMENTAL")) {
    board.filter((item) => hasScript(item, "BGS_127")).forEach((item) => buff(item, 0, item.golden ? 2 : 1));
    board.filter((item) => hasScript(item, "BGS_104")).forEach((item) => {
      const amount = item.golden ? 8 : 4;
      game.player.modifiers.shopTribeBuffs.ELEMENTAL = (game.player.modifiers.shopTribeBuffs.ELEMENTAL || 0) + amount;
      game.player.shop.filter((shopCard) => shopCard.kind === "MINION" && hasTribe(shopCard, "ELEMENTAL")).forEach((shopCard) => buff(shopCard, amount, amount));
    });
    board.filter((item) => hasScript(item, "BG32_846")).forEach((item) => board.filter((candidate) => hasTribe(candidate, "ELEMENTAL")).forEach((candidate) => buff(candidate, item.golden ? 8 : 4, item.golden ? 8 : 4)));
    const storms = board.filter((item) => hasScript(item, "BG36_352"));
    if (storms.length) {
      game.player.modifiers.elementalPlays += 1;
      if (game.player.modifiers.elementalPlays >= 3) {
        game.player.modifiers.elementalPlays = 0;
        const shopCard = [...game.player.shop].filter((item) => item.kind === "MINION").sort((a, b) => b.maxHealth - a.maxHealth)[0];
        if (shopCard) storms.forEach((item) => buff(item, shopCard.attack * (item.golden ? 2 : 1), shopCard.maxHealth * (item.golden ? 2 : 1)));
      }
    }
  }
}

function beginChooseOne(game, source, target, rng) {
  const imageUrl = source.imageUrl;
  const modes = {
    BG31_320: [choice("GEMS", "鲜血宝石", "获取2张鲜血宝石", imageUrl), choice("TRAINING", "宝石特训", "获取一张宝石特训", imageUrl)],
    BG36_330: [choice("REFRESH", "秘密通道", "获得2次免费刷新", imageUrl), choice("GEMS", "补给宝石", "获取3张鲜血宝石", imageUrl)],
    BG30_123: [choice("EMPOWER", "精炼宝石", "鲜血宝石永久额外+1/+1", imageUrl), choice("GEMS", "满载而归", "获取4张鲜血宝石", imageUrl)],
    BG36_332: [choice("QUILBOAR", "寻找同伴", "随机获取一张野猪人", imageUrl), choice("GOLD_CAP", "扩大钱袋", "铸币上限提高1", imageUrl)],
    BG36_341: [choice("TEAM_GEMS", "全副武装", "所有随从各使用3张鲜血宝石", imageUrl), choice("BARRAGE", "火力覆盖", "获取3张鲜血宝石弹幕", imageUrl)],
    BG32_237: [choice("ATTACK", "强壮枝叶", "法术额外+1攻击力", imageUrl), choice("HEALTH", "茂盛根系", "法术额外+1生命值", imageUrl)],
    BG27_084: [choice("REBORN", "坚韧甲壳", "+1/+1并获得复生", imageUrl), choice("WINDFURY", "锋利翼鞘", "+4攻击力并获得风怒", imageUrl)],
  };
  if (!modes[source.chooseOne]) return;
  setDiscover(game, `${source.name}：选择一个效果`, modes[source.chooseOne], "CHOOSE_ONE", { sourceId: source.instanceId, targetId: target?.instanceId });
}

function runBattlecry(game, source, target, rng) {
  const mult = source.golden ? 2 : 1;
  const board = game.player.board;
  const otherDragons = board.filter((item) => item.instanceId !== source.instanceId && hasTribe(item, "DRAGON"));
  switch (source.battlecry) {
    case "NERUBIAN_DEATHSWARM": addPermanentUndeadAttack(game, mult); break;
    case "SYNTHESIZER": otherDragons.forEach((item) => buff(item, mult, mult)); break;
    case "MAWCASTER":
      if (target) {
        destroyRecruitMinion(game, target.instanceId, rng);
        game.pendingDiscover = shuffle(UNDEAD, rng).slice(0, 3);
      }
      break;
    case "GET_RING": addCardToHand(game, SPELLS.find((item) => item.id === "BG28_168")); break;
    case "GET_CHROMATIC": addCardToHand(game, randomItem(CHROMATICS, rng)); break;
    case "GET_RANDOM_SPELL": addCardToHand(game, randomItem(SPELLS.filter((item) => item.pool && item.cost === 2), rng)); break;
    case "SPELL_HEALTH": game.player.modifiers.spellHealth += mult; break;
    case "SPELL_ATTACK": game.player.modifiers.spellAttack += mult; break;
    case "GREEN_CHROMATIC": otherDragons.forEach((item) => buff(item, mult, 3 * mult)); break;
    case "BRONZE_CHROMATIC": otherDragons.forEach((item) => buff(item, 3 * mult, mult)); break;
    case "BG20_100": grantCards(game, SPELLS.find((item) => item.id === "BG20_GEM"), 2 * mult); break;
    case "BG31_801": game.player.modifiers.beetleAttack += 2 * mult; game.player.modifiers.beetleHealth += mult; break;
    case "BG32_841": addElementalModifier(game, 2 * mult, 0); break;
    case "BGS_116": game.player.freeRefreshes += 2 * mult; break;
    case "BGS_123": for (let i = 0; i < mult; i += 1) addCardToHand(game, randomItem(ELEMENTALS, rng)); break;
    case "BG34_865": game.player.modifiers.refreshBuffs.push({ attack: 10 * mult, health: 10 * mult }); break;
    case "BG26_162": game.player.modifiers.shopTribeBuffs.ELEMENTAL = (game.player.modifiers.shopTribeBuffs.ELEMENTAL || 0) + 8 * mult; break;
    case "BGS_121": for (let i = 0; i < mult; i += 1) addCardToHand(game, randomItem(ELEMENTALS, rng)); break;
    case "BG34_683": grantCards(game, SPELLS.find((item) => item.id === "BG34_689"), mult); break;
    case "BG23_017": game.player.modifiers.bloodGemAttack += mult; game.player.modifiers.bloodGemHealth += mult; break;
    case "BG27_002": grantCards(game, SPELLS.find((item) => item.id === "BG27_002t"), 2 * mult); break;
    case "BG28_303": if (target) { const original = MINIONS.find((item) => item.id === target.baseId); destroyRecruitMinion(game, target.instanceId, rng); addCardToHand(game, original); } break;
    case "BG28_550": discoverPool(game, SPELLS.filter((item) => item.pool), "发现一张酒馆法术", rng); break;
    case "BG29_503": if (target) { const magnet = randomItem(MECHS.filter((item) => item.keywords?.includes("MAGNETIC")), rng); if (magnet) mergeMagnetic(target, createMinion(magnet, false, game.player.modifiers)); } break;
  }
}

function mergeMagnetic(target, source) {
  buff(target, source.attack, source.health);
  target.keywords = [...new Set([...target.keywords, ...source.keywords.filter((key) => key !== "MAGNETIC")])];
  target.magneticCount = (target.magneticCount || 0) + 1;
}

export function activateMinion(game, instanceId, targetId = null, rng = Math.random, resolving = false) {
  if (game.phase !== "SHOP") return false;
  const source = game.player.board.find((item) => item.instanceId === instanceId);
  if (!source?.activate || source.activatedThisTurn || game.player.gold < source.activateCost) return false;
  const targets = validTargets(game, source, source.targeted);
  if (!targetId && targets.length && !resolving) {
    game.pendingAction = { type: "ACTIVATE", instanceId, validIds: targets.map((item) => item.instanceId) };
    return "PENDING";
  }
  const target = targetId ? targets.find((item) => item.instanceId === targetId) : null;
  if (source.targeted && !target) return false;
  spendGold(game.player, source.activateCost);
  source.activatedThisTurn = true;
  const mult = source.golden ? 2 : 1;
  if (source.activate === "GET_CHROMATIC") {
    for (let i = 0; i < mult; i += 1) addCardToHand(game, randomItem(CHROMATICS, rng));
  } else if (source.activate === "TRIGGER_RALLY") {
    triggerRecruitRally(game, target, rng);
  } else if (source.activate === "BELL_NECRO") {
    if (!target.keywords.includes("REBORN")) target.keywords.push("REBORN");
    destroyRecruitMinion(game, target.instanceId, rng);
    buff(source, 4 * mult, 4 * mult);
  } else if (source.activate === "BG36_345" && target) buff(target, 3 * mult, 3 * mult);
  else if (source.activate === "BG36_506") source.captureDoubleMagnetic = true;
  else if (source.activate === "BG36_180") source.captureNextPurchase = true;
  else if (source.activate === "BG36_354") {
    const stolen = [...game.player.shop].filter((item) => item.kind === "MINION").sort((a, b) => b.attack - a.attack)[0];
    if (stolen) { game.player.shop.splice(game.player.shop.indexOf(stolen), 1); game.player.hand.push(stolen); checkTriples(game, stolen.baseId); }
  } else if (source.activate === "BG36_346") grantCards(game, SPELLS.find((item) => item.script === "BANANA"), 2 * mult);
  else if (source.activate === "BG36_356" && target) { target.attack = 50; target.health = 50; target.maxHealth = 50; }
  else if (source.activate === "BG36_201") {
    const bait = [...game.player.shop].filter((item) => item.kind === "MINION").sort((a, b) => b.attack + b.maxHealth - a.attack - a.maxHealth)[0];
    const beast = game.player.board.find((item) => hasTribe(item, "BEAST"));
    if (bait && beast) { buff(beast, bait.attack * mult, bait.maxHealth * mult); game.player.shop.splice(game.player.shop.indexOf(bait), 1); }
  }
  message(game, `${source.name}发动了能力。`);
  game.pendingAction = null;
  return true;
}

export function castSpell(game, instanceId, targetId = null, rng = Math.random, resolving = false) {
  if (game.phase !== "SHOP") return false;
  const spell = game.player.hand.find((item) => item.instanceId === instanceId && item.kind === "SPELL");
  if (!spell) return false;
  const targets = validTargets(game, spell, spell.targeted);
  if (spell.targeted && !targets.length) {
    game.pendingAction = null;
    message(game, `${spell.name}当前没有可用目标。`);
    return false;
  }
  if (spell.targeted && !targetId && targets.length && !resolving) {
    game.pendingAction = { type: "SPELL", instanceId, sourceName: spell.name, validIds: targets.map((item) => item.instanceId) };
    return "PENDING";
  }
  const target = targetId ? targets.find((item) => item.instanceId === targetId) : null;
  if (spell.targeted && !target) return false;
  const targetBefore = target ? { attack: target.attack, health: target.health } : null;
  game.player.hand = game.player.hand.filter((item) => item.instanceId !== instanceId);
  const repeats = target && game.player.board.some((item) => hasScript(item, "BG35_883")) ? 2 : 1;
  for (let index = 0; index < repeats; index += 1) applySpell(game, spell, target, rng);
  game.stats.spells += 1;
  game.player.lastSpellId = spell.baseId;
  onSpellCast(game, target, rng);
  if (spell.script === "BLOOD_GEM" && target && targetBefore) {
    const attackGain = target.attack - targetBefore.attack;
    const healthGain = target.health - targetBefore.health;
    message(game, `${spell.name}：${target.name} ${targetBefore.attack}/${targetBefore.health} → ${target.attack}/${target.health}（实际 +${attackGain}/+${healthGain}）。`);
  } else message(game, `施放了${spell.name}。`);
  game.pendingAction = null;
  return true;
}

function spellBuff(game, target, attack, health) {
  const mechAura = game.player.board.filter((item) => hasScript(item, "BG35_341")).reduce((sum, item) => sum + (item.golden ? 2 : 1), 0);
  const neutralAttack = game.player.board.filter((item) => hasScript(item, "BG32_341")).reduce((sum, item) => sum + (item.golden ? 2 : 1), 0);
  const neutralHealth = neutralAttack * 2;
  buff(target, attack + game.player.modifiers.spellAttack + mechAura + neutralAttack, health + game.player.modifiers.spellHealth + mechAura + neutralHealth);
}

function majorityTribe(board) {
  const counts = new Map();
  board.forEach((item) => (item.tribes || [item.tribe]).filter((tribe) => tribe !== "NEUTRAL").forEach((tribe) => counts.set(tribe, (counts.get(tribe) || 0) + 1)));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "DRAGON";
}

function gainGold(owner, amount) {
  owner.gold = Math.min(owner.goldCap || 10, owner.gold + amount);
}

function choice(id, name, text, imageUrl, extra = {}) {
  return { id, name, text, imageUrl, kind: "CHOICE", ...extra };
}

function transformKeepingStats(game, target, rng) {
  const definition = randomItem(MINIONS.filter((item) => item.tier === Math.min(6, target.tier + 1)), rng);
  if (!definition) return;
  const transformed = createMinion(definition, false, game.player.modifiers);
  transformed.instanceId = target.instanceId;
  transformed.attack = target.attack; transformed.health = target.health; transformed.maxHealth = target.maxHealth;
  game.player.board.splice(game.player.board.indexOf(target), 1, transformed);
}

function applySpell(game, spell, target, rng) {
  const board = game.player.board;
  switch (spell.script) {
    case "RING": board.forEach((item) => spellBuff(game, item, 1, 1)); break;
    case "FORTIFY": if (target) { spellBuff(game, target, 0, 3); addKeyword(target, "TAUNT"); } break;
    case "RECRUIT_ROOKIE": addCardToHand(game, randomItem(MINIONS.filter((item) => item.tier === 1), rng)); break;
    case "ENCHANTED_LASSO": {
      const stolen = randomItem(game.player.shop.filter((item) => item.kind === "MINION"), rng);
      if (stolen && game.player.hand.length < MAX_HAND) {
        game.player.shop.splice(game.player.shop.indexOf(stolen), 1); game.player.hand.push(stolen); checkTriples(game, stolen.baseId);
      }
      break;
    }
    case "COIN": gainGold(game.player, 1); break;
    case "BANANA": if (target) spellBuff(game, target, 2, 2); break;
    case "UNEXPECTED_FRUIT": game.player.shop.filter((item) => item.kind === "MINION").forEach((item) => buff(item, 1, 2)); break;
    case "ALLIANCE_FLAG": if (target) setDiscover(game, "联盟旗帜：选择强化方向", [
      choice("ATTACK", "+3/+1", "使目标获得+3/+1", spell.imageUrl, { attack: 3, health: 1 }),
      choice("HEALTH", "+1/+3", "使目标获得+1/+3", spell.imageUrl, { attack: 1, health: 3 }),
    ], "ALLIANCE_FLAG", { targetId: target.instanceId }); break;
    case "DISCOVER_TIER_ONE": discoverPool(game, MINIONS.filter((item) => item.tier === 1), "发现一个等级1随从", rng); break;
    case "CHEFS_CHOICE": if (target) {
      const tribes = target.tribes || [target.tribe];
      addCardToHand(game, randomItem(MINIONS.filter((item) => item.id !== target.baseId && tribes.some((tribe) => hasTribe(item, tribe))), rng));
    } break;
    case "DESPERATE_DIG": gainGold(game.player, 1); break;
    case "STRIKE_OIL": game.player.goldCap = (game.player.goldCap || 10) + 1; break;
    case "FREE_REFRESH": game.player.freeRefreshes += 2; break;
    case "SEARCH_TIME": discoverPool(game, MINIONS.filter((item) => item.tier === game.player.tier), "搜寻时光：发现当前等级随从", rng, { lockTurns: 1 }); break;
    case "STORMWIND_STRENGTH": shuffle(board, rng).slice(0, 4).forEach((item) => spellBuff(game, item, 1, 2)); break;
    case "WINNERS_BREAD": if (target) {
      spellBuff(game, target, 2, 3); game.player.pendingBattleBuffs.push({ targetId: target.instanceId, attack: 4, health: 6, on: "WIN" });
    } break;
    case "WACKY_TROUSERS": if (target) {
      spellBuff(game, target, 1, 2);
      if (target.keywords.includes("TAUNT")) target.keywords = target.keywords.filter((key) => key !== "TAUNT"); else addKeyword(target, "TAUNT");
    } break;
    case "PLANAR_TELESCOPE": {
      const tribe = majorityTribe(board); discoverPool(game, MINIONS.filter((item) => hasTribe(item, tribe)), `发现一张${tribe === "UNDEAD" ? "亡灵" : "龙"}牌`, rng); break;
    }
    case "CAREFUL_INVESTMENT": game.player.nextTurnGold = (game.player.nextTurnGold || 0) + 2; break;
    case "OVERCONFIDENCE": game.player.combatSpells.overconfidence = (game.player.combatSpells.overconfidence || 0) + 1; break;
    case "STAFF_OF_ENRICHMENT":
      game.player.modifiers.shopAttack += 2; game.player.modifiers.shopHealth += 2;
      game.player.shop.filter((item) => item.kind === "MINION").forEach((item) => buff(item, 2, 2)); break;
    case "STABLE_MUTATION": if (target) transformKeepingStats(game, target, rng); break;
    case "TIME_MANAGEMENT": setDiscover(game, "时间管理：选择生效时机", [
      choice("NOW", "赶快行动", "现在使你的随从获得+2/+2", spell.imageUrl),
      choice("LATER", "稍后再办", "下回合开始时，使你的随从获得+2/+2，触发两次", spell.imageUrl),
    ], "TIME_MANAGEMENT"); break;
    case "REPAIR_JOB": if (target) spellBuff(game, target, 4, 8); break;
    case "RITUAL_OF_DEFENDER": if (target) { spellBuff(game, target, 7, 7); addKeyword(target, "TAUNT"); } break;
    case "BLESSING_OF_NATURE": if (target) {
      const tribes = target.tribes || [target.tribe]; board.filter((item) => tribes.some((tribe) => hasTribe(item, tribe))).forEach((item) => spellBuff(game, item, 3, 3));
    } break;
    case "MISPLACED_TEAPOT": {
      const used = new Set();
      board.forEach((item) => {
        const tribe = (item.tribes || [item.tribe]).find((candidate) => !used.has(candidate));
        if (tribe) { used.add(tribe); spellBuff(game, item, 4, 4); }
      });
      break;
    }
    case "UNLIMITED_POTENTIAL": setDiscover(game, "无限潜力：选择发现类型", [
      choice("MINION", "随从", "发现当前酒馆等级的随从", spell.imageUrl),
      choice("SPELL", "法术", "发现当前酒馆等级的酒馆法术", spell.imageUrl),
    ], "UNLIMITED_POTENTIAL"); break;
    case "DISTURB_GRAVES": discoverPool(game, UNDEAD, "惊扰墓穴：发现一张亡灵牌", rng, { diesIfPlayedRound: game.round }); break;
    case "EONARS_FAVOR": if (target) {
      const tribe = (target.tribes || [target.tribe]).find((item) => item !== "NEUTRAL") || target.tribe;
      game.player.modifiers.shopTribeBuffs[tribe] = (game.player.modifiers.shopTribeBuffs[tribe] || 0) + 3;
      game.player.shop.filter((item) => item.kind === "MINION" && hasTribe(item, tribe)).forEach((item) => buff(item, 3, 3));
    } break;
    case "MIGHTY_BREATH":
      board.forEach((item) => {
        spellBuff(game, item, 2, 1);
        if (hasTribe(item, "DRAGON")) spellBuff(game, item, 2, 1);
        if (item.keywords.includes("DIVINE_SHIELD")) spellBuff(game, item, 2, 1);
      });
      break;
    case "WEAPONS_FORGE": for (let index = 0; index < 3; index += 1) addCardToHand(game, SPELLS.find((item) => item.id === "EBG_Spell_014")); break;
    case "ARMOR_STASH": game.player.armor = 5; break;
    case "UPPER_HAND": game.player.combatSpells.upperHand = (game.player.combatSpells.upperHand || 0) + 1; break;
    case "SLAUGHTER": if (target) { destroyRecruitMinion(game, target.instanceId, rng); addPermanentUndeadAttack(game, 5); } break;
    case "GOLDEN_TOUCH": {
      const minion = randomItem(game.player.shop.filter((item) => item.kind === "MINION" && !item.golden), rng);
      if (minion) { minion.golden = true; buff(minion, minion.attack, minion.maxHealth); }
      break;
    }
    case "TOP_SHELF": game.player.shop = buildShop(game.player, rng, "SPELLS"); break;
    case "DISCOVER_DEATHRATTLE": discoverPool(game, MINIONS.filter((item) => item.deathrattle), "发现一张亡语随从牌", rng); break;
    case "DISCOVER_BATTLECRY": discoverPool(game, MINIONS.filter((item) => item.battlecry), "发现一张战吼随从牌", rng); break;
    case "FOREST_TREASURE": if (target) setDiscover(game, "森林秘宝：选择强化方式", [
      choice("FOCUS", "众数为一", "使所选随从获得+6/+6，触发两次", spell.imageUrl),
      choice("WIDE", "一为众数", "使你的所有随从获得+2/+2", spell.imageUrl),
    ], "FOREST_TREASURE", { targetId: target.instanceId }); break;
    case "CHILD_OF_NOZDORMU": game.player.combatSpells.doubleLeftAttack = (game.player.combatSpells.doubleLeftAttack || 0) + 1; break;
    case "DEVOURERS_INVOCATION": if (target) {
      const attack = target.attack, health = target.maxHealth;
      game.player.board.splice(game.player.board.indexOf(target), 1);
      const recipient = randomItem(game.player.board, rng); if (recipient) spellBuff(game, recipient, attack, health);
    } break;
    case "AZERITE_EMPOWERMENT": for (let repeat = 0; repeat < 2; repeat += 1) board.forEach((item) => spellBuff(game, item, 2, 2)); break;
    case "PERFECT_VISION": if (target) {
      target.attack = 20 + game.player.modifiers.spellAttack;
      target.health = 20 + game.player.modifiers.spellHealth; target.maxHealth = target.health; checkThresholds(target);
    } break;
    case "EYES_OF_EARTH_MOTHER": if (target) { target.golden = true; buff(target, target.attack, target.maxHealth); } break;
    case "HAMUULS_STAFF": if (target) {
      const tribe = (target.tribes || [target.tribe]).find((item) => item !== "NEUTRAL") || target.tribe;
      game.player.shop = buildShop(game.player, rng, `TRIBE:${tribe}`);
    } break;
    case "SHARP_ARROW": if (target) spellBuff(game, target, 4, 0); break;
    case "BLOOD_GEM": if (target) applyBloodGem(game.player, target); break;
    case "GEM_TRAINING": setDiscover(game, "宝石特训：选择强化方向", [
      choice("ATTACK", "锋利宝石", "鲜血宝石额外+1攻击力", spell.imageUrl),
      choice("HEALTH", "坚韧宝石", "鲜血宝石额外+1生命值", spell.imageUrl),
    ], "GEM_TRAINING"); break;
    case "GEM_BARRAGE": game.player.modifiers.refreshBloodGems += 1; break;
    case "GEM_CONFISCATION": if (target) {
      applyBloodGem(game.player, target, 2);
      const index = board.indexOf(target);
      [board[index - 1], board[index + 1]].filter(Boolean).forEach((adjacent) => {
        const count = adjacent.bloodGems || 0;
        if (!count) return;
        const attack = count * (1 + game.player.modifiers.bloodGemAttack);
        const health = count * (1 + game.player.modifiers.bloodGemHealth);
        adjacent.attack = Math.max(0, adjacent.attack - attack); adjacent.health = Math.max(1, adjacent.health - health); adjacent.maxHealth = Math.max(1, adjacent.maxHealth - health);
        adjacent.bloodGems = 0; buff(target, attack, health); target.bloodGems = (target.bloodGems || 0) + count;
      });
    } break;
    case "STICKY_SHIELD": if (target) { spellBuff(game, target, 1, 1); addKeyword(target, "TAUNT"); } break;
  }
}

function onSpellCast(game, target = null, rng = Math.random) {
  const board = game.player.board;
  board.filter((item) => hasScript(item, "HOOKTAIL")).forEach((source) => board.forEach((item) => buff(item, source.golden ? 2 : 1, 0)));
  board.filter((item) => hasScript(item, "UNDEAD_SPELL_SCALER")).forEach((source) => addPermanentUndeadAttack(game, source.golden ? 4 : 2));
  board.filter((item) => hasScript(item, "FIRE_FORGED_SCALE")).forEach((source) => { source.fireForgedBonus = (source.fireForgedBonus || 0) + (source.golden ? 2 : 1); });
  board.filter((item) => hasScript(item, "BG28_741")).forEach((source) => board.filter((item) => item.keywords.includes("DIVINE_SHIELD")).forEach((item) => buff(item, source.golden ? 8 : 4, 0)));
  if (target && hasTribe(target, "MECHANICAL")) board.filter((item) => hasScript(item, "BG36_853")).forEach((source) => {
    const amount = source.golden ? 8 : 4; buff(target, amount, amount); target.magneticCount = (target.magneticCount || 0) + 1;
  });
  if (target?.baseId === "BG36_510") {
    const index = board.indexOf(target); [board[index - 1], board[index + 1]].filter(Boolean).forEach((item) => applyBloodGem(game.player, item));
  }
  game.player.modifiers.spellsCast += 1;
  if (game.player.modifiers.spellsCast % 3 === 0) board.filter((item) => hasScript(item, "BG28_633")).forEach((source) => {
    const food = randomItem(game.player.shop.filter((item) => item.kind === "MINION"), rng);
    if (food) { buff(source, food.attack, food.maxHealth); game.player.shop.splice(game.player.shop.indexOf(food), 1); }
  });
}

function triggerRecruitRally(game, source, rng) {
  if (!source?.rally) return;
  const mult = source.golden ? 2 : 1;
  if (source.rally === "SELF_ATTACK_2") buff(source, 2 * mult, 0);
  else if (source.rally === "UNDEAD_ATTACK") addPermanentUndeadAttack(game, mult);
  else if (source.rally === "SPELL_HEALTH") game.player.modifiers.spellHealth += mult;
  else if (source.rally === "GET_CHROMATIC") for (let i = 0; i < mult; i += 1) addCardToHand(game, randomItem(CHROMATICS, rng));
  else if (source.rally === "MIGHTY_BREATH") for (let i = 0; i < mult; i += 1) applySpell(game, SPELLS.find((item) => item.id === "BG36_246"), null, rng);
  else if (source.rally === "BG33_886") applyBloodGem(game.player, source, mult);
  else if (source.rally === "BG20_101") grantCards(game, SPELLS.find((item) => item.id === "BG20_GEM"), mult);
  else if (source.rally === "BG20_104") game.player.board.filter((item) => item.instanceId !== source.instanceId).forEach((item) => applyBloodGem(game.player, item, mult));
  else if (source.rally === "BG33_883") applyBloodGem(game.player, source, 3 * mult);
  else if (source.rally === "BG33_885") { game.player.modifiers.bloodGemAttack += mult; game.player.modifiers.bloodGemHealth += mult; }
  else if (source.rally === "BG36_331") addCardToHand(game, randomItem(QUILBOAR.filter((item) => item.chooseOne), rng));
  else if (source.rally === "BG36_351") addElementalModifier(game, 2 * mult, 2 * mult);
  else if (source.rally === "BG36_207") game.player.board.filter((item) => item.instanceId !== source.instanceId).forEach((item) => buff(item, 4 * mult, mult));
  else if (source.rally === "BG36_204") for (let i = 0; i < mult; i += 1) addCardToHand(game, randomItem(BEASTS, rng));
  else if (source.rally === "BG36_200") for (let i = 0; i < mult && game.player.board.length < MAX_BOARD; i += 1) game.player.board.splice(game.player.board.indexOf(source) + 1 + i, 0, createMinion(TOKENS.small_beast, false, game.player.modifiers));
  else if (source.rally === "BG36_210") for (let i = 0; i < mult && game.player.board.length < MAX_BOARD; i += 1) game.player.board.push(createMinion(BEASTS.find((item) => item.id === "BG36_202"), false, game.player.modifiers));
}

function destroyRecruitMinion(game, instanceId, rng) {
  const index = game.player.board.findIndex((item) => item.instanceId === instanceId);
  if (index < 0) return null;
  const [minion] = game.player.board.splice(index, 1);
  triggerRecruitDeathrattle(game, minion, index, rng);
  return minion;
}

function triggerRecruitDeathrattle(game, minion, index, rng) {
  const dr = minion.deathrattle;
  if (!dr) return;
  const repeats = (minion.golden ? 2 : 1) * (game.player.board.some((item) => hasScript(item, "DOUBLE_DEATHRATTLES")) ? 2 : 1);
  for (let repeat = 0; repeat < repeats; repeat += 1) {
    if (dr.summon) {
      for (let i = 0; i < dr.count && game.player.board.length < MAX_BOARD; i += 1) game.player.board.splice(index + i, 0, createMinion(TOKENS[dr.summon], false, game.player.modifiers));
    }
    if (dr.buffRandomTribe) {
      const target = randomItem(game.player.board.filter((item) => hasTribe(item, dr.buffRandomTribe)), rng);
      if (target) buff(target, dr.attack, dr.health);
    }
    if (dr.grantRebornRandom) {
      const target = randomItem(game.player.board.filter((item) => hasTribe(item, "UNDEAD") && !item.keywords.includes("REBORN")), rng);
      if (target) addKeyword(target, "REBORN");
    }
    if (dr.modifier === "undeadAttack") addPermanentUndeadAttack(game, dr.recruitAmount || dr.amount);
    if (dr.modifier === "spellAttack") game.player.modifiers.spellAttack += dr.amount;
    if (dr.rewardSpell) addCardToHand(game, SPELLS.find((item) => item.id === dr.rewardSpell));
    if (dr.rewardChromatic) addCardToHand(game, randomItem(CHROMATICS, rng));
    if (dr.script === "BG29_611") game.player.board.splice(Math.min(index, game.player.board.length), 0, createMinion(TOKENS.microbot, false, game.player.modifiers));
    if (dr.script === "BG32_170") addCardToHand(game, SPELLS.find((item) => item.script === "SHARP_ARROW"));
    if (dr.script === "BG36_854") addCardToHand(game, SPELLS.find((item) => item.script === "REPAIR_JOB"));
    if (dr.script === "BG32_172") game.player.board.splice(Math.min(index, game.player.board.length), 0, createMinion(MECHS.find((item) => item.id === "BG_TTN_401"), false, game.player.modifiers));
    if (dr.script === "BG34_856") game.player.modifiers.refreshBuffs.push({ attack: 4, health: 4 });
    if (dr.script === "BG32_842") addElementalModifier(game, 0, 2);
    if (dr.script === "BG26_162") game.player.modifiers.shopTribeBuffs.ELEMENTAL = (game.player.modifiers.shopTribeBuffs.ELEMENTAL || 0) + 8;
    if (dr.script === "BGS_121") addCardToHand(game, randomItem(ELEMENTALS, rng));
    if (dr.script === "BG34_682") addCardToHand(game, SPELLS.find((item) => item.id === "BG34_689"));
    if (dr.script === "BG23_017") { game.player.modifiers.bloodGemAttack += 1; game.player.modifiers.bloodGemHealth += 1; }
    if (["BG31_803", "BG31_801", "BG31_809", "BG36_209"].includes(dr.script)) game.player.board.splice(Math.min(index, game.player.board.length), 0, createMinion(TOKENS.beetle, false, game.player.modifiers));
    if (dr.script === "BG31_809") { game.player.modifiers.beetleAttack += 5; game.player.modifiers.beetleHealth += 5; }
    if (dr.script === "BG35_604") for (let i = 0; i < 2 && game.player.board.length < MAX_BOARD; i += 1) game.player.board.splice(index + i, 0, createMinion(TOKENS.sewer_rat, false, game.player.modifiers));
    if (dr.script === "BG36_202") { const beast = randomItem(game.player.board.filter((item) => hasTribe(item, "BEAST")), rng); if (beast) buff(beast, 1 + game.player.modifiers.lobsterBuff, 1 + game.player.modifiers.lobsterBuff); game.player.modifiers.lobsterBuff += 1; }
  }
  if (dr.summon) checkTriples(game, TOKENS[dr.summon]?.id);
}

export function sellMinion(game, instanceId) {
  if (game.phase !== "SHOP" || game.pendingAction) return false;
  const index = game.player.board.findIndex((item) => item.instanceId === instanceId);
  if (index < 0) return false;
  const [minion] = game.player.board.splice(index, 1);
  gainGold(game.player, minion.baseId === "BG24_018" && game.player.lastBattleResult === "LOSS" ? 5 : 1);
  if (minion.baseId === "BGS_115") addCardToHand(game, TOKENS.sell_elemental);
  if (minion.baseId === "BG24_715") discoverPool(game, MINIONS.filter((item) => item.tier === Math.min(6, minion.turnsHeld || 1)), `发现一个等级${Math.min(6, minion.turnsHeld || 1)}随从`, Math.random);
  if (minion.baseId === "BG31_816") { game.player.modifiers.firePitcher += 1; game.player.board.forEach((item) => buff(item, game.player.modifiers.firePitcher, 0)); }
  if (minion.baseId === "BG31_818") { game.player.modifiers.icePitcher += 1; game.player.board.forEach((item) => buff(item, 0, game.player.modifiers.icePitcher)); }
  if (minion.baseId === "BG36_181") { game.player.modifiers.airPitcher += 2; game.player.board.forEach((item) => buff(item, game.player.modifiers.airPitcher, game.player.modifiers.airPitcher)); }
  if (hasTribe(minion, "ELEMENTAL")) game.player.board.filter((item) => hasScript(item, "BG31_843")).forEach((item) => buff(item, item.golden ? 8 : 4, item.golden ? 8 : 4));
  if (minion.baseId === "BG36_206") { game.player.shop = buildShop(game.player, Math.random); const beast = game.player.board.find((item) => hasTribe(item, "BEAST")); const bait = randomItem(game.player.shop.filter((item) => item.kind === "MINION")); if (beast && bait) buff(beast, bait.attack, bait.maxHealth); }
  message(game, `出售了${minion.name}。`);
  return true;
}

export function moveMinion(game, instanceId, direction) {
  const index = game.player.board.findIndex((item) => item.instanceId === instanceId);
  return reorderMinion(game, instanceId, index + direction);
}

export function reorderMinion(game, instanceId, targetIndex) {
  if (game.phase !== "SHOP" || game.pendingAction) return false;
  const board = game.player.board;
  const from = board.findIndex((item) => item.instanceId === instanceId);
  if (from < 0 || targetIndex < 0 || targetIndex >= board.length) return false;
  const [item] = board.splice(from, 1);
  board.splice(targetIndex, 0, item);
  return true;
}

export function upgradeTavern(game) {
  const p = game.player;
  if (game.phase !== "SHOP" || game.pendingAction || p.tier >= 6 || p.gold < p.upgradeCost) return false;
  spendGold(p, p.upgradeCost); p.tier += 1; p.upgradeCost = UPGRADE_BASE_COST[p.tier] ?? 0;
  message(game, `酒馆升级到${p.tier}级。`); return true;
}

export function useHeroPower(game, instanceId) {
  const p = game.player;
  if (game.phase !== "SHOP" || game.hero.power !== "GOLDEN_TOUCH" || p.heroPowerUsed) return false;
  const minion = p.board.find((item) => item.instanceId === instanceId);
  if (!minion || minion.golden) return false;
  minion.golden = true; buff(minion, minion.attack, minion.maxHealth); p.heroPowerUsed = true;
  message(game, `${minion.name}变为了金色。`); return true;
}

export function startHeroPower(game) {
  const p = game.player;
  if (game.phase !== "SHOP" || game.pendingAction || game.hero.power !== "GOLDEN_TOUCH" || p.heroPowerUsed) return false;
  const targets = p.board.filter((item) => !item.golden);
  if (!targets.length) return false;
  game.pendingAction = { type: "HERO_POWER", validIds: targets.map((item) => item.instanceId) };
  return "PENDING";
}

function checkTriples(game, baseId) {
  const all = [...game.player.board, ...game.player.hand].filter((item) => item.kind === "MINION" && !item.golden);
  const natural = all.filter((item) => item.baseId === baseId);
  const definition = [...MINIONS, ...CHROMATICS, ...Object.values(TOKENS)].find((item) => item.id === baseId);
  const wildcards = definition && hasTribe(definition, "ELEMENTAL") && baseId !== "BG26_175" ? all.filter((item) => item.baseId === "BG26_175") : [];
  const copies = [...natural, ...wildcards].slice(0, 3);
  if (copies.length < 3) return false;
  if (!definition) return false;
  const ids = new Set(copies.slice(0, 3).map((item) => item.instanceId));
  game.player.board = game.player.board.filter((item) => !ids.has(item.instanceId));
  game.player.hand = game.player.hand.filter((item) => !ids.has(item.instanceId));
  game.player.hand.push(createGoldenFromCopies(definition, copies, game.player.modifiers));
  game.pendingDiscover = shuffle(MINIONS.filter((item) => item.tier === Math.min(6, game.player.tier + 1))).slice(0, 3);
  game.stats.triples += 1; message(game, `三连！获得金色${definition.name}。`);
  return true;
}

function minionDefinition(baseId) {
  return [...MINIONS, ...CHROMATICS, ...Object.values(TOKENS)].find((item) => item.id === baseId);
}

function createGoldenFromCopies(definition, copies, modifiers) {
  const golden = createMinion(definition, true, modifiers);
  let bonusAttack = 0;
  let bonusHealth = 0;
  const inheritedKeywords = new Set(golden.keywords);

  copies.forEach((copy) => {
    const copyDefinition = minionDefinition(copy.baseId) || definition;
    const baseline = createMinion(copyDefinition, false, modifiers);
    bonusAttack += Math.max(0, (copy.attack || 0) - baseline.attack);
    bonusHealth += Math.max(0, (copy.maxHealth ?? copy.health ?? 0) - baseline.maxHealth);
    const baselineKeywords = new Set(baseline.keywords || []);
    (copy.keywords || []).filter((keyword) => !baselineKeywords.has(keyword)).forEach((keyword) => inheritedKeywords.add(keyword));
  });

  buff(golden, bonusAttack, bonusHealth);
  golden.health = golden.maxHealth;
  golden.keywords = [...new Set([...(golden.keywords || []), ...inheritedKeywords])];
  golden.bloodGems = copies.reduce((sum, copy) => sum + (copy.bloodGems || 0), 0);
  golden.magneticCount = copies.reduce((sum, copy) => sum + (copy.magneticCount || 0), 0);
  golden.rebornAttack = golden.attack;
  golden.rebornKeywords = [...golden.keywords];
  return golden;
}

export function resolveTriples(game) {
  if (!game || game.phase !== "SHOP" || game.pendingDiscover || game.pendingAction) return false;
  const baseIds = [...new Set([...game.player.board, ...game.player.hand]
    .filter((item) => item.kind === "MINION" && item.baseId && !item.golden)
    .map((item) => item.baseId))];
  return baseIds.some((baseId) => checkTriples(game, baseId));
}

function setDiscover(game, title, items, mode = "ADD_CARD", extra = {}) {
  game.pendingDiscover = { title, items: items.slice(0, 3), mode, ...extra };
}

function discoverPool(game, pool, title, rng, extra = {}) {
  const items = shuffle(pool, rng).slice(0, 3);
  if (!items.length) return false;
  setDiscover(game, title, items, "ADD_CARD", extra);
  return true;
}

export function chooseDiscover(game, baseId, rng = Math.random) {
  const pending = Array.isArray(game.pendingDiscover)
    ? { title: "发现一个更高等级随从", items: game.pendingDiscover, mode: "ADD_CARD" }
    : game.pendingDiscover;
  const definition = pending?.items?.find((item) => item.id === baseId);
  if (!definition) return false;
  game.pendingDiscover = null;
  if (pending.mode === "ADD_CARD") {
    if (!addCardToHand(game, definition)) return false;
    const card = game.player.hand.at(-1);
    if (pending.lockTurns) card.lockedTurns = pending.lockTurns;
    if (pending.diesIfPlayedRound != null) card.diesIfPlayedRound = pending.diesIfPlayedRound;
    message(game, `发现了${definition.name}。`);
    return true;
  }
  const target = game.player.board.find((item) => item.instanceId === pending.targetId);
  let choiceResultMessage = "";
  if (pending.mode === "ALLIANCE_FLAG" && target) {
    const before = `${target.attack}/${target.health}`;
    spellBuff(game, target, definition.attack, definition.health);
    choiceResultMessage = `联盟旗帜：${target.name} ${before} → ${target.attack}/${target.health}（${definition.name}）。`;
  }
  else if (pending.mode === "TIME_MANAGEMENT") {
    if (definition.id === "NOW") game.player.board.forEach((item) => spellBuff(game, item, 2, 2));
    else game.player.scheduledBoardBuffs.push({ attack: 2, health: 2, repeats: 2 });
  } else if (pending.mode === "UNLIMITED_POTENTIAL") {
    const pool = definition.id === "MINION"
      ? MINIONS.filter((item) => item.tier === game.player.tier)
      : SPELLS.filter((item) => item.pool && item.tier === game.player.tier);
    return discoverPool(game, pool, definition.id === "MINION" ? "发现当前等级随从" : "发现当前等级法术", rng);
  } else if (pending.mode === "FOREST_TREASURE") {
    if (definition.id === "FOCUS" && target) for (let i = 0; i < 2; i += 1) spellBuff(game, target, 6, 6);
    else if (definition.id === "WIDE") game.player.board.forEach((item) => spellBuff(game, item, 2, 2));
  } else if (pending.mode === "GEM_TRAINING") {
    if (definition.id === "ATTACK") game.player.modifiers.bloodGemAttack += 1; else game.player.modifiers.bloodGemHealth += 1;
    choiceResultMessage = `${definition.name}生效：鲜血宝石现在提供+${1 + game.player.modifiers.bloodGemAttack}/+${1 + game.player.modifiers.bloodGemHealth}。`;
  } else if (pending.mode === "CHOOSE_ONE") {
    const source = game.player.board.find((item) => item.instanceId === pending.sourceId);
    const target = game.player.board.find((item) => item.instanceId === pending.targetId);
    const applyChoice = (id) => {
      if (id === "GEMS") grantCards(game, SPELLS.find((item) => item.id === "BG20_GEM"), source?.baseId === "BG36_330" ? 3 : source?.baseId === "BG30_123" ? 4 : 2);
      if (id === "TRAINING") addCardToHand(game, SPELLS.find((item) => item.id === "BG31_893"));
      if (id === "REFRESH") game.player.freeRefreshes += 2;
      if (id === "EMPOWER") { game.player.modifiers.bloodGemAttack += 1; game.player.modifiers.bloodGemHealth += 1; }
      if (id === "QUILBOAR") addCardToHand(game, randomItem(QUILBOAR, rng));
      if (id === "GOLD_CAP") game.player.goldCap += 1;
      if (id === "TEAM_GEMS") game.player.board.forEach((item) => applyBloodGem(game.player, item, 3));
      if (id === "BARRAGE") grantCards(game, SPELLS.find((item) => item.id === "BG34_689"), 3);
      if (id === "ATTACK") game.player.modifiers.spellAttack += 1;
      if (id === "HEALTH") game.player.modifiers.spellHealth += 1;
      if (id === "REBORN" && target) { buff(target, 1, 1); addKeyword(target, "REBORN"); }
      if (id === "WINDFURY" && target) { buff(target, 4, 0); addKeyword(target, "WINDFURY"); }
    };
    applyChoice(definition.id);
    const chooseBoth = game.player.board.some((item) => hasScript(item, "BG31_327")) && !game.player.modifiers.chooseBothUsed;
    if (chooseBoth) {
      game.player.modifiers.chooseBothUsed = true;
      pending.items.filter((item) => item.id !== definition.id).forEach((item) => applyChoice(item.id));
    }
    game.player.board.filter((item) => hasScript(item, "BG31_323")).forEach((rider) => game.player.board.filter((item) => hasTribe(item, "QUILBOAR") && item.instanceId !== rider.instanceId).forEach((item) => applyBloodGem(game.player, item)));
  } else return false;
  message(game, choiceResultMessage || `选择了${definition.name}。`);
  return true;
}

function applyEndTurn(game, rng) {
  const repeats = game.player.board.some((item) => hasScript(item, "DOUBLE_END_TURN")) ? 2 : 1;
  for (let loop = 0; loop < repeats; loop += 1) {
    [...game.player.board].forEach((source) => {
      const mult = source.golden ? 2 : 1;
      if (source.endTurn === "SPELL_BONUS") { game.player.modifiers.spellAttack += mult; game.player.modifiers.spellHealth += mult; }
      if (source.endTurn === "GET_TWO_SPELLS") for (let i = 0; i < 2 * mult; i += 1) addCardToHand(game, randomItem(SPELLS.filter((item) => item.pool), rng));
      if (source.endTurn === "BG26_146") buff(source, 0, mult);
      if (source.endTurn === "BG36_764") for (let i = 0; i < 2 * mult; i += 1) addCardToHand(game, randomItem(SPELLS.filter((item) => item.pool && item.cost === 1), rng));
      if (source.endTurn === "BG26_152") game.player.board.forEach((item) => buff(item, 4 * (item.magneticCount || 0) * mult, 4 * (item.magneticCount || 0) * mult));
      if (source.endTurn === "BG31_326") grantCards(game, SPELLS.find((item) => item.id === "BG31_893"), mult);
      if (source.endTurn === "BG34_684") grantCards(game, SPELLS.find((item) => item.id === "BG28_698"), mult);
      if (source.endTurn === "BG34_500") {
        const food = [...game.player.shop].filter((item) => item.kind === "MINION").sort((a, b) => b.maxHealth - a.maxHealth)[0];
        if (food) { buff(source, food.attack * mult, food.maxHealth * mult); game.player.shop.splice(game.player.shop.indexOf(food), 1); }
      }
      if (source.endTurn === "BG35_123" && game.player.lastSpellId) grantCards(game, SPELLS.find((item) => item.id === game.player.lastSpellId), mult);
      if (source.endTurn === "BG24_715") source.turnsHeld = Math.min(6, (source.turnsHeld || 1) + 1);
    });
  }
}

export function beginCombat(game, rng = Math.random) {
  if (game.phase !== "SHOP" || !game.player.board.length || game.pendingDiscover || game.pendingAction) return null;
  applyEndTurn(game, rng);
  game.phase = "COMBAT";
  const combatSpells = { player: clone(game.player.combatSpells || {}), enemy: clone(game.currentOpponent.combatSpells || {}) };
  game.player.pendingOverconfidence = combatSpells.player.overconfidence || 0;
  game.player.combatSpells = {}; game.currentOpponent.combatSpells = {};
  const result = simulateBattle(game.player.board, game.currentOpponent.board, game.hero.power, rng, combatSpells);
  game.battle = { ...result, opponent: clone(game.currentOpponent) };
  applyCombatRewards(game, result.rewards.player, result.persistentBuffs.player);
  applyBotCombatRewards(game.currentOpponent, result.rewards.enemy, result.persistentBuffs.enemy);
  resolvePlayerBattle(game, game.currentOpponent, result);
  game.player.lastBattleResult = result.winner === "player" ? "WIN" : result.winner === "enemy" ? "LOSS" : "TIE";
  game.currentOpponent.lastBattleResult = result.winner === "enemy" ? "WIN" : result.winner === "player" ? "LOSS" : "TIE";
  resolveBotBattles(game, game.currentOpponent.id, rng);
  return game.battle;
}

function prepareCombatBoard(board) {
  return clone(board).map((item) => ({ ...item, shield: item.keywords.includes("DIVINE_SHIELD"), rebornUsed: false, avengeProgress: 0 }));
}

function markRetainers(board) {
  board.forEach((item) => { if (hasScript(item, "TARECGOSA")) item.retainCombatBuffs = true; });
  board.forEach((poet, index) => {
    if (!hasScript(poet, "POET")) return;
    [board[index - 1], board[index + 1]].filter((item) => hasTribe(item, "DRAGON")).forEach((item) => { item.retainCombatBuffs = true; });
  });
}

function combatContext(playerBoard, enemyBoard) {
  return {
    log: [], frames: [],
    rewards: { player: { modifiers: {}, cards: [] }, enemy: { modifiers: {}, cards: [] } },
    persistentBuffs: { player: {}, enemy: {} },
    deadMechs: { player: [], enemy: [] },
    sides: { player: playerBoard, enemy: enemyBoard },
  };
}

function snapshotFrame(ctx, label, event = { type: "state" }) {
  ctx.frames.push({ label, event: clone(event), player: clone(ctx.sides.player), enemy: clone(ctx.sides.enemy) });
}

function combatBuff(target, attack, health, ctx, side) {
  buff(target, attack, health);
  if (target.retainCombatBuffs) {
    const entry = ctx.persistentBuffs[side][target.instanceId] ||= { attack: 0, health: 0, keywords: [] };
    entry.attack += attack; entry.health += health;
  }
}

function combatKeyword(target, keyword, ctx, side) {
  addKeyword(target, keyword);
  if (keyword === "DIVINE_SHIELD") target.shield = true;
  if (target.retainCombatBuffs) {
    const entry = ctx.persistentBuffs[side][target.instanceId] ||= { attack: 0, health: 0, keywords: [] };
    if (!entry.keywords.includes(keyword)) entry.keywords.push(keyword);
  }
}

function applyCombatStart(board, opposing, ctx, side, rng) {
  [...board].forEach((source) => {
    const mult = source.golden ? 2 : 1;
    const dragons = board.filter((item) => hasTribe(item, "DRAGON"));
    const otherDragons = dragons.filter((item) => item.instanceId !== source.instanceId);
    if (source.combatStart === "PAPER_DRAKE") {
      const target = dragons[0]; if (target) { combatBuff(target, mult, 2 * mult, ctx, side); combatKeyword(target, "WINDFURY", ctx, side); }
    } else if (source.combatStart === "SYNTHESIZER") otherDragons.forEach((item) => combatBuff(item, mult, mult, ctx, side));
    else if (source.combatStart === "AMBER_GUARDIAN") {
      const target = randomItem(otherDragons, rng); if (target) { combatBuff(target, 2 * mult, 2 * mult, ctx, side); combatKeyword(target, "DIVINE_SHIELD", ctx, side); }
    } else if (source.combatStart === "RING_TWICE") board.forEach((item) => combatBuff(item, 2 * mult, 2 * mult, ctx, side));
    else if (source.combatStart === "FIRE_FORGED") {
      const amount = (source.golden ? 4 : 2) + (source.fireForgedBonus || 0);
      dragons.forEach((item) => combatBuff(item, amount, Math.ceil(amount / 2), ctx, side));
    } else if (source.combatStart === "BG26_805") board.filter((item) => hasTribe(item, "BEAST")).forEach((item) => combatBuff(item, mult, 0, ctx, side));
    else if (source.combatStart === "BG36_620") {
      [...board, ...opposing].filter((item) => item.instanceId !== source.instanceId).forEach((item) => hit(item, 3 * mult));
    }
  });
}

function applyOpeningSpellEffects(board, opposing, effects, rng) {
  for (let repeat = 0; repeat < (effects?.upperHand || 0); repeat += 1) {
    const target = randomItem(opposing, rng); if (target) { target.health = 1; target.maxHealth = 1; }
  }
  for (let repeat = 0; repeat < (effects?.doubleLeftAttack || 0); repeat += 1) if (board[0]) board[0].attack *= 2;
}

export function simulateBattle(playerInput, enemyInput, heroPower = null, rng = Math.random, combatSpells = {}) {
  const player = prepareCombatBoard(playerInput), enemy = prepareCombatBoard(enemyInput);
  markRetainers(player); markRetainers(enemy);
  const ctx = combatContext(player, enemy);
  applyOpeningSpellEffects(player, enemy, combatSpells.player, rng);
  applyOpeningSpellEffects(enemy, player, combatSpells.enemy, rng);
  applyCombatStart(player, enemy, ctx, "player", rng); applyCombatStart(enemy, player, ctx, "enemy", rng);
  processDeaths(player, enemy, ctx, "player", rng); processDeaths(enemy, player, ctx, "enemy", rng);
  snapshotFrame(ctx, "战斗开始", { type: "start" });
  if (heroPower === "EDGE_ASSAULT" && player.length) {
    const edges = player.length === 1 ? [player[0]] : [player[0], player[player.length - 1]];
    edges.forEach((item) => { if (player.includes(item)) { combatBuff(item, 2, 1, ctx, "player"); performAttack(player, enemy, item.instanceId, ctx, "player", rng); } });
  }
  let playerTurn = player.length === enemy.length ? rng() >= .5 : player.length > enemy.length;
  let pc = 0, ec = 0, safety = 0;
  while (player.length && enemy.length && safety++ < 240) {
    const attackers = playerTurn ? player : enemy, defenders = playerTurn ? enemy : player;
    let cursor = playerTurn ? pc : ec;
    if (!attackers.length || !defenders.length) break;
    const attacker = attackers[cursor % attackers.length];
    if (attacker?.attack > 0) {
      const count = attacker.keywords.includes("WINDFURY") ? 2 : 1;
      for (let i = 0; i < count && attackers.some((item) => item.instanceId === attacker.instanceId) && defenders.length; i += 1) performAttack(attackers, defenders, attacker.instanceId, ctx, playerTurn ? "player" : "enemy", rng);
    }
    if (playerTurn) pc += 1; else ec += 1;
    playerTurn = !playerTurn;
  }
  return {
    winner: player.length && !enemy.length ? "player" : enemy.length && !player.length ? "enemy" : "tie",
    playerBoard: player, enemyBoard: enemy, log: ctx.log, frames: ctx.frames,
    rewards: ctx.rewards, persistentBuffs: ctx.persistentBuffs,
    insights: buildBattleInsights(ctx.log, player, enemy),
  };
}

function buildBattleInsights(log, player, enemy) {
  const insights = [];
  const summons = log.filter((entry) => entry.summon).length;
  const reborns = log.filter((entry) => entry.summon?.includes("复生")).length;
  const shieldBlocks = log.filter((entry) => entry.shieldBroken).length;
  if (summons) insights.push(`亡语与召唤共补充了${summons}个战力单位`);
  if (reborns) insights.push(`${reborns}次复生改变了场面数量`);
  if (shieldBlocks) insights.push(`圣盾抵挡了${shieldBlocks}轮关键伤害`);
  const playerPower = boardPower(player), enemyPower = boardPower(enemy);
  if (playerPower !== enemyPower) insights.push(`${playerPower > enemyPower ? "我方" : "敌方"}残局战力领先${Math.abs(playerPower - enemyPower)}点`);
  if (!insights.length) insights.push("胜负主要由基础属性与攻击顺序决定");
  return insights.slice(0, 3);
}

function performAttack(attackers, defenders, attackerId, ctx, side, rng) {
  const attacker = attackers.find((item) => item.instanceId === attackerId);
  if (!attacker || !defenders.length) return;
  const visible = defenders.some((item) => !item.keywords.includes("STEALTH")) ? defenders.filter((item) => !item.keywords.includes("STEALTH")) : defenders;
  const taunts = visible.filter((item) => item.keywords.includes("TAUNT"));
  const target = randomItem(taunts.length ? taunts : visible, rng);
  attacker.keywords = attacker.keywords.filter((key) => key !== "STEALTH");
  if (attacker.rally === "BG25_016") target.keywords = target.keywords.filter((key) => key !== "REBORN" && key !== "TAUNT");
  attackers.filter((item) => hasScript(item, "ROARING_RECRUITER") && item.instanceId !== attacker.instanceId && hasTribe(attacker, "DRAGON")).forEach((source) => combatBuff(attacker, source.golden ? 6 : 3, source.golden ? 2 : 1, ctx, side));
  const targetSide = side === "player" ? "enemy" : "player";
  const dealt = hit(target, attacker.attack);
  const returned = attacker.keywords.includes("ATTACK_IMMUNE") ? { damage: 0, shieldBroken: false, immune: true } : hit(attacker, target.attack);
  if (attacker.keywords.includes("VENOMOUS") && dealt.damage > 0) { target.health = 0; attacker.keywords = attacker.keywords.filter((key) => key !== "VENOMOUS"); }
  if (target.keywords.includes("VENOMOUS") && returned.damage > 0) { attacker.health = 0; target.keywords = target.keywords.filter((key) => key !== "VENOMOUS"); }
  target.killedById = attacker.instanceId; attacker.killedById = target.instanceId;
  const attackEvent = {
    type: "attack", attackerSide: side, attackerId: attacker.instanceId,
    targetSide, targetId: target.instanceId, damageToTarget: dealt.damage,
    damageToAttacker: returned.damage, targetShieldBroken: dealt.shieldBroken,
    attackerShieldBroken: returned.shieldBroken, attackerImmune: returned.immune || false,
  };
  ctx.log.push({ side, attacker: attacker.name, target: target.name, attack: dealt.damage, counter: returned.damage, shieldBroken: dealt.shieldBroken || returned.shieldBroken });
  snapshotFrame(ctx, `${attacker.name}攻击${target.name}`, attackEvent);
  const logStart = ctx.log.length;
  triggerCombatRally(attacker, attackers, target, ctx, side, rng);
  const rallyTriggers = ctx.log.slice(logStart).map((entry) => entry.summon ? `召唤${entry.summon}` : null).filter(Boolean);
  if (attacker.rally) snapshotFrame(ctx, rallyTriggers[0] || `${attacker.name}触发进击`, {
    type: "rally", triggers: rallyTriggers, attackerSide: side, attackerId: attacker.instanceId,
  });
  attackers.filter((item) => hasScript(item, "BG33_430") && item.instanceId !== attacker.instanceId).forEach((item) => combatBuff(attacker, 1, 1, ctx, side));
  if (hasTribe(attacker, "BEAST")) attackers.filter((item) => hasScript(item, "BG36_211")).forEach((item) => attackers.filter((beast) => hasTribe(beast, "BEAST")).forEach((beast) => combatBuff(beast, item.golden ? 4 : 2, item.golden ? 2 : 1, ctx, side)));
  attackers.filter((item) => hasScript(item, "BG36_209")).forEach((item) => { const reward = ctx.rewards[side].modifiers; reward.beetleAttack = (reward.beetleAttack || 0) + (item.golden ? 10 : 5); reward.beetleHealth = (reward.beetleHealth || 0) + (item.golden ? 10 : 5); });
  processDeaths(attackers, defenders, ctx, side, rng); processDeaths(defenders, attackers, ctx, side === "player" ? "enemy" : "player", rng);
  const triggers = ctx.log.slice(logStart).map((entry) => entry.death ? `${entry.death}阵亡` : entry.summon ? `召唤${entry.summon}` : null).filter(Boolean);
  snapshotFrame(ctx, triggers[0] || `${attacker.name}完成攻击`, { type: "resolve", triggers, attackerSide: side, attackerId: attacker.instanceId });
}

function hit(target, amount) {
  if (target.shield && amount > 0) {
    target.shield = false; target.keywords = target.keywords.filter((key) => key !== "DIVINE_SHIELD");
    return { damage: 0, shieldBroken: true };
  }
  target.health -= amount; return { damage: amount, shieldBroken: false };
}

function triggerCombatRally(source, board, target, ctx, side, rng) {
  if (!source.rally) return;
  const mult = source.golden ? 2 : 1;
  const reward = ctx.rewards[side];
  if (source.rally === "SELF_ATTACK_2") combatBuff(source, 2 * mult, 0, ctx, side);
  else if (source.rally === "UNDEAD_ATTACK") reward.modifiers.undeadAttack = (reward.modifiers.undeadAttack || 0) + mult;
  else if (source.rally === "SPELL_HEALTH") reward.modifiers.spellHealth = (reward.modifiers.spellHealth || 0) + mult;
  else if (source.rally === "GET_CHROMATIC") for (let i = 0; i < mult; i += 1) reward.cards.push({ type: "CHROMATIC" });
  else if (source.rally === "MIGHTY_BREATH") {
    for (let repeat = 0; repeat < mult; repeat += 1) board.forEach((item) => {
      combatBuff(item, 2, 1, ctx, side); if (hasTribe(item, "DRAGON")) combatBuff(item, 2, 1, ctx, side); if (item.shield) combatBuff(item, 2, 1, ctx, side);
    });
  } else if (source.rally === "BG33_886") combatBuff(source, mult, mult, ctx, side);
  else if (source.rally === "BG20_101") reward.cards.push({ type: "SPELL", id: "BG20_GEM" });
  else if (source.rally === "BG20_104") board.filter((item) => item.instanceId !== source.instanceId).forEach((item) => combatBuff(item, mult, mult, ctx, side));
  else if (source.rally === "BG33_883") combatBuff(source, 3 * mult, 3 * mult, ctx, side);
  else if (source.rally === "BG33_885") { reward.modifiers.bloodGemAttack = (reward.modifiers.bloodGemAttack || 0) + mult; reward.modifiers.bloodGemHealth = (reward.modifiers.bloodGemHealth || 0) + mult; }
  else if (source.rally === "BG36_207") board.filter((item) => item.instanceId !== source.instanceId).forEach((item) => combatBuff(item, 4 * mult, mult, ctx, side));
  else if (source.rally === "BG36_200") for (let i = 0; i < mult && board.length < MAX_BOARD; i += 1) combatSummon(board, createMinion(TOKENS.small_beast), board.indexOf(source) + 1 + i, ctx, side);
  else if (source.rally === "BG36_210") for (let i = 0; i < mult && board.length < MAX_BOARD; i += 1) combatSummon(board, createMinion(BEASTS.find((item) => item.id === "BG36_202")), board.length, ctx, side);
  else if (source.rally === "BG34_604" && target) combatBuff(source, target.attack * mult, 0, ctx, side);
}

function combatSummon(board, minion, index, ctx, side) {
  board.splice(Math.min(index, board.length), 0, minion);
  if (hasTribe(minion, "MECHANICAL")) board.filter((item) => hasScript(item, "BGS_071")).forEach((item) => { combatBuff(item, item.golden ? 4 : 2, 0, ctx, side); combatKeyword(item, "DIVINE_SHIELD", ctx, side); });
  if (hasTribe(minion, "BEAST")) {
    board.filter((item) => hasScript(item, "BG26_802")).forEach(() => { minion.attack *= 2; });
    board.filter((item) => hasScript(item, "BG35_602")).forEach((item) => combatBuff(minion, (item.beastSummonAttack || 2) * (item.golden ? 2 : 1), 0, ctx, side));
  }
  if (minion.baseId === "BG_TTN_401") ctx.rewards[side].modifiers.automatonSummons = (ctx.rewards[side].modifiers.automatonSummons || 0) + 1;
  ctx.log.push({ side, summon: minion.name });
}

function processDeaths(board, opposing, ctx, side, rng) {
  let found = true, safety = 0;
  while (found && safety++ < 80) {
    found = false;
    for (let index = 0; index < board.length; index += 1) {
      const dead = board[index];
      if (dead.health > 0) continue;
      board.splice(index, 1); found = true; ctx.log.push({ side, death: dead.name });
      if (hasTribe(dead, "MECHANICAL")) ctx.deadMechs[side].push(dead.baseId);
      board.filter((item) => hasScript(item, "ROTTING_GNOLL")).forEach((item) => combatBuff(item, item.golden ? 2 : 1, 0, ctx, side));
      board.forEach((item) => handleAvenge(item, ctx, side, rng));
      if (hasScript(dead, "ETERNAL_KNIGHT")) ctx.rewards[side].modifiers.eternalDeaths = (ctx.rewards[side].modifiers.eternalDeaths || 0) + 1;
      triggerCombatDeathrattle(dead, board, ctx, side, index, rng);
      if (dead.keywords.includes("REBORN") && !dead.rebornUsed && board.length < MAX_BOARD) {
        const rebornKeywords = [...(dead.rebornKeywords || dead.keywords)].filter((key) => key !== "REBORN");
        const reborn = {
          ...clone(dead), instanceId: `${dead.baseId}-${instanceSeed++}`,
          attack: dead.rebornAttack ?? dead.attack, health: 1, maxHealth: 1,
          keywords: rebornKeywords, shield: rebornKeywords.includes("DIVINE_SHIELD"),
          rebornUsed: true, avengeProgress: 0,
        };
        combatSummon(board, reborn, index, ctx, side);
        ctx.log.push({ side, summon: `${reborn.name}（复生）`, keyword: "REBORN", instanceId: reborn.instanceId });
        board.filter((item) => hasScript(item, "BANSHEE_REBORN")).forEach((item) => { combatBuff(item, item.golden ? 14 : 7, item.golden ? 14 : 7, ctx, side); combatKeyword(item, "DIVINE_SHIELD", ctx, side); });
        board.filter((item) => hasScript(item, "FASHION_PHANTOM")).forEach((item) => {
          const target = [...board].reverse().find((candidate) => hasTribe(candidate, "UNDEAD"));
          if (target) combatBuff(target, reborn.attack * (item.golden ? 2 : 1), reborn.attack * (item.golden ? 2 : 1), ctx, side);
        });
        snapshotFrame(ctx, `${reborn.name}触发复生`, { type: "reborn", side, minionId: reborn.instanceId, keyword: "REBORN" });
      }
      break;
    }
  }
}

function handleAvenge(source, ctx, side, rng) {
  if (!source.avenge) return;
  source.avengeProgress = (source.avengeProgress || 0) + 1;
  if (source.avengeProgress < source.avenge.count) return;
  source.avengeProgress = 0;
  const times = source.golden ? 2 : 1;
  for (let i = 0; i < times; i += 1) {
    if (source.avenge.rewardSpell) ctx.rewards[side].cards.push({ type: "SPELL", id: source.avenge.rewardSpell });
    if (source.avenge.storeRandomTribe) {
      const definition = randomItem(UNDEAD, rng); source.storedSummon = definition?.id; ctx.rewards[side].cards.push({ type: "MINION", id: definition?.id });
    }
  }
}

function triggerCombatDeathrattle(dead, board, ctx, side, index, rng) {
  const dr = dead.deathrattle;
  if (!dr) return;
  const repeats = (dead.golden ? 2 : 1) * (board.some((item) => hasScript(item, "DOUBLE_DEATHRATTLES")) ? 2 : 1);
  for (let repeat = 0; repeat < repeats; repeat += 1) {
    if (dr.summon) for (let i = 0; i < dr.count && board.length < MAX_BOARD; i += 1) combatSummon(board, createMinion(TOKENS[dr.summon]), index + i, ctx, side);
    if (dr.summonStored && dead.storedSummon && board.length < MAX_BOARD) { const def = UNDEAD.find((item) => item.id === dead.storedSummon); if (def) board.splice(index, 0, createMinion(def)); }
    if (dr.buffRandomTribe) { const target = randomItem(board.filter((item) => hasTribe(item, dr.buffRandomTribe)), rng); if (target) combatBuff(target, dr.attack, dr.health, ctx, side); }
    if (dr.grantRebornRandom) { const target = randomItem(board.filter((item) => hasTribe(item, "UNDEAD") && !item.keywords.includes("REBORN")), rng); if (target) combatKeyword(target, "REBORN", ctx, side); }
    if (dr.modifier) ctx.rewards[side].modifiers[dr.modifier] = (ctx.rewards[side].modifiers[dr.modifier] || 0) + dr.amount;
    if (dr.rewardSpell) ctx.rewards[side].cards.push({ type: "SPELL", id: dr.rewardSpell });
    if (dr.rewardChromatic) ctx.rewards[side].cards.push({ type: "CHROMATIC" });
    if (dr.script === "BG29_611" && board.length < MAX_BOARD) combatSummon(board, createMinion(TOKENS.microbot), index, ctx, side);
    if (dr.script === "BG32_170") ctx.rewards[side].cards.push({ type: "SPELL", id: SPELLS.find((item) => item.script === "SHARP_ARROW")?.id });
    if (dr.script === "BG36_854") ctx.rewards[side].cards.push({ type: "SPELL", id: SPELLS.find((item) => item.script === "REPAIR_JOB")?.id });
    if (dr.script === "BG32_172" && board.length < MAX_BOARD) combatSummon(board, createMinion(MECHS.find((item) => item.id === "BG_TTN_401")), index, ctx, side);
    if (dr.script === "BG26_148") ctx.rewards[side].cards.push({ type: "MINION", id: randomItem(MECHS.filter((item) => item.keywords?.includes("MAGNETIC")), rng)?.id });
    if (dr.script === "BG34_856") (ctx.rewards[side].modifiers.refreshBuffs ||= []).push({ attack: 4, health: 4 });
    if (dr.script === "BG32_842") ctx.rewards[side].modifiers.elementalHealth = (ctx.rewards[side].modifiers.elementalHealth || 0) + 2;
    if (dr.script === "BG26_162") ctx.rewards[side].modifiers.elementalAttack = (ctx.rewards[side].modifiers.elementalAttack || 0) + 8;
    if (dr.script === "BGS_121") ctx.rewards[side].cards.push({ type: "MINION", id: randomItem(ELEMENTALS, rng)?.id });
    if (dr.script === "BG34_682") ctx.rewards[side].cards.push({ type: "SPELL", id: "BG34_689" });
    if (dr.script === "BG23_017") { ctx.rewards[side].modifiers.bloodGemAttack = (ctx.rewards[side].modifiers.bloodGemAttack || 0) + 1; ctx.rewards[side].modifiers.bloodGemHealth = (ctx.rewards[side].modifiers.bloodGemHealth || 0) + 1; }
    if (["BG31_803", "BG31_801", "BG31_809", "BG36_209"].includes(dr.script) && board.length < MAX_BOARD) combatSummon(board, createMinion(TOKENS.beetle), index, ctx, side);
    if (dr.script === "BG31_809") { ctx.rewards[side].modifiers.beetleAttack = (ctx.rewards[side].modifiers.beetleAttack || 0) + 5; ctx.rewards[side].modifiers.beetleHealth = (ctx.rewards[side].modifiers.beetleHealth || 0) + 5; }
    if (dr.script === "BG25_806" && board.length < MAX_BOARD) { const beast = createMinion(randomItem(BEASTS, rng)); beast.attack = 6; beast.health = 6; beast.maxHealth = 6; combatSummon(board, beast, index, ctx, side); }
    if (dr.script === "BG36_202") { const beast = randomItem(board.filter((item) => hasTribe(item, "BEAST")), rng); if (beast) combatBuff(beast, 1, 1, ctx, side); ctx.rewards[side].modifiers.lobsterBuff = (ctx.rewards[side].modifiers.lobsterBuff || 0) + 1; }
    if (dr.script === "BG35_604") for (let i = 0; i < 2 && board.length < MAX_BOARD; i += 1) combatSummon(board, createMinion(TOKENS.sewer_rat), index + i, ctx, side);
    if (dr.script === "BGS_018") board.filter((item) => hasTribe(item, "BEAST")).forEach((item) => combatBuff(item, 8, 8, ctx, side));
    if (dr.script === "BGS_012") ctx.deadMechs[side].slice(0, 2).forEach((id, offset) => { const def = MINIONS.find((item) => item.id === id); if (def && board.length < MAX_BOARD) combatSummon(board, createMinion(def), index + offset, ctx, side); });
    if (dr.script === "BG23_318") { const killer = ctx.sides[side === "player" ? "enemy" : "player"].find((item) => item.instanceId === dead.killedById); if (killer) killer.health = 0; }
    ctx.rewards[side].modifiers.mechDeathrattles = (ctx.rewards[side].modifiers.mechDeathrattles || 0) + 1;
  }
}

function applyCombatRewards(game, rewards, persistent) {
  ensureModifiers(game.player);
  Object.entries(rewards.modifiers).forEach(([key, amount]) => {
    if (Array.isArray(amount)) game.player.modifiers[key].push(...amount);
    else game.player.modifiers[key] = (game.player.modifiers[key] || 0) + amount;
    if (key === "undeadAttack") game.player.board.filter((item) => hasTribe(item, "UNDEAD")).forEach((item) => buffRebornBase(item, amount));
  });
  rewards.cards.forEach((reward) => {
    if (reward.type === "SPELL") addCardToHand(game, SPELLS.find((item) => item.id === reward.id));
    else if (reward.type === "CHROMATIC") addCardToHand(game, randomItem(CHROMATICS));
    else if (reward.type === "MINION") addCardToHand(game, MINIONS.find((item) => item.id === reward.id));
  });
  Object.entries(persistent).forEach(([instanceId, change]) => {
    const target = game.player.board.find((item) => item.instanceId === instanceId);
    if (!target) return;
    buff(target, change.attack, change.health); change.keywords.forEach((key) => addKeyword(target, key));
  });
}

function applyBotCombatRewards(bot, rewards, persistent) {
  ensureModifiers(bot);
  Object.entries(rewards.modifiers).forEach(([key, amount]) => {
    if (Array.isArray(amount)) bot.modifiers[key].push(...amount);
    else bot.modifiers[key] = (bot.modifiers[key] || 0) + amount;
    if (key === "undeadAttack") bot.board.filter((item) => hasTribe(item, "UNDEAD")).forEach((item) => buffRebornBase(item, amount));
  });
  rewards.cards.forEach((reward) => {
    if (reward.type === "SPELL") botAddToHand(bot, SPELLS.find((item) => item.id === reward.id));
    else if (reward.type === "CHROMATIC") botAddToHand(bot, randomItem(CHROMATICS));
    else if (reward.type === "MINION") botAddToHand(bot, MINIONS.find((item) => item.id === reward.id));
  });
  Object.entries(persistent).forEach(([instanceId, change]) => {
    const target = bot.board.find((item) => item.instanceId === instanceId);
    if (!target) return;
    buff(target, change.attack, change.health); change.keywords.forEach((key) => addKeyword(target, key));
  });
}

function resolvePlayerBattle(game, opponent, result) {
  if (result.winner === "player") {
    const damage = Math.max(1, Math.min(10, game.player.tier + Math.ceil(result.playerBoard.reduce((sum, item) => sum + (item.tier || 1), 0) * .45)));
    opponent.health -= damage; opponent.losses = (opponent.losses || 0) + 1; game.stats.wins += 1; game.battle.damage = damage; message(game, `战斗胜利，对${opponent.name}造成${damage}点伤害。`);
  } else if (result.winner === "enemy") {
    const damage = Math.max(1, Math.min(10, opponent.tier + Math.ceil(result.enemyBoard.reduce((sum, item) => sum + (item.tier || 1), 0) * .45)));
    const absorbed = Math.min(game.player.armor || 0, damage);
    game.player.armor = Math.max(0, (game.player.armor || 0) - absorbed);
    game.player.health -= damage - absorbed; opponent.wins = (opponent.wins || 0) + 1; game.stats.losses += 1; game.battle.damage = damage;
    message(game, `战斗失败，受到${damage}点伤害${absorbed ? `（护甲吸收${absorbed}点）` : ""}。`);
  } else { game.battle.damage = 0; message(game, "双方战平。"); }
  game.player.health = Math.max(0, game.player.health); opponent.health = Math.max(0, opponent.health);
  game.player.alive = game.player.health > 0; opponent.alive = opponent.health > 0;
}

function botDecision(bot, text) {
  bot.decisions.unshift(text); bot.decisions = bot.decisions.slice(0, 8);
}

function botCardScore(card, bot) {
  if (!card) return -Infinity;
  if (card.kind === "CHOICE") return card.id === "LATER" ? 8 : 9;
  if (card.kind === "SPELL") return 9 + card.tier * 1.8 - card.cost + (card.targeted && !bot.board.length ? -20 : 0);
  const tribe = card.tribe || card.tribes?.[0];
  const matching = bot.board.filter((item) => hasTribe(item, tribe)).length;
  const pairs = [...bot.board, ...bot.hand].filter((item) => item.kind === "MINION" && item.baseId === card.baseId && !item.golden).length;
  const preferred = bot.archetype === "MIXED" || hasTribe(card, bot.archetype) || tribe === "NEUTRAL";
  const mechanics = (card.deathrattle ? 3 : 0) + (card.battlecry ? 2 : 0) + (card.rally ? 2 : 0) + (card.keywords?.length || 0) * 1.5;
  return card.attack + card.health + card.tier * 2.2 + matching * 2.5 + pairs * 9 + mechanics + (preferred ? 7 : -8);
}

function fillBotShop(bot, rng) {
  bot.shop = buildShop(bot, rng);
}

function botAddToHand(bot, definition, golden = false) {
  if (!definition || bot.hand.length >= MAX_HAND) return false;
  bot.hand.push(definition.kind === "SPELL" ? createSpell(definition) : createMinion(definition, golden, bot.modifiers));
  return true;
}

function checkBotTriples(bot, baseId, rng) {
  const copies = [...bot.board, ...bot.hand].filter((item) => item.kind === "MINION" && item.baseId === baseId && !item.golden);
  if (copies.length < 3) return false;
  const definition = [...MINIONS, ...CHROMATICS].find((item) => item.id === baseId);
  if (!definition) return false;
  const ids = new Set(copies.slice(0, 3).map((item) => item.instanceId));
  bot.board = bot.board.filter((item) => !ids.has(item.instanceId));
  bot.hand = bot.hand.filter((item) => !ids.has(item.instanceId));
  bot.hand.push(createGoldenFromCopies(definition, copies.slice(0, 3), bot.modifiers));
  const discoveries = shuffle(MINIONS.filter((item) => item.tier === Math.min(6, bot.tier + 1)), rng).slice(0, 3);
  const discovered = [...discoveries].sort((a, b) => botCardScore(b, bot) - botCardScore(a, bot))[0];
  botAddToHand(bot, discovered);
  bot.economy.triples += 1; botDecision(bot, `三连合成金色${definition.name}`);
  return true;
}

function botTriggerBattlecry(bot, source, rng) {
  if (!source.battlecry) return;
  const repeats = bot.board.some((item) => hasScript(item, "DOUBLE_BATTLECRIES")) ? 2 : 1;
  for (let loop = 0; loop < repeats; loop += 1) {
    const mult = source.golden ? 2 : 1;
    const otherDragons = bot.board.filter((item) => item.instanceId !== source.instanceId && hasTribe(item, "DRAGON"));
    if (source.battlecry === "NERUBIAN_DEATHSWARM") {
      bot.modifiers.undeadAttack += mult; bot.board.filter((item) => hasTribe(item, "UNDEAD")).forEach((item) => buffRebornBase(item, mult));
    } else if (source.battlecry === "SYNTHESIZER") otherDragons.forEach((item) => buff(item, mult, mult));
    else if (source.battlecry === "GET_RING") botAddToHand(bot, SPELLS.find((item) => item.id === "BG28_168"));
    else if (source.battlecry === "GET_CHROMATIC") botAddToHand(bot, randomItem(CHROMATICS, rng));
    else if (source.battlecry === "GET_RANDOM_SPELL") botAddToHand(bot, randomItem(SPELLS.filter((item) => item.pool && item.cost === 2), rng));
    else if (source.battlecry === "SPELL_HEALTH") bot.modifiers.spellHealth += mult;
    else if (source.battlecry === "SPELL_ATTACK") bot.modifiers.spellAttack += mult;
    else if (source.battlecry === "GREEN_CHROMATIC") otherDragons.forEach((item) => buff(item, mult, 3 * mult));
    else if (source.battlecry === "BRONZE_CHROMATIC") otherDragons.forEach((item) => buff(item, 3 * mult, mult));
  }
  bot.board.filter((item) => hasScript(item, "KALECGOS")).forEach((kalecgos) => {
    const amount = kalecgos.golden ? 4 : 2;
    bot.board.filter((item) => hasTribe(item, "DRAGON")).forEach((item) => buff(item, amount, amount));
  });
}

function botPlayMinion(bot, card, rng) {
  const index = bot.hand.findIndex((item) => item.instanceId === card.instanceId);
  if (index < 0) return false;
  if (bot.board.length >= MAX_BOARD) {
    const weakest = [...bot.board].sort((a, b) => botCardScore(a, bot) - botCardScore(b, bot))[0];
    if (botCardScore(card, bot) <= botCardScore(weakest, bot) + 2) return false;
    bot.board.splice(bot.board.indexOf(weakest), 1); bot.gold += 1; bot.economy.sales += 1;
    botDecision(bot, `出售${weakest.name}`);
  }
  bot.hand.splice(index, 1); bot.board.push(card); botTriggerBattlecry(bot, card, rng);
  return true;
}

function botCastSpell(bot, spell, rng, round) {
  const game = { player: bot, round, phase: "SHOP", pendingDiscover: null, pendingAction: null, messages: [], stats: { spells: 0 } };
  const targets = validTargets(game, spell, spell.targeted);
  if (spell.targeted && !targets.length) return false;
  const target = [...targets].sort((a, b) => botCardScore(b, bot) - botCardScore(a, bot))[0] || null;
  applySpell(game, spell, target, rng); onSpellCast(game);
  let guard = 0;
  while (game.pendingDiscover && guard++ < 3) {
    const pending = Array.isArray(game.pendingDiscover) ? { items: game.pendingDiscover } : game.pendingDiscover;
    const pick = [...pending.items].sort((a, b) => botCardScore(b, bot) - botCardScore(a, bot))[0];
    if (!pick || !chooseDiscover(game, pick.id, rng)) break;
  }
  return true;
}

function botPositionBoard(bot) {
  const priority = (item) => {
    if (item.keywords.includes("TAUNT")) return -30;
    if (item.deathrattle) return -18;
    if (item.keywords.includes("ATTACK_IMMUNE")) return -10;
    if (hasScript(item, "DOUBLE_DEATHRATTLES") || hasScript(item, "KALECGOS") || hasScript(item, "DOUBLE_END_TURN")) return 25;
    return -item.attack * .1;
  };
  bot.board.sort((a, b) => priority(a) - priority(b));
}

function applyBotEndTurn(bot, rng) {
  const repeats = bot.board.some((item) => hasScript(item, "DOUBLE_END_TURN")) ? 2 : 1;
  for (let loop = 0; loop < repeats; loop += 1) [...bot.board].forEach((source) => {
    const mult = source.golden ? 2 : 1;
    if (source.endTurn === "SPELL_BONUS") { bot.modifiers.spellAttack += mult; bot.modifiers.spellHealth += mult; }
    if (source.endTurn === "GET_TWO_SPELLS") for (let index = 0; index < 2 * mult; index += 1) botAddToHand(bot, randomItem(SPELLS.filter((item) => item.pool), rng));
  });
}

function upgradeBotTavern(bot, rng) {
  if (bot.tier >= 6 || bot.gold < bot.upgradeCost) return false;
  bot.gold -= bot.upgradeCost;
  bot.tier += 1;
  bot.upgradeCost = UPGRADE_BASE_COST[bot.tier] ?? 0;
  bot.economy.upgrades += 1;
  bot.upgradeScaling = (bot.upgradeScaling || 0) + 1;
  bot.modifiers.shopAttack += 2;
  bot.modifiers.shopHealth += 2;
  bot.board.forEach((minion) => buff(minion, 2, 2));
  botDecision(bot, `升级到${bot.tier}级酒馆，战队获得+2/+2`);
  fillBotShop(bot, rng);
  return true;
}

function botFundUpgradeReplacement(bot) {
  if (bot.gold !== 2 || bot.board.length < 3) return false;
  const candidate = [...bot.shop].filter((item) => item.kind === "MINION").sort((a, b) => botCardScore(b, bot) - botCardScore(a, bot))[0];
  const weakest = [...bot.board].sort((a, b) => botCardScore(a, bot) - botCardScore(b, bot))[0];
  if (!candidate || !weakest || botCardScore(candidate, bot) <= botCardScore(weakest, bot) + 3) return false;
  bot.board.splice(bot.board.indexOf(weakest), 1);
  bot.gold += 1;
  bot.economy.sales += 1;
  botDecision(bot, `出售${weakest.name}，为高阶随从腾出金币`);
  return true;
}

function recruitBot(bot, round, rng) {
  bot.gold = Math.min(bot.goldCap || 10, round + 2 + (bot.nextTurnGold || 0)); bot.nextTurnGold = 0; bot.decisions = [];
  fillBotShop(bot, rng);
  const desiredTier = Math.min(6, 1 + Math.floor(round / 2));
  if (bot.tier < desiredTier) upgradeBotTavern(bot, rng);
  let guard = 0, refreshes = 0;
  while (guard++ < 18) {
    [...bot.hand].filter((item) => item.kind === "SPELL").forEach((spell) => {
      if (botCastSpell(bot, spell, rng, round)) bot.hand.splice(bot.hand.indexOf(spell), 1);
    });
    [...bot.hand].filter((item) => item.kind === "MINION").sort((a, b) => botCardScore(b, bot) - botCardScore(a, bot)).forEach((card) => botPlayMinion(bot, card, rng));
    botFundUpgradeReplacement(bot);
    if (bot.gold < 1 || bot.hand.length >= MAX_HAND) break;
    const affordable = bot.shop.filter((item) => item.healthCost ? bot.health > item.cost : bot.gold >= (item.kind === "SPELL" ? item.cost : 3));
    const choice = [...affordable].sort((a, b) => botCardScore(b, bot) - botCardScore(a, bot))[0];
    const weakest = [...bot.board].sort((a, b) => botCardScore(a, bot) - botCardScore(b, bot))[0];
    const useful = choice?.kind === "SPELL" || bot.board.length < MAX_BOARD || !weakest || botCardScore(choice, bot) > botCardScore(weakest, bot) + 2 || [...bot.board, ...bot.hand].some((item) => item.baseId === choice?.baseId);
    if (!choice || !useful) {
      if (bot.gold < 1 || refreshes++ >= 2) break;
      bot.gold -= 1; bot.economy.refreshes += 1; botDecision(bot, "刷新酒馆"); fillBotShop(bot, rng); continue;
    }
    bot.shop.splice(bot.shop.indexOf(choice), 1);
    if (choice.healthCost) bot.health -= choice.cost; else bot.gold -= choice.kind === "SPELL" ? choice.cost : 3;
    bot.hand.push(choice);
    bot.economy.buys += 1; botDecision(bot, `购买${choice.name}`); if (choice.kind === "MINION") checkBotTriples(bot, choice.baseId, rng);
  }
  [...bot.hand].filter((item) => item.kind === "MINION").sort((a, b) => botCardScore(b, bot) - botCardScore(a, bot)).forEach((card) => botPlayMinion(bot, card, rng));
  applyBotEndTurn(bot, rng); botPositionBoard(bot);
}

function resolveBotBattles(game, excluded, rng) {
  const bots = shuffle(game.bots.filter((item) => item.alive && item.id !== excluded), rng);
  for (let i = 0; i + 1 < bots.length; i += 2) {
    const a = bots[i], b = bots[i + 1], pa = boardPower(a.board) * (.9 + rng() * .2), pb = boardPower(b.board) * (.9 + rng() * .2);
    const loser = pa >= pb ? b : a, winner = loser === a ? b : a;
    loser.health = Math.max(0, loser.health - Math.max(1, winner.tier + Math.round((boardPower(winner.board) - boardPower(loser.board)) / 15)));
    winner.wins = (winner.wins || 0) + 1; loser.losses = (loser.losses || 0) + 1;
    loser.alive = loser.health > 0;
  }
}

const boardPower = (board) => board.reduce((sum, item) => sum + item.attack + item.health + item.keywords.length * 2, 0);

export function advanceRound(game, rng = Math.random) {
  if (game.phase !== "COMBAT") return false;
  if (!game.player.alive || game.round >= game.maxRounds) { game.phase = "GAME_OVER"; return true; }
  game.round += 1; game.phase = "SHOP"; game.battle = null;
  const result = game.player.lastBattleResult;
  const wagerGold = (game.player.pendingOverconfidence || 0) * (result === "WIN" ? 3 : result === "TIE" ? 1 : 0);
  game.player.gold = Math.min(game.player.goldCap || 10, game.round + 2 + (game.player.nextTurnGold || 0) + wagerGold);
  game.player.nextTurnGold = 0; game.player.pendingOverconfidence = 0;
  (game.player.scheduledBoardBuffs || []).forEach((entry) => {
    for (let repeat = 0; repeat < entry.repeats; repeat += 1) game.player.board.forEach((item) => spellBuff(game, item, entry.attack, entry.health));
  });
  game.player.scheduledBoardBuffs = [];
  (game.player.pendingBattleBuffs || []).forEach((entry) => {
    if (entry.on !== result) return;
    const target = game.player.board.find((item) => item.instanceId === entry.targetId); if (target) spellBuff(game, target, entry.attack, entry.health);
  });
  game.player.pendingBattleBuffs = [];
  game.player.hand.forEach((item) => { if (item.lockedTurns > 0) item.lockedTurns -= 1; });
  game.player.upgradeCost = game.player.tier < 6 ? Math.max(0, game.player.upgradeCost - 1) : 0;
  game.player.freeRefresh = game.hero.power === "FREE_REFRESH";
  game.player.modifiers.chooseBothUsed = false;
  game.player.board.forEach((item) => {
    item.activatedThisTurn = false;
    if (item.baseId === "BG26_147") gainGold(game.player, item.golden ? 2 : 1);
  });
  fillShop(game, false, rng); game.bots.filter((item) => item.alive).forEach((bot) => {
    bot.upgradeCost = bot.tier < 6 ? Math.max(0, bot.upgradeCost - 1) : 0;
    recruitBot(bot, game.round, rng);
  }); chooseOpponent(game, rng); return true;
}

function chooseOpponent(game, rng) {
  const alive = game.bots.filter((item) => item.alive), choices = alive.filter((item) => item.id !== game.currentOpponent?.id);
  game.currentOpponent = randomItem(choices.length ? choices : alive, rng) || game.bots[0];
}

function addPermanentUndeadAttack(game, amount) {
  game.player.modifiers.undeadAttack += amount;
  game.player.board.filter((item) => hasTribe(item, "UNDEAD")).forEach((item) => buffRebornBase(item, amount));
}

function buff(minion, attack, health) { minion.attack += attack; minion.health += health; minion.maxHealth += health; checkThresholds(minion); }
function buffRebornBase(minion, attack) { minion.rebornAttack = (minion.rebornAttack ?? minion.attack) + attack; buff(minion, attack, 0); }
function addKeyword(minion, keyword) { if (!minion.keywords.includes(keyword)) minion.keywords.push(keyword); }
function checkThresholds(minion) { if (hasScript(minion, "SCARLET_SURVIVOR") && minion.attack >= 6) addKeyword(minion, "DIVINE_SHIELD"); }
function message(game, text) { game.messages.unshift(text); game.messages = game.messages.slice(0, 30); }

function entrantWins(game, entrant) { return entrant.id === "player" ? game.stats?.wins || 0 : entrant.wins || 0; }
export function standings(game) { return [game.player, ...game.bots].sort((a, b) => Number(b.alive) - Number(a.alive) || b.health - a.health || entrantWins(game, b) - entrantWins(game, a) || boardPower(b.board || []) - boardPower(a.board || [])); }
export function playerRank(game) { return standings(game).findIndex((item) => item.id === "player") + 1; }
export function gameResult(game) {
  const rank = playerRank(game);
  const lastBattle = game.player.lastBattleResult === "WIN" ? "胜利" : game.player.lastBattleResult === "LOSS" ? "失败" : "战平";
  const reachedLimit = game.round >= game.maxRounds && game.player.alive;
  const summary = reachedLimit
    ? `第${game.round}回合战斗${lastBattle}；最终按存活状态和剩余生命值排名第${rank}。`
    : !game.player.alive ? `你在第${game.round}回合被淘汰，最终排名第${rank}。` : `你以第${rank}名完成了本局。`;
  return {
    rank, lastBattle, summary,
    title: rank === 1 ? "酒馆冠军" : rank <= 4 ? "成功晋级" : "再试一次",
    rankingRule: "排名优先比较是否存活和剩余生命值；同生命值时比较胜场与阵容战力。",
  };
}
export function canEndTurn(game) { return game.phase === "SHOP" && game.player.board.length > 0 && !game.pendingDiscover && !game.pendingAction; }
