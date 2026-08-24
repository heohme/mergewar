import { MINIONS } from "../src/data.js";
import {
  activateMinion, advanceRound, beginCombat, buyMinion, castSpell, chooseDiscover,
  createGame, gameResult, playCard, refreshShop, resolvePendingTarget, upgradeTavern,
} from "../src/engine.js";

function seeded(seed) {
  let state = seed >>> 0;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
}

function score(card, board) {
  if (card.kind === "SPELL") return 8 + card.tier * 1.5 - card.cost;
  const sameTribe = board.filter((item) => item.tribe === card.tribe).length;
  const pair = board.filter((item) => item.baseId === card.baseId).length;
  return card.attack + card.health + card.tier * 1.5 + sameTribe * 2 + pair * 7 + (card.text?.length || 0) / 40;
}

function recruit(game, rng) {
  if (game.player.tier < Math.min(6, 1 + Math.floor(game.round / 2)) && game.player.gold >= game.player.upgradeCost) upgradeTavern(game);
  let guard = 0;
  while (game.player.gold >= 1 && game.player.hand.length < 10 && guard++ < 12) {
    const affordable = game.player.shop.filter((item) => item.healthCost ? game.player.health > item.cost : game.player.gold >= (item.kind === "SPELL" ? item.cost : 3));
    const choice = [...affordable].sort((a, b) => score(b, game.player.board) - score(a, game.player.board))[0];
    if (!choice) { refreshShop(game, rng); continue; }
    buyMinion(game, choice.instanceId);
    const bought = game.player.hand.find((item) => item.baseId === choice.baseId);
    if (bought?.kind === "SPELL") {
      const result = castSpell(game, bought.instanceId, null, rng);
      if (result === "PENDING") resolvePendingTarget(game, game.pendingAction.validIds[0], rng);
    } else if (bought && game.player.board.length < 7) playCard(game, bought.instanceId, null, true, rng);
  }
  for (const card of [...game.player.hand]) {
    if (card.kind === "SPELL") {
      const result = castSpell(game, card.instanceId, null, rng);
      if (result === "PENDING") resolvePendingTarget(game, game.pendingAction.validIds[0], rng);
    }
    else if (game.player.board.length < 7) playCard(game, card.instanceId, null, true, rng);
  }
  for (const card of game.player.board) if (card.activate && game.player.gold >= card.activateCost) activateMinion(game, card.instanceId, null, rng);
  let choices = 0;
  while (game.pendingDiscover && choices++ < 4) {
    const pending = Array.isArray(game.pendingDiscover) ? { items: game.pendingDiscover } : game.pendingDiscover;
    chooseDiscover(game, pending.items[0].id, rng);
  }
}

const games = Number(process.argv[2] || 300);
const ranks = Array(9).fill(0);
const rounds = [];
const winRates = [];

for (let index = 1; index <= games; index += 1) {
  const rng = seeded(index * 7919);
  const game = createGame(undefined, rng);
  let safety = 0;
  while (game.phase !== "GAME_OVER" && safety++ < 14) {
    recruit(game, rng);
    if (!game.player.board.length) game.player.board.push({ ...MINIONS[0], kind: "MINION", baseId: MINIONS[0].id, instanceId: `fallback-${index}-${safety}`, attack: 2, health: 1, maxHealth: 1, keywords: ["TAUNT", "REBORN"], magneticCount: 0 });
    beginCombat(game, rng);
    advanceRound(game, rng);
  }
  const result = gameResult(game);
  ranks[result.rank] += 1;
  rounds.push(game.round);
  winRates.push(game.stats.wins / Math.max(1, game.stats.wins + game.stats.losses));
}

const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const summary = {
  games,
  averageRounds: Number(average(rounds).toFixed(2)),
  averageBattleWinRate: Number(average(winRates).toFixed(3)),
  firstRate: Number((ranks[1] / games).toFixed(3)),
  top4Rate: Number((ranks.slice(1, 5).reduce((sum, value) => sum + value, 0) / games).toFixed(3)),
  rankDistribution: ranks.slice(1),
};

console.log(JSON.stringify(summary, null, 2));
if (summary.averageRounds < 5 || summary.averageRounds > 10) throw new Error("平均回合数超出可接受范围");
if (summary.top4Rate < .2 || summary.top4Rate > .9) throw new Error("脚本玩家与电脑强度明显失衡");
