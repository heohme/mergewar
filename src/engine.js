import {
  BOT_PROFILES,
  HEROES,
  MAX_BOARD,
  MAX_HAND,
  MAX_ROUNDS,
  MINIONS,
  TOKENS,
  UPGRADE_BASE_COST,
} from "./data.js";

const clone = (value) => JSON.parse(JSON.stringify(value));
const randomItem = (items, rng = Math.random) => items[Math.floor(rng() * items.length)];
const shuffle = (items, rng = Math.random) => [...items].sort(() => rng() - 0.5);
let instanceSeed = 1;

export function createMinion(definition, golden = false) {
  const multiplier = golden ? 2 : 1;
  return {
    ...clone(definition),
    instanceId: `${definition.id}-${instanceSeed++}`,
    baseId: definition.id,
    golden,
    attack: definition.attack * multiplier,
    health: definition.health * multiplier,
    maxHealth: definition.health * multiplier,
    keywords: [...(definition.keywords || [])],
  };
}

export function createGame(heroId) {
  const hero = HEROES.find((item) => item.id === heroId) || HEROES[0];
  const bots = BOT_PROFILES.map((profile) => ({
    ...clone(profile),
    health: 30,
    alive: true,
    tier: 1,
    board: [],
    lastOpponent: null,
  }));

  const game = {
    version: 1,
    phase: "SHOP",
    round: 1,
    maxRounds: MAX_ROUNDS,
    hero,
    player: {
      id: "player",
      name: "你",
      hero: hero.name,
      health: 30,
      alive: true,
      tier: 1,
      gold: 3,
      board: [],
      hand: [],
      shop: [],
      frozen: false,
      freeRefresh: hero.power === "FREE_REFRESH",
      freeRefreshes: 0,
      heroPowerUsed: false,
      upgradeCost: UPGRADE_BASE_COST[1],
    },
    bots,
    currentOpponent: null,
    pendingDiscover: null,
    battle: null,
    messages: ["欢迎来到鲍勃的酒馆。组建战队，活到最后。"],
    stats: { refreshes: 0, triples: 0, wins: 0, losses: 0 },
  };

  prepareBots(game);
  fillShop(game, true);
  chooseOpponent(game);
  return game;
}

export function shopSize(tier) {
  return [0, 3, 4, 4, 5, 5, 6][tier] || 6;
}

function availableMinions(tier) {
  return MINIONS.filter((minion) => minion.tier <= tier);
}

export function fillShop(game, forceNew = false) {
  const player = game.player;
  const size = shopSize(player.tier);
  if (forceNew || !player.frozen) player.shop = [];
  const pool = availableMinions(player.tier);
  while (player.shop.length < size) {
    player.shop.push(createMinion(randomItem(pool)));
  }
  player.frozen = false;
}

export function refreshShop(game) {
  if (game.phase !== "SHOP") return false;
  const player = game.player;
  const hasFreeRefresh = player.freeRefresh || player.freeRefreshes > 0;
  const cost = hasFreeRefresh ? 0 : 1;
  if (player.gold < cost) return false;
  player.gold -= cost;
  if (player.freeRefresh) player.freeRefresh = false;
  else if (player.freeRefreshes > 0) player.freeRefreshes -= 1;
  player.shop = [];
  fillShop(game, true);
  game.stats.refreshes += 1;
  game.messages.unshift(cost === 0 ? "本次免费刷新了酒馆。" : "你刷新了酒馆。")
  return true;
}

export function toggleFreeze(game) {
  if (game.phase !== "SHOP") return;
  game.player.frozen = !game.player.frozen;
}

export function buyMinion(game, instanceId) {
  const player = game.player;
  if (game.phase !== "SHOP" || player.gold < 3 || player.hand.length >= MAX_HAND) return false;
  const index = player.shop.findIndex((minion) => minion.instanceId === instanceId);
  if (index < 0) return false;
  const [minion] = player.shop.splice(index, 1);
  player.gold -= 3;
  player.hand.push(minion);
  game.messages.unshift(`购买了${minion.name}。`);
  checkTriples(game, minion.baseId);
  return true;
}

export function playMinion(game, instanceId) {
  const player = game.player;
  if (game.phase !== "SHOP" || player.board.length >= MAX_BOARD) return false;
  const index = player.hand.findIndex((minion) => minion.instanceId === instanceId);
  if (index < 0) return false;
  const [minion] = player.hand.splice(index, 1);
  player.board.push(minion);
  triggerRecruitEffect(game, minion, "BATTLECRY");
  if (minion.tribe === "ELEMENTAL") {
    player.board.filter((item) => item.aura === "ELEMENTAL_PLAY_BUFF").forEach(() => {
      player.board.filter((item) => item.tribe === "ELEMENTAL").forEach((item) => buff(item, 4, 4));
    });
  }
  game.messages.unshift(`${minion.name}加入了战队。`);
  return true;
}

export function sellMinion(game, instanceId) {
  const player = game.player;
  if (game.phase !== "SHOP") return false;
  const index = player.board.findIndex((minion) => minion.instanceId === instanceId);
  if (index < 0) return false;
  const [minion] = player.board.splice(index, 1);
  const value = minion.sellValue || 1;
  player.gold += value;
  game.messages.unshift(`出售了${minion.name}，获得${value}枚铸币。`);
  return true;
}

export function moveMinion(game, instanceId, direction) {
  const board = game.player.board;
  const index = board.findIndex((minion) => minion.instanceId === instanceId);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= board.length || game.phase !== "SHOP") return false;
  [board[index], board[next]] = [board[next], board[index]];
  return true;
}

export function upgradeTavern(game) {
  const player = game.player;
  if (game.phase !== "SHOP" || player.tier >= 6 || player.gold < player.upgradeCost) return false;
  player.gold -= player.upgradeCost;
  player.tier += 1;
  player.upgradeCost = UPGRADE_BASE_COST[player.tier] ?? 0;
  game.messages.unshift(`酒馆升级到${player.tier}级。`);
  return true;
}

export function useHeroPower(game, instanceId) {
  const player = game.player;
  if (game.phase !== "SHOP" || game.hero.power !== "GOLDEN_TOUCH" || player.heroPowerUsed) return false;
  const minion = player.board.find((item) => item.instanceId === instanceId);
  if (!minion || minion.golden) return false;
  minion.golden = true;
  minion.attack *= 2;
  minion.health *= 2;
  minion.maxHealth *= 2;
  player.heroPowerUsed = true;
  game.messages.unshift(`雷诺·杰克逊将${minion.name}变为了金色。`);
  return true;
}

function triggerRecruitEffect(game, source, trigger) {
  const effects = [...(source.effects || []), ...(source.effect ? [source.effect] : [])].filter((effect) => effect.trigger === trigger);
  if (!effects.length) return;
  const board = game.player.board;
  const triggerCount = trigger === "BATTLECRY" && board.some((item) => item.aura === "DOUBLE_BATTLECRIES") ? 2 : 1;
  for (let repetition = 0; repetition < triggerCount; repetition += 1) {
    effects.forEach((effect) => {
      const multiplier = source.golden ? 2 : 1;
      if (effect.action === "GAIN_GOLD") {
        game.player.gold += effect.amount * multiplier;
        return;
      }
      if (effect.action === "GAIN_FREE_REFRESHES") {
        game.player.freeRefreshes += effect.amount * multiplier;
        return;
      }
      const others = board.filter((item) => item.instanceId !== source.instanceId);
      let targets = effect.action.includes("TRIBE") ? others.filter((item) => item.tribe === effect.tribe) : others;
      if (!targets.length) return;
      if (effect.action.startsWith("BUFF_ALL")) {
        targets.forEach((target) => buff(target, effect.attack * multiplier, effect.health * multiplier));
      } else {
        const count = Math.min(effect.count || 1, targets.length);
        shuffle(targets).slice(0, count).forEach((target) => buff(target, effect.attack * multiplier, effect.health * multiplier));
      }
    });
  }
  if (trigger === "BATTLECRY") {
    board.filter((item) => item.aura === "KALECGOS").forEach(() => {
      board.filter((item) => item.tribe === "DRAGON").forEach((item) => buff(item, 2, 2));
    });
  }
}

function buff(minion, attack, health) {
  minion.attack += attack;
  minion.health += health;
  minion.maxHealth += health;
}

function checkTriples(game, baseId) {
  const player = game.player;
  const all = [...player.board, ...player.hand].filter((minion) => minion.baseId === baseId && !minion.golden);
  if (all.length < 3) return;
  const usedIds = new Set(all.slice(0, 3).map((minion) => minion.instanceId));
  const usedCopies = all.slice(0, 3);
  const definition = MINIONS.find((minion) => minion.id === baseId);
  player.board = player.board.filter((minion) => !usedIds.has(minion.instanceId));
  player.hand = player.hand.filter((minion) => !usedIds.has(minion.instanceId));
  const golden = createMinion(definition, true);
  const inheritedAttack = usedCopies.reduce((sum, minion) => sum + Math.max(0, minion.attack - definition.attack), 0);
  const inheritedHealth = usedCopies.reduce((sum, minion) => sum + Math.max(0, minion.maxHealth - definition.health), 0);
  golden.attack += inheritedAttack;
  golden.health += inheritedHealth;
  golden.maxHealth += inheritedHealth;
  player.hand.push(golden);
  game.stats.triples += 1;
  game.messages.unshift(`三连！获得金色${definition.name}。`);

  const discoverTier = Math.min(6, player.tier + 1);
  const optionsPool = MINIONS.filter((minion) => minion.tier === discoverTier);
  const fallback = MINIONS.filter((minion) => minion.tier <= discoverTier);
  game.pendingDiscover = shuffle(optionsPool.length >= 3 ? optionsPool : fallback).slice(0, 3);
}

export function chooseDiscover(game, baseId) {
  if (!game.pendingDiscover) return false;
  const definition = game.pendingDiscover.find((item) => item.id === baseId);
  if (!definition || game.player.hand.length >= MAX_HAND) return false;
  game.player.hand.push(createMinion(definition));
  game.pendingDiscover = null;
  game.messages.unshift(`发现了${definition.name}。`);
  return true;
}

function applyEndTurnEffects(game) {
  const snapshot = [...game.player.board];
  const repetitions = game.player.board.some((item) => item.aura === "DOUBLE_END_TURN") ? 2 : 1;
  for (let index = 0; index < repetitions; index += 1) {
    snapshot.forEach((minion) => triggerRecruitEffect(game, minion, "END_TURN"));
  }
}

export function beginCombat(game) {
  if (game.phase !== "SHOP" || !game.player.board.length || game.pendingDiscover) return null;
  applyEndTurnEffects(game);
  game.phase = "COMBAT";
  const opponent = game.currentOpponent;
  const result = simulateBattle(game.player.board, opponent.board, game.hero.power);
  game.battle = { ...result, opponent: clone(opponent) };
  resolvePlayerBattle(game, opponent, result);
  resolveBotBattles(game, opponent.id);
  return game.battle;
}

function resolvePlayerBattle(game, opponent, result) {
  if (result.winner === "player") {
    const damage = Math.max(1, game.player.tier + result.playerBoard.reduce((sum, minion) => sum + (minion.tier || 1), 0));
    opponent.health -= damage;
    game.stats.wins += 1;
    game.battle.damage = damage;
    game.messages.unshift(`战斗胜利，对${opponent.name}造成${damage}点伤害。`);
  } else if (result.winner === "enemy") {
    const damage = Math.max(1, opponent.tier + result.enemyBoard.reduce((sum, minion) => sum + (minion.tier || 1), 0));
    game.player.health -= damage;
    game.stats.losses += 1;
    game.battle.damage = damage;
    game.messages.unshift(`战斗失败，受到${damage}点伤害。`);
  } else {
    game.battle.damage = 0;
    game.messages.unshift("双方战平。")
  }
  game.player.alive = game.player.health > 0;
  opponent.alive = opponent.health > 0;
  game.player.health = Math.max(0, game.player.health);
  opponent.health = Math.max(0, opponent.health);
}

function resolveBotBattles(game, excludedOpponentId) {
  const available = shuffle(game.bots.filter((bot) => bot.alive && bot.id !== excludedOpponentId));
  for (let index = 0; index + 1 < available.length; index += 2) {
    const a = available[index];
    const b = available[index + 1];
    const powerA = boardPower(a.board) * (0.85 + Math.random() * 0.3);
    const powerB = boardPower(b.board) * (0.85 + Math.random() * 0.3);
    const loser = powerA >= powerB ? b : a;
    const winner = loser === a ? b : a;
    const damage = Math.max(1, Math.round((boardPower(winner.board) - boardPower(loser.board)) / 9) + winner.tier);
    loser.health = Math.max(0, loser.health - damage);
    loser.alive = loser.health > 0;
  }
}

function boardPower(board) {
  return board.reduce((sum, minion) => sum + minion.attack + minion.health + (minion.keywords?.length || 0) * 2, 0);
}

export function advanceRound(game) {
  if (game.phase !== "COMBAT") return false;
  if (!game.player.alive || game.round >= game.maxRounds) {
    game.phase = "GAME_OVER";
    return true;
  }
  game.round += 1;
  game.phase = "SHOP";
  game.battle = null;
  game.player.gold = Math.min(10, game.round + 2);
  if (game.player.tier < 6) {
    game.player.upgradeCost = Math.max(0, game.player.upgradeCost - 1);
  }
  game.player.freeRefresh = game.hero.power === "FREE_REFRESH";
  fillShop(game);
  prepareBots(game);
  chooseOpponent(game);
  return true;
}

function prepareBots(game) {
  game.bots.filter((bot) => bot.alive).forEach((bot) => {
    bot.tier = Math.min(6, 1 + Math.floor((game.round - 1) / 2));
    const boardSize = Math.min(7, Math.ceil(game.round * 0.75));
    const maxTier = Math.min(bot.tier, Math.max(1, Math.ceil(game.round / 2)));
    let pool = MINIONS.filter((minion) => minion.tier <= maxTier);
    if (bot.archetype !== "MIXED") {
      const focused = pool.filter((minion) => minion.tribe === bot.archetype || minion.tribe === "NEUTRAL");
      if (focused.length) pool = focused;
    }
    bot.board = Array.from({ length: boardSize }, () => {
      const minion = createMinion(randomItem(pool));
      const growth = Math.max(0, game.round - 3);
      const bonus = Math.floor(growth * (0.45 + Math.random() * 0.35));
      buff(minion, bonus, bonus);
      return minion;
    });
  });
}

function chooseOpponent(game) {
  const alive = game.bots.filter((bot) => bot.alive);
  const candidates = alive.filter((bot) => bot.id !== game.currentOpponent?.id);
  game.currentOpponent = randomItem(candidates.length ? candidates : alive) || game.bots[0];
}

function prepareCombatBoard(board) {
  return clone(board).map((minion) => ({
    ...minion,
    maxHealth: minion.health,
    shield: minion.keywords?.includes("DIVINE_SHIELD") || false,
    attacksRemaining: minion.keywords?.includes("WINDFURY") ? 2 : 1,
    rebornUsed: false,
  }));
}

function combatEffects(source, trigger) {
  return [...(source.effects || []), ...(source.effect ? [source.effect] : [])].filter((effect) => effect.trigger === trigger);
}

function applyCombatStart(board, opposingBoard) {
  const sources = [...board];
  sources.forEach((source) => {
    combatEffects(source, "COMBAT_START").forEach((effect) => {
      const multiplier = source.golden ? 2 : 1;
      const others = board.filter((item) => item.instanceId !== source.instanceId);
      const tribeTargets = others.filter((item) => item.tribe === effect.tribe);
      if (effect.action === "BUFF_PER_TRIBE") {
        const count = tribeTargets.length;
        buff(source, count * effect.attack * multiplier, count * effect.health * multiplier);
      } else if (effect.action === "BUFF_ALL_OTHER_TRIBE") {
        tribeTargets.forEach((target) => buff(target, effect.attack * multiplier, effect.health * multiplier));
      } else if (effect.action === "BUFF_ALL_TRIBE") {
        board.filter((item) => item.tribe === effect.tribe).forEach((target) => buff(target, effect.attack * multiplier, effect.health * multiplier));
      } else if (effect.action === "DAMAGE_ALL_OTHER") {
        [...others, ...opposingBoard].forEach((target) => { target.health -= effect.damage; });
      }
    });
  });
}

export function simulateBattle(playerBoardInput, enemyBoardInput, heroPower = null, rng = Math.random) {
  const playerBoard = prepareCombatBoard(playerBoardInput);
  const enemyBoard = prepareCombatBoard(enemyBoardInput);
  const log = [];
  applyCombatStart(playerBoard, enemyBoard);
  applyCombatStart(enemyBoard, playerBoard);
  processDeaths(playerBoard, enemyBoard, log, "player");
  processDeaths(enemyBoard, playerBoard, log, "enemy");

  if (heroPower === "EDGE_ASSAULT" && playerBoard.length) {
    const edgeIds = playerBoard.length === 1
      ? [playerBoard[0].instanceId]
      : [playerBoard[0].instanceId, playerBoard[playerBoard.length - 1].instanceId];
    edgeIds.forEach((instanceId) => {
      const minion = playerBoard.find((item) => item.instanceId === instanceId);
      if (!minion) return;
      buff(minion, 2, 1);
      if (enemyBoard.length) performAttack(playerBoard, enemyBoard, minion.instanceId, log, "player", rng);
    });
  }

  let playerTurn = playerBoard.length === enemyBoard.length ? rng() >= 0.5 : playerBoard.length > enemyBoard.length;
  let playerCursor = 0;
  let enemyCursor = 0;
  let safety = 0;

  while (playerBoard.length && enemyBoard.length && safety++ < 200) {
    const attackers = playerTurn ? playerBoard : enemyBoard;
    const defenders = playerTurn ? enemyBoard : playerBoard;
    let cursor = playerTurn ? playerCursor : enemyCursor;
    if (!attackers.length || !defenders.length) break;
    cursor %= attackers.length;
    const attacker = attackers[cursor];
    if (!attacker || attacker.attack <= 0) {
      if (playerTurn) playerCursor += 1;
      else enemyCursor += 1;
      playerTurn = !playerTurn;
      continue;
    }
    const attackCount = attacker.keywords?.includes("WINDFURY") ? 2 : 1;
    for (let attackIndex = 0; attackIndex < attackCount; attackIndex += 1) {
      if (!attackers.some((item) => item.instanceId === attacker.instanceId) || !defenders.length) break;
      performAttack(attackers, defenders, attacker.instanceId, log, playerTurn ? "player" : "enemy", rng);
    }
    if (playerTurn) playerCursor += 1;
    else enemyCursor += 1;
    playerTurn = !playerTurn;
  }

  return {
    winner: playerBoard.length > 0 && enemyBoard.length === 0 ? "player" : enemyBoard.length > 0 && playerBoard.length === 0 ? "enemy" : "tie",
    playerBoard,
    enemyBoard,
    log,
  };
}

function performAttack(attackers, defenders, attackerId, log, side, rng) {
  const attackerIndex = attackers.findIndex((item) => item.instanceId === attackerId);
  if (attackerIndex < 0 || !defenders.length) return;
  const attacker = attackers[attackerIndex];
  const taunts = defenders.filter((item) => item.keywords?.includes("TAUNT"));
  const target = randomItem(taunts.length ? taunts : defenders, rng);
  combatEffects(attacker, "BEFORE_ATTACK").forEach((effect) => {
    if (effect.action === "REMOVE_TARGET_KEYWORDS") {
      target.keywords = target.keywords.filter((keyword) => !effect.keywords.includes(keyword));
    }
  });
  const dealt = hit(target, attacker.attack);
  if (dealt > 0 && attacker.keywords?.includes("VENOMOUS")) target.health = 0;
  const returned = attacker.keywords?.includes("ATTACK_IMMUNE") ? 0 : hit(attacker, target.attack);
  if (returned > 0 && target.keywords?.includes("VENOMOUS")) attacker.health = 0;
  log.push({ side, attacker: attacker.name, target: target.name, attack: dealt, counter: returned });
  combatEffects(attacker, "AFTER_ATTACK").forEach((effect) => {
    if (effect.action === "BUFF_ALL_OTHER") attackers.filter((item) => item.instanceId !== attacker.instanceId).forEach((item) => buff(item, effect.attack, effect.health));
  });
  processDeaths(attackers, defenders, log, side);
  processDeaths(defenders, attackers, log, side === "player" ? "enemy" : "player");
}

function hit(target, damage) {
  if (target.shield && damage > 0) {
    target.shield = false;
    return 0;
  }
  target.health -= damage;
  return damage;
}

function processDeaths(board, opposingBoard, log, side) {
  let changed = true;
  while (changed) {
    changed = false;
    for (let index = 0; index < board.length; index += 1) {
      const minion = board[index];
      if (minion.health > 0) continue;
      board.splice(index, 1);
      log.push({ side, death: minion.name });
      const deathrattles = combatEffects(minion, "DEATHRATTLE");
      const repeats = board.some((item) => item.aura === "DOUBLE_DEATHRATTLES") ? 2 : 1;
      for (let repeat = 0; repeat < repeats; repeat += 1) {
        deathrattles.forEach((effect) => {
          const multiplier = minion.golden ? 2 : 1;
          if (effect.action === "SUMMON_TOKEN") {
            const count = Math.min(MAX_BOARD - board.length, effect.count * multiplier);
            for (let tokenIndex = 0; tokenIndex < count; tokenIndex += 1) {
              const token = createMinion(TOKENS[effect.token]);
              board.splice(Math.min(index + tokenIndex, board.length), 0, token);
              log.push({ side, summon: token.name });
            }
          } else if (effect.action === "BUFF_RANDOM_OTHER_TRIBE") {
            const targets = board.filter((item) => item.tribe === effect.tribe);
            const target = randomItem(targets);
            if (target) buff(target, effect.attack * multiplier, effect.health * multiplier);
          } else if (effect.action === "BUFF_ALL_TRIBE") {
            board.filter((item) => item.tribe === effect.tribe).forEach((item) => buff(item, effect.attack * multiplier, effect.health * multiplier));
          } else if (effect.action === "BUFF_ONE_EACH_TRIBE") {
            [...new Set(board.map((item) => item.tribe))].forEach((tribe) => {
              const target = board.find((item) => item.tribe === tribe);
              if (target) buff(target, effect.attack * multiplier, effect.health * multiplier);
            });
          }
        });
      }
      if (minion.keywords?.includes("REBORN") && !minion.rebornUsed && board.length < MAX_BOARD) {
        const reborn = { ...clone(minion), instanceId: `${minion.baseId}-${instanceSeed++}`, health: 1, maxHealth: 1, shield: false, rebornUsed: true };
        reborn.keywords = reborn.keywords.filter((keyword) => keyword !== "REBORN");
        board.splice(Math.min(index, board.length), 0, reborn);
        log.push({ side, summon: `${reborn.name}（复生）` });
      }
      changed = true;
      break;
    }
  }
}

export function standings(game) {
  return [game.player, ...game.bots].sort((a, b) => Number(b.alive) - Number(a.alive) || b.health - a.health);
}

export function playerRank(game) {
  return standings(game).findIndex((item) => item.id === "player") + 1;
}

export function gameResult(game) {
  const rank = playerRank(game);
  return {
    rank,
    title: rank === 1 ? "酒馆冠军" : rank <= 4 ? "成功晋级" : "再试一次",
    summary: rank === 1 ? "你击败了整座酒馆。" : rank <= 4 ? `你以第${rank}名完成了本局。` : `本局止步第${rank}名。`,
  };
}

export function canEndTurn(game) {
  return game.phase === "SHOP" && game.player.board.length > 0 && !game.pendingDiscover;
}
