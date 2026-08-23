import assert from "node:assert/strict";
import { HEROES, MINIONS } from "../src/data.js";
import {
  beginCombat,
  buyMinion,
  createGame,
  createMinion,
  playMinion,
  refreshShop,
  simulateBattle,
  upgradeTavern,
  advanceRound,
} from "../src/engine.js";

const game = createGame(HEROES[0].id);
assert.equal(game.player.gold, 3);
assert.equal(game.player.shop.length, 3);
assert.equal(game.bots.length, 7);

const firstShopId = game.player.shop[0].instanceId;
assert.equal(buyMinion(game, firstShopId), true);
assert.equal(game.player.gold, 0);
assert.equal(game.player.hand.length, 1);
assert.equal(playMinion(game, game.player.hand[0].instanceId), true);
assert.equal(game.player.board.length, 1);
assert.ok(beginCombat(game));

const refreshGame = createGame("TB_BaconShop_HERO_57");
assert.equal(refreshShop(refreshGame), true);
assert.equal(refreshGame.player.gold, 3, "诺兹多姆的第一次刷新免费");
assert.equal(refreshShop(refreshGame), true);
assert.equal(refreshGame.player.gold, 2, "第二次刷新消耗1金币");

const upgradeGame = createGame("TB_BaconShop_HERO_57");
upgradeGame.player.gold = 5;
assert.equal(upgradeTavern(upgradeGame), true);
assert.equal(upgradeGame.player.tier, 2);

const strong = createMinion({ id: "strong", name: "强者", tribe: "NEUTRAL", tier: 1, attack: 20, health: 20 });
const weak = createMinion({ id: "weak", name: "弱者", tribe: "NEUTRAL", tier: 1, attack: 1, health: 1 });
const battle = simulateBattle([strong], [weak], null, () => 0.5);
assert.equal(battle.winner, "player");

const windfury = createMinion({ id: "windfury", name: "风怒测试", tribe: "NEUTRAL", tier: 1, attack: 2, health: 10, keywords: ["WINDFURY"] });
const targets = [
  createMinion({ id: "target-a", name: "目标甲", tribe: "NEUTRAL", tier: 1, attack: 0, health: 1 }),
  createMinion({ id: "target-b", name: "目标乙", tribe: "NEUTRAL", tier: 1, attack: 0, health: 1 }),
];
const windfuryBattle = simulateBattle([windfury], targets, null, () => 0);
assert.equal(windfuryBattle.enemyBoard.length, 0, "风怒单位应连续攻击两次");

const tokenSource = createMinion(MINIONS.find((minion) => minion.id === "BG29_611"));
const tokenBattle = simulateBattle([tokenSource], [strong], null, () => 0.5);
assert.ok(tokenBattle.log.some((entry) => entry.summon === "微型机器人"), "亡语应召唤衍生物");

const tripleGame = createGame("TB_BaconShop_HERO_57");
const tripleDefinition = MINIONS.find((minion) => minion.id === "BG28_300");
tripleGame.player.gold = 9;
tripleGame.player.shop = [createMinion(tripleDefinition), createMinion(tripleDefinition), createMinion(tripleDefinition)];
for (const minion of [...tripleGame.player.shop]) buyMinion(tripleGame, minion.instanceId);
assert.equal(tripleGame.player.hand.length, 1);
assert.equal(tripleGame.player.hand[0].golden, true);
assert.ok(tripleGame.pendingDiscover?.length > 0);

const fullGame = createGame("TB_BaconShop_HERO_57");
for (let round = 1; round <= 10; round += 1) {
  fullGame.player.board = [createMinion({ id: `champion-${round}`, name: "测试冠军", tribe: "NEUTRAL", tier: 6, attack: 1000, health: 1000 })];
  beginCombat(fullGame);
  advanceRound(fullGame);
}
assert.equal(fullGame.phase, "GAME_OVER");

assert.ok(HEROES.every((hero) => hero.imageUrl.includes(hero.cardId)), "英雄应使用对应 HearthstoneJSON 图片");
assert.ok(MINIONS.every((minion) => minion.imageUrl.includes(minion.cardId)), "随从应使用对应 HearthstoneJSON 图片");

console.log("engine tests passed");
