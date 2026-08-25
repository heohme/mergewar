import assert from "node:assert/strict";
import { attackVectorGeometry, battleFrameDelay, battleHeaderState, BATTLE_FRAME_TIMINGS, combatKeywordState, newCombatantIds } from "../src/battle-presentation.js";

assert.ok(BATTLE_FRAME_TIMINGS.attack > BATTLE_FRAME_TIMINGS.resolve, "攻击帧应比结算帧停留更久");
assert.equal(battleFrameDelay({ event: { type: "attack" } }), 1400);
assert.equal(battleFrameDelay({ event: { type: "attack" } }, 2), 700);
assert.ok(battleFrameDelay({ event: { type: "attack" } }, 4, true) >= 140, "减少动态效果时仍应保留可读停顿");

const settledPlayer = { health: 0, armor: 0 };
const settledBattle = { winner: "enemy", damage: 8, playerHealthBefore: 6, playerArmorBefore: 2, playerRankBefore: 5 };
assert.deepEqual(battleHeaderState(settledBattle, settledPlayer, 8, false), { health: 6, armor: 2, rank: 5 }, "战斗动画结束前不应提前展示结算后的生命和排名");
assert.deepEqual(battleHeaderState(settledBattle, settledPlayer, 8, true), { health: 0, armor: 0, rank: 8 }, "战斗结果帧应展示最终生命和排名");
assert.equal(battleHeaderState({ winner: "enemy", damage: 6 }, { health: 0, armor: 0 }, 8, false).health, 6, "旧存档战斗也应尽量恢复开战前生命");

const previous = { player: [{ instanceId: "p1" }], enemy: [{ instanceId: "e1" }] };
const resolved = { event: { type: "resolve" }, player: [{ instanceId: "p1" }, { instanceId: "p2" }], enemy: [] };
assert.deepEqual([...newCombatantIds(resolved, previous, "player")], ["p2"], "结算帧应识别新召唤随从");
assert.equal(newCombatantIds({ ...resolved, event: { type: "attack" } }, previous, "player").size, 0, "攻击帧不应误标召唤入场");

const keywordCard = { instanceId: "keyword-card", keywords: ["TAUNT", "WINDFURY", "REBORN"] };
const attackEvent = { type: "attack", attackerSide: "player", attackerId: "keyword-card", targetSide: "enemy", targetId: "target" };
assert.deepEqual(combatKeywordState(keywordCard, attackEvent, "player"), {
  taunt: true, windfury: true, reborn: true, tauntTriggered: false, windfuryTriggered: true,
}, "风怒攻击时应触发棋子上的风怒表现");
assert.equal(combatKeywordState(keywordCard, { ...attackEvent, attackerId: "other", targetSide: "player", targetId: "keyword-card" }, "player").tauntTriggered, true, "嘲讽随从被攻击时应触发守护表现");

const vector = attackVectorGeometry(
  { left: 720, top: 220, width: 120, height: 150 },
  { left: 520, top: 650, width: 120, height: 150 },
  { left: 20, top: 100, width: 1960, height: 900 },
);
assert.ok(vector.x2 > 500 && vector.x2 < 620, "箭头终点应落在真实目标卡牌附近，而不是阵容区域最左侧");
assert.ok(vector.y2 > 500 && vector.y2 < 650, "箭头尖端应停在目标卡牌上缘附近");
assert.ok(vector.x1 > vector.x2 && vector.y1 < vector.y2, "箭头应从攻击者边缘指向目标边缘");

console.log("presentation tests passed: combat pacing, summon detection, and attack-vector geometry");
