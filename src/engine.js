import {
  BOT_PROFILES, CHROMATICS, DRAGONS, HEROES, MAX_BOARD, MAX_HAND, MAX_ROUNDS,
  MINIONS, SPELLS, TOKENS, UNDEAD, UPGRADE_BASE_COST,
} from "./data.js";

const clone = (value) => value == null ? value : structuredClone(value);
const randomItem = (items, rng = Math.random) => items.length ? items[Math.floor(rng() * items.length)] : null;
const shuffle = (items, rng = Math.random) => [...items].sort(() => rng() - 0.5);
const hasTribe = (minion, tribe) => minion?.tribe === tribe || minion?.tribes?.includes(tribe);
const hasScript = (minion, script) => minion?.scripts?.includes(script);
let instanceSeed = 1;

function baseModifiers() {
  return { undeadAttack: 0, eternalDeaths: 0, spellAttack: 0, spellHealth: 0, fireForged: 0 };
}

export function createMinion(definition, golden = false, modifiers = baseModifiers()) {
  const multiplier = golden ? 2 : 1;
  const minion = {
    ...clone(definition), kind: "MINION", instanceId: `${definition.id}-${instanceSeed++}`,
    baseId: definition.id, golden, attack: definition.attack * multiplier,
    health: definition.health * multiplier, maxHealth: definition.health * multiplier,
    keywords: [...(definition.keywords || [])], magneticCount: 0,
  };
  if (hasTribe(minion, "UNDEAD")) minion.attack += modifiers.undeadAttack || 0;
  if (hasScript(minion, "ETERNAL_KNIGHT")) {
    minion.attack += (modifiers.eternalDeaths || 0) * 4;
    minion.health += (modifiers.eternalDeaths || 0) * 2;
    minion.maxHealth += (modifiers.eternalDeaths || 0) * 2;
  }
  checkThresholds(minion);
  return minion;
}

export function createSpell(definition) {
  return { ...clone(definition), kind: "SPELL", instanceId: `${definition.id}-${instanceSeed++}`, baseId: definition.id };
}

function addCardToHand(game, definition, golden = false) {
  if (!definition || game.player.hand.length >= MAX_HAND) return false;
  game.player.hand.push(definition.kind === "SPELL" ? createSpell(definition) : createMinion(definition, golden, game.player.modifiers));
  return true;
}

export function createGame(heroId, rng = Math.random) {
  const hero = HEROES.find((item) => item.id === heroId) || HEROES[0];
  const bots = BOT_PROFILES.map((profile) => ({
    ...clone(profile), health: 30, alive: true, tier: 1, board: [], hand: [], gold: 3, modifiers: baseModifiers(),
  }));
  const game = {
    version: 2, phase: "SHOP", round: 1, maxRounds: MAX_ROUNDS, hero,
    player: {
      id: "player", name: "你", hero: hero.name, health: 30, alive: true, tier: 1, gold: 3,
      board: [], hand: [], shop: [], frozen: false, freeRefresh: hero.power === "FREE_REFRESH",
      freeRefreshes: 0, heroPowerUsed: false, upgradeCost: UPGRADE_BASE_COST[1], modifiers: baseModifiers(),
    },
    bots, currentOpponent: null, pendingDiscover: null, pendingAction: null, battle: null,
    messages: ["亡灵与龙已加入当前卡池。拖动随从调整站位，点击卡牌执行操作。"],
    stats: { refreshes: 0, triples: 0, wins: 0, losses: 0, spells: 0 },
  };
  bots.forEach((bot) => recruitBot(bot, 1, rng));
  fillShop(game, true, rng);
  chooseOpponent(game, rng);
  return game;
}

export function shopSize(tier) { return [0, 3, 4, 4, 5, 5, 6][tier] || 6; }
const availableMinions = (tier) => MINIONS.filter((minion) => minion.tier <= tier && !minion.token);

export function fillShop(game, forceNew = false, rng = Math.random) {
  const player = game.player;
  if (forceNew || !player.frozen) player.shop = [];
  const pool = availableMinions(player.tier);
  while (player.shop.length < shopSize(player.tier)) player.shop.push(createMinion(randomItem(pool, rng), false, player.modifiers));
  player.frozen = false;
}

export function refreshShop(game, rng = Math.random) {
  if (game.phase !== "SHOP" || game.pendingAction) return false;
  const free = game.player.freeRefresh || game.player.freeRefreshes > 0;
  if (!free && game.player.gold < 1) return false;
  if (game.player.freeRefresh) game.player.freeRefresh = false;
  else if (game.player.freeRefreshes > 0) game.player.freeRefreshes -= 1;
  else game.player.gold -= 1;
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
  if (game.phase !== "SHOP" || game.pendingAction || player.gold < 3 || player.hand.length >= MAX_HAND) return false;
  const index = player.shop.findIndex((item) => item.instanceId === instanceId);
  if (index < 0) return false;
  const [minion] = player.shop.splice(index, 1);
  player.gold -= 3;
  player.hand.push(minion);
  message(game, `购买了${minion.name}。`);
  checkTriples(game, minion.baseId);
  return true;
}

function validTargets(game, card, targetType) {
  const board = game.player.board;
  if (targetType === "ANY_MINION") return board;
  if (targetType === "UNDEAD") return board.filter((item) => hasTribe(item, "UNDEAD"));
  if (targetType === "OTHER_UNDEAD") return board.filter((item) => hasTribe(item, "UNDEAD") && item.instanceId !== card.instanceId);
  if (targetType === "RALLY") return board.filter((item) => item.rally);
  if (targetType === "MAGNETIC") return board.filter((item) => hasTribe(item, "UNDEAD"));
  return [];
}

export function playCard(game, instanceId, targetId = null, forceNormal = false, rng = Math.random) {
  if (game.phase !== "SHOP") return false;
  const card = game.player.hand.find((item) => item.instanceId === instanceId);
  if (!card) return false;
  if (card.kind === "SPELL") return castSpell(game, instanceId, targetId, rng);
  const magnetic = hasScript(card, "MAGNETIC");
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
    mergeMagnetic(target, card);
    message(game, `${card.name}已磁力吸附到${target.name}。`);
    game.pendingAction = null;
    return true;
  }
  if (game.player.board.length >= MAX_BOARD) return false;
  game.player.hand.splice(handIndex, 1);
  game.player.board.push(card);
  triggerBattlecry(game, card, target, rng);
  message(game, `${card.name}加入了战队。`);
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
    case "GET_RANDOM_SPELL": addCardToHand(game, randomItem(SPELLS.filter((item) => item.id !== "BG28_604"), rng)); break;
    case "SPELL_HEALTH": game.player.modifiers.spellHealth += mult; break;
    case "SPELL_ATTACK": game.player.modifiers.spellAttack += mult; break;
    case "GREEN_CHROMATIC": otherDragons.forEach((item) => buff(item, mult, 3 * mult)); break;
    case "BRONZE_CHROMATIC": otherDragons.forEach((item) => buff(item, 3 * mult, mult)); break;
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
  game.player.gold -= source.activateCost;
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
  if (spell.targeted && !targetId && targets.length && !resolving) {
    game.pendingAction = { type: "SPELL", instanceId, validIds: targets.map((item) => item.instanceId) };
    return "PENDING";
  }
  const target = targetId ? targets.find((item) => item.instanceId === targetId) : null;
  if (spell.targeted && !target) return false;
  game.player.hand = game.player.hand.filter((item) => item.instanceId !== instanceId);
  applySpell(game, spell, target, rng);
  game.stats.spells += 1;
  onSpellCast(game);
  message(game, `施放了${spell.name}。`);
  game.pendingAction = null;
  return true;
}

function spellBuff(game, target, attack, health) {
  buff(target, attack + game.player.modifiers.spellAttack, health + game.player.modifiers.spellHealth);
}

function applySpell(game, spell, target, rng) {
  const board = game.player.board;
  switch (spell.script) {
    case "RING": board.forEach((item) => spellBuff(game, item, 1, 1)); break;
    case "SLAUGHTER": if (target) { destroyRecruitMinion(game, target.instanceId, rng); addPermanentUndeadAttack(game, 5); } break;
    case "FORTIFY": if (target) { spellBuff(game, target, 0, 3); addKeyword(target, "TAUNT"); } break;
    case "COIN": game.player.gold += 1; break;
    case "BANANA": if (target) spellBuff(game, target, 2, 2); break;
    case "FREE_REFRESH": game.player.freeRefreshes += 2; break;
    case "MIGHTY_BREATH":
      board.forEach((item) => {
        spellBuff(game, item, 2, 1);
        if (hasTribe(item, "DRAGON")) spellBuff(game, item, 2, 1);
        if (item.keywords.includes("DIVINE_SHIELD")) spellBuff(game, item, 2, 1);
      });
      break;
  }
}

function onSpellCast(game) {
  const board = game.player.board;
  board.filter((item) => hasScript(item, "HOOKTAIL")).forEach((source) => board.forEach((item) => buff(item, source.golden ? 2 : 1, 0)));
  board.filter((item) => hasScript(item, "UNDEAD_SPELL_SCALER")).forEach((source) => addPermanentUndeadAttack(game, source.golden ? 4 : 2));
  board.filter((item) => hasScript(item, "FIRE_FORGED_SCALE")).forEach((source) => { source.fireForgedBonus = (source.fireForgedBonus || 0) + (source.golden ? 2 : 1); });
}

function triggerRecruitRally(game, source, rng) {
  if (!source?.rally) return;
  const mult = source.golden ? 2 : 1;
  if (source.rally === "SELF_ATTACK_2") buff(source, 2 * mult, 0);
  else if (source.rally === "UNDEAD_ATTACK") addPermanentUndeadAttack(game, mult);
  else if (source.rally === "SPELL_HEALTH") game.player.modifiers.spellHealth += mult;
  else if (source.rally === "GET_CHROMATIC") for (let i = 0; i < mult; i += 1) addCardToHand(game, randomItem(CHROMATICS, rng));
  else if (source.rally === "MIGHTY_BREATH") for (let i = 0; i < mult; i += 1) applySpell(game, SPELLS.find((item) => item.id === "BG36_246"), null, rng);
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
  }
}

export function sellMinion(game, instanceId) {
  if (game.phase !== "SHOP" || game.pendingAction) return false;
  const index = game.player.board.findIndex((item) => item.instanceId === instanceId);
  if (index < 0) return false;
  const [minion] = game.player.board.splice(index, 1);
  game.player.gold += 1;
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
  p.gold -= p.upgradeCost; p.tier += 1; p.upgradeCost = UPGRADE_BASE_COST[p.tier] ?? 0;
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

function checkTriples(game, baseId) {
  const copies = [...game.player.board, ...game.player.hand].filter((item) => item.kind === "MINION" && item.baseId === baseId && !item.golden);
  if (copies.length < 3) return;
  const ids = new Set(copies.slice(0, 3).map((item) => item.instanceId));
  const definition = [...MINIONS, ...CHROMATICS].find((item) => item.id === baseId);
  game.player.board = game.player.board.filter((item) => !ids.has(item.instanceId));
  game.player.hand = game.player.hand.filter((item) => !ids.has(item.instanceId));
  addCardToHand(game, definition, true);
  game.pendingDiscover = shuffle(MINIONS.filter((item) => item.tier === Math.min(6, game.player.tier + 1))).slice(0, 3);
  game.stats.triples += 1; message(game, `三连！获得金色${definition.name}。`);
}

export function chooseDiscover(game, baseId) {
  const definition = game.pendingDiscover?.find((item) => item.id === baseId);
  if (!definition || !addCardToHand(game, definition)) return false;
  game.pendingDiscover = null; message(game, `发现了${definition.name}。`); return true;
}

function applyEndTurn(game, rng) {
  const repeats = game.player.board.some((item) => hasScript(item, "DOUBLE_END_TURN")) ? 2 : 1;
  for (let loop = 0; loop < repeats; loop += 1) {
    [...game.player.board].forEach((source) => {
      const mult = source.golden ? 2 : 1;
      if (source.endTurn === "SPELL_BONUS") { game.player.modifiers.spellAttack += mult; game.player.modifiers.spellHealth += mult; }
      if (source.endTurn === "GET_TWO_SPELLS") for (let i = 0; i < 2 * mult; i += 1) addCardToHand(game, randomItem(SPELLS.filter((item) => item.id !== "BG28_604"), rng));
    });
  }
}

export function beginCombat(game, rng = Math.random) {
  if (game.phase !== "SHOP" || !game.player.board.length || game.pendingDiscover || game.pendingAction) return null;
  applyEndTurn(game, rng);
  game.phase = "COMBAT";
  const result = simulateBattle(game.player.board, game.currentOpponent.board, game.hero.power, rng);
  game.battle = { ...result, opponent: clone(game.currentOpponent) };
  applyCombatRewards(game, result.rewards.player, result.persistentBuffs.player);
  resolvePlayerBattle(game, game.currentOpponent, result);
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
    sides: { player: playerBoard, enemy: enemyBoard },
  };
}

function snapshotFrame(ctx, label) {
  ctx.frames.push({ label, player: clone(ctx.sides.player), enemy: clone(ctx.sides.enemy) });
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
    }
  });
}

export function simulateBattle(playerInput, enemyInput, heroPower = null, rng = Math.random) {
  const player = prepareCombatBoard(playerInput), enemy = prepareCombatBoard(enemyInput);
  markRetainers(player); markRetainers(enemy);
  const ctx = combatContext(player, enemy);
  applyCombatStart(player, enemy, ctx, "player", rng); applyCombatStart(enemy, player, ctx, "enemy", rng);
  processDeaths(player, enemy, ctx, "player", rng); processDeaths(enemy, player, ctx, "enemy", rng);
  snapshotFrame(ctx, "战斗开始");
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
  };
}

function performAttack(attackers, defenders, attackerId, ctx, side, rng) {
  const attacker = attackers.find((item) => item.instanceId === attackerId);
  if (!attacker || !defenders.length) return;
  const target = randomItem(defenders.filter((item) => item.keywords.includes("TAUNT")).length ? defenders.filter((item) => item.keywords.includes("TAUNT")) : defenders, rng);
  attackers.filter((item) => hasScript(item, "ROARING_RECRUITER") && item.instanceId !== attacker.instanceId && hasTribe(attacker, "DRAGON")).forEach((source) => combatBuff(attacker, source.golden ? 6 : 3, source.golden ? 2 : 1, ctx, side));
  const dealt = hit(target, attacker.attack);
  const returned = attacker.keywords.includes("ATTACK_IMMUNE") ? 0 : hit(attacker, target.attack);
  ctx.log.push({ side, attacker: attacker.name, target: target.name, attack: dealt, counter: returned });
  triggerCombatRally(attacker, attackers, ctx, side, rng);
  processDeaths(attackers, defenders, ctx, side, rng); processDeaths(defenders, attackers, ctx, side === "player" ? "enemy" : "player", rng);
  snapshotFrame(ctx, `${attacker.name} → ${target.name}`);
}

function hit(target, amount) {
  if (target.shield && amount > 0) { target.shield = false; target.keywords = target.keywords.filter((key) => key !== "DIVINE_SHIELD"); return 0; }
  target.health -= amount; return amount;
}

function triggerCombatRally(source, board, ctx, side, rng) {
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
  }
}

function processDeaths(board, opposing, ctx, side, rng) {
  let found = true, safety = 0;
  while (found && safety++ < 80) {
    found = false;
    for (let index = 0; index < board.length; index += 1) {
      const dead = board[index];
      if (dead.health > 0) continue;
      board.splice(index, 1); found = true; ctx.log.push({ side, death: dead.name });
      board.filter((item) => hasScript(item, "ROTTING_GNOLL")).forEach((item) => combatBuff(item, item.golden ? 2 : 1, 0, ctx, side));
      board.forEach((item) => handleAvenge(item, ctx, side, rng));
      if (hasScript(dead, "ETERNAL_KNIGHT")) ctx.rewards[side].modifiers.eternalDeaths = (ctx.rewards[side].modifiers.eternalDeaths || 0) + 1;
      triggerCombatDeathrattle(dead, board, ctx, side, index, rng);
      if (dead.keywords.includes("REBORN") && !dead.rebornUsed && board.length < MAX_BOARD) {
        const reborn = { ...clone(dead), instanceId: `${dead.baseId}-${instanceSeed++}`, health: 1, maxHealth: 1, shield: false, rebornUsed: true, keywords: dead.keywords.filter((key) => key !== "REBORN") };
        board.splice(Math.min(index, board.length), 0, reborn); ctx.log.push({ side, summon: `${reborn.name}（复生）` });
        board.filter((item) => hasScript(item, "BANSHEE_REBORN")).forEach((item) => { combatBuff(item, item.golden ? 14 : 7, item.golden ? 14 : 7, ctx, side); combatKeyword(item, "DIVINE_SHIELD", ctx, side); });
        board.filter((item) => hasScript(item, "FASHION_PHANTOM")).forEach((item) => {
          const target = [...board].reverse().find((candidate) => hasTribe(candidate, "UNDEAD"));
          if (target) combatBuff(target, reborn.attack * (item.golden ? 2 : 1), reborn.attack * (item.golden ? 2 : 1), ctx, side);
        });
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
    if (dr.summon) for (let i = 0; i < dr.count && board.length < MAX_BOARD; i += 1) { const token = createMinion(TOKENS[dr.summon]); board.splice(index + i, 0, token); ctx.log.push({ side, summon: token.name }); }
    if (dr.summonStored && dead.storedSummon && board.length < MAX_BOARD) { const def = UNDEAD.find((item) => item.id === dead.storedSummon); if (def) board.splice(index, 0, createMinion(def)); }
    if (dr.buffRandomTribe) { const target = randomItem(board.filter((item) => hasTribe(item, dr.buffRandomTribe)), rng); if (target) combatBuff(target, dr.attack, dr.health, ctx, side); }
    if (dr.grantRebornRandom) { const target = randomItem(board.filter((item) => hasTribe(item, "UNDEAD") && !item.keywords.includes("REBORN")), rng); if (target) combatKeyword(target, "REBORN", ctx, side); }
    if (dr.modifier) ctx.rewards[side].modifiers[dr.modifier] = (ctx.rewards[side].modifiers[dr.modifier] || 0) + dr.amount;
    if (dr.rewardSpell) ctx.rewards[side].cards.push({ type: "SPELL", id: dr.rewardSpell });
    if (dr.rewardChromatic) ctx.rewards[side].cards.push({ type: "CHROMATIC" });
  }
}

function applyCombatRewards(game, rewards, persistent) {
  Object.entries(rewards.modifiers).forEach(([key, amount]) => {
    game.player.modifiers[key] = (game.player.modifiers[key] || 0) + amount;
    if (key === "undeadAttack") game.player.board.filter((item) => hasTribe(item, "UNDEAD")).forEach((item) => buff(item, amount, 0));
  });
  rewards.cards.forEach((reward) => {
    if (reward.type === "SPELL") addCardToHand(game, SPELLS.find((item) => item.id === reward.id));
    else if (reward.type === "CHROMATIC") addCardToHand(game, randomItem(CHROMATICS));
    else if (reward.type === "MINION") addCardToHand(game, UNDEAD.find((item) => item.id === reward.id));
  });
  Object.entries(persistent).forEach(([instanceId, change]) => {
    const target = game.player.board.find((item) => item.instanceId === instanceId);
    if (!target) return;
    buff(target, change.attack, change.health); change.keywords.forEach((key) => addKeyword(target, key));
  });
}

function resolvePlayerBattle(game, opponent, result) {
  if (result.winner === "player") {
    const damage = Math.max(1, Math.min(10, game.player.tier + Math.ceil(result.playerBoard.reduce((sum, item) => sum + (item.tier || 1), 0) * .45)));
    opponent.health -= damage; game.stats.wins += 1; game.battle.damage = damage; message(game, `战斗胜利，对${opponent.name}造成${damage}点伤害。`);
  } else if (result.winner === "enemy") {
    const damage = Math.max(1, Math.min(10, opponent.tier + Math.ceil(result.enemyBoard.reduce((sum, item) => sum + (item.tier || 1), 0) * .45)));
    game.player.health -= damage; game.stats.losses += 1; game.battle.damage = damage; message(game, `战斗失败，受到${damage}点伤害。`);
  } else { game.battle.damage = 0; message(game, "双方战平。"); }
  game.player.health = Math.max(0, game.player.health); opponent.health = Math.max(0, opponent.health);
  game.player.alive = game.player.health > 0; opponent.alive = opponent.health > 0;
}

function recruitBot(bot, round, rng) {
  bot.gold = Math.min(10, round + 2);
  if (round > 1 && round % 2 === 1 && bot.tier < 6) bot.tier += 1;
  const pool = MINIONS.filter((item) => item.tier <= bot.tier && (bot.archetype === "MIXED" || hasTribe(item, bot.archetype) || item.tribe === "NEUTRAL"));
  const desired = Math.min(7, Math.ceil(round * .75));
  while (bot.board.length < desired) bot.board.push(createMinion(randomItem(pool, rng), false, bot.modifiers));
  if (bot.board.length >= desired && round > 2) {
    const weakest = [...bot.board].sort((a, b) => a.attack + a.health - b.attack - b.health)[0];
    const candidate = createMinion(randomItem(pool, rng), false, bot.modifiers);
    if (candidate.attack + candidate.health > weakest.attack + weakest.health) bot.board[bot.board.indexOf(weakest)] = candidate;
  }
  if (round >= 4 && bot.board.length) {
    const target = randomItem(bot.board, rng);
    buff(target, 1, 1);
  }
}

function resolveBotBattles(game, excluded, rng) {
  const bots = shuffle(game.bots.filter((item) => item.alive && item.id !== excluded), rng);
  for (let i = 0; i + 1 < bots.length; i += 2) {
    const a = bots[i], b = bots[i + 1], pa = boardPower(a.board) * (.9 + rng() * .2), pb = boardPower(b.board) * (.9 + rng() * .2);
    const loser = pa >= pb ? b : a, winner = loser === a ? b : a;
    loser.health = Math.max(0, loser.health - Math.max(1, winner.tier + Math.round((boardPower(winner.board) - boardPower(loser.board)) / 15)));
    loser.alive = loser.health > 0;
  }
}

const boardPower = (board) => board.reduce((sum, item) => sum + item.attack + item.health + item.keywords.length * 2, 0);

export function advanceRound(game, rng = Math.random) {
  if (game.phase !== "COMBAT") return false;
  if (!game.player.alive || game.round >= game.maxRounds) { game.phase = "GAME_OVER"; return true; }
  game.round += 1; game.phase = "SHOP"; game.battle = null; game.player.gold = Math.min(10, game.round + 2);
  game.player.upgradeCost = game.player.tier < 6 ? Math.max(0, game.player.upgradeCost - 1) : 0;
  game.player.freeRefresh = game.hero.power === "FREE_REFRESH";
  game.player.board.forEach((item) => { item.activatedThisTurn = false; });
  fillShop(game, false, rng); game.bots.filter((item) => item.alive).forEach((bot) => recruitBot(bot, game.round, rng)); chooseOpponent(game, rng); return true;
}

function chooseOpponent(game, rng) {
  const alive = game.bots.filter((item) => item.alive), choices = alive.filter((item) => item.id !== game.currentOpponent?.id);
  game.currentOpponent = randomItem(choices.length ? choices : alive, rng) || game.bots[0];
}

function addPermanentUndeadAttack(game, amount) {
  game.player.modifiers.undeadAttack += amount;
  game.player.board.filter((item) => hasTribe(item, "UNDEAD")).forEach((item) => buff(item, amount, 0));
}

function buff(minion, attack, health) { minion.attack += attack; minion.health += health; minion.maxHealth += health; checkThresholds(minion); }
function addKeyword(minion, keyword) { if (!minion.keywords.includes(keyword)) minion.keywords.push(keyword); }
function checkThresholds(minion) { if (hasScript(minion, "SCARLET_SURVIVOR") && minion.attack >= 6) addKeyword(minion, "DIVINE_SHIELD"); }
function message(game, text) { game.messages.unshift(text); game.messages = game.messages.slice(0, 30); }

export function standings(game) { return [game.player, ...game.bots].sort((a, b) => Number(b.alive) - Number(a.alive) || b.health - a.health); }
export function playerRank(game) { return standings(game).findIndex((item) => item.id === "player") + 1; }
export function gameResult(game) { const rank = playerRank(game); return { rank, title: rank === 1 ? "酒馆冠军" : rank <= 4 ? "成功晋级" : "再试一次", summary: `你以第${rank}名完成了本局。` }; }
export function canEndTurn(game) { return game.phase === "SHOP" && game.player.board.length > 0 && !game.pendingDiscover && !game.pendingAction; }
