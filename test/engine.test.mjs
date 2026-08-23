import assert from "node:assert/strict";
import { CHROMATICS, DRAGONS, HEROES, MINIONS, SPELLS, UNDEAD } from "../src/data.js";
import {
  activateMinion, advanceRound, beginCombat, buyMinion, castSpell, createGame,
  createMinion, createSpell, playCard, refreshShop, resolvePendingTarget,
  simulateBattle, upgradeTavern,
} from "../src/engine.js";

const fixed = () => 0.17;
const minion = (id) => MINIONS.find((item) => item.id === id) || CHROMATICS.find((item) => item.id === id);
const spell = (id) => SPELLS.find((item) => item.id === id);

assert.equal(UNDEAD.length, 21, "应包含当前快照全部21张亡灵");
assert.equal(DRAGONS.length, 22, "应包含当前快照全部22张龙");
assert.deepEqual([1, 2, 3, 4, 5, 6].map((tier) => UNDEAD.filter((item) => item.tier === tier).length), [3, 3, 5, 4, 2, 4]);
assert.deepEqual([1, 2, 3, 4, 5, 6].map((tier) => DRAGONS.filter((item) => item.tier === tier).length), [2, 3, 5, 4, 4, 4]);
assert.ok([...UNDEAD, ...DRAGONS].every((item) => item.imageUrl.includes(item.cardId)));

const game = createGame(HEROES[0].id, fixed);
assert.equal(game.player.gold, 3);
assert.equal(game.player.shop.length, 3);
assert.equal(game.bots.length, 7);
const firstShop = game.player.shop[0];
assert.equal(buyMinion(game, firstShop.instanceId), true);
assert.equal(playCard(game, game.player.hand[0].instanceId, null, true, fixed), true);
assert.equal(game.player.board.length, 1);
assert.ok(beginCombat(game, fixed));
assert.ok(game.battle.frames.length >= 1, "战斗应生成独立页面可播放帧");

const refreshGame = createGame("TB_BaconShop_HERO_57", fixed);
assert.equal(refreshShop(refreshGame, fixed), true);
assert.equal(refreshGame.player.gold, 3, "诺兹多姆第一次刷新免费");
assert.equal(refreshShop(refreshGame, fixed), true);
assert.equal(refreshGame.player.gold, 2);

const upgradeGame = createGame(HEROES[0].id, fixed);
upgradeGame.player.gold = 5;
assert.equal(upgradeTavern(upgradeGame), true);
assert.equal(upgradeGame.player.tier, 2);

const tokenSource = createMinion(minion("BG28_300"));
const giant = createMinion({ id: "giant", name: "测试巨人", tribe: "NEUTRAL", tribes: ["NEUTRAL"], tier: 6, attack: 30, health: 30, keywords: [] });
const tokenBattle = simulateBattle([tokenSource], [giant], null, fixed);
assert.ok(tokenBattle.log.some((entry) => entry.summon === "骷髅"), "无害的骨颅应召唤骷髅");

const reborn = createMinion(minion("BG25_001"));
const rebornBattle = simulateBattle([reborn], [giant], null, fixed);
assert.ok(rebornBattle.log.some((entry) => entry.summon?.includes("复生")), "复活的骑兵应复生");

const rallyDragon = createMinion(minion("BG29_888"));
const weak = createMinion({ id: "weak", name: "木桩", tribe: "NEUTRAL", tribes: ["NEUTRAL"], tier: 1, attack: 0, health: 30, keywords: [] });
const rallyBattle = simulateBattle([rallyDragon], [weak], null, fixed);
assert.ok(rallyBattle.frames.some((frame) => frame.player.some((item) => item.baseId === "BG29_888" && item.attack >= 3)), "微光护卫者进击后应成长");

const paper = createMinion(minion("BG29_810"));
const dragon = createMinion(minion("BG35_814"));
const startBattle = simulateBattle([paper, dragon], [weak], null, fixed);
const leftDragon = startBattle.frames[0].player[0];
assert.ok(leftDragon.attack >= 3 && leftDragon.health >= 5 && leftDragon.keywords.includes("WINDFURY"), "千纸幼龙应强化最左龙并赋予风怒");

const spellGame = createGame(HEROES[0].id, fixed);
spellGame.player.board = [createMinion(minion("BG25_001"), false, spellGame.player.modifiers)];
const banana = createSpell(spell("BG28_897"));
spellGame.player.hand = [banana];
assert.equal(castSpell(spellGame, banana.instanceId, null, fixed), "PENDING");
assert.equal(resolvePendingTarget(spellGame, spellGame.player.board[0].instanceId, fixed), true);
assert.equal(spellGame.player.board[0].attack, 4);
assert.equal(spellGame.player.board[0].health, 3);

const activateGame = createGame(HEROES[0].id, fixed);
activateGame.player.gold = 10;
activateGame.player.board = [createMinion(minion("BG36_240"))];
assert.equal(activateMinion(activateGame, activateGame.player.board[0].instanceId, null, fixed), true);
assert.equal(activateGame.player.hand.length, 1);
assert.ok(CHROMATICS.some((item) => item.id === activateGame.player.hand[0].baseId));

const magneticGame = createGame(HEROES[0].id, fixed);
magneticGame.player.board = [createMinion(minion("BG25_001"))];
const hand = createMinion(minion("BG_DEEP_015"));
magneticGame.player.hand = [hand];
assert.equal(playCard(magneticGame, hand.instanceId, null, false, fixed), "PENDING");
assert.equal(resolvePendingTarget(magneticGame, magneticGame.player.board[0].instanceId, fixed), true);
assert.equal(magneticGame.player.board.length, 1);
assert.ok(magneticGame.player.board[0].attack >= 5);

for (let iteration = 0; iteration < 160; iteration += 1) {
  const left = Array.from({ length: 1 + iteration % 7 }, (_, index) => createMinion(MINIONS[(iteration + index) % MINIONS.length]));
  const right = Array.from({ length: 1 + (iteration * 3) % 7 }, (_, index) => createMinion(MINIONS[(iteration * 5 + index) % MINIONS.length]));
  const result = simulateBattle(left, right, null, fixed);
  assert.ok(["player", "enemy", "tie"].includes(result.winner));
  assert.ok(result.log.length < 500, "战斗不应进入无限循环");
}

const fullGame = createGame(HEROES[0].id, fixed);
for (let round = 1; round <= 10; round += 1) {
  fullGame.player.board = [createMinion({ id: `champion-${round}`, name: "测试冠军", tribe: "NEUTRAL", tribes: ["NEUTRAL"], tier: 6, attack: 1000, health: 1000, keywords: [] })];
  beginCombat(fullGame, fixed);
  advanceRound(fullGame, fixed);
}
assert.equal(fullGame.phase, "GAME_OVER");

console.log("engine tests passed: 43 tribe cards, targeting, spells, magnetic, rally, reborn, battle frames, 160 fuzz battles");
