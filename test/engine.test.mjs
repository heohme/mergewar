import assert from "node:assert/strict";
import { BEASTS, CHROMATICS, DRAGONS, ELEMENTALS, HEROES, MECHS, MINIONS, NEUTRALS, QUILBOAR, SPELLS, UNDEAD } from "../src/data.js";
import {
  activateMinion, advanceRound, beginCombat, buyMinion, castSpell, createGame,
  chooseDiscover, createMinion, createSpell, gameResult, playCard, playerRank, refreshShop, resolvePendingTarget,
  reconcileBotUpgradeScaling, reconcileCardDefinitions, resolveTriples, sellMinion, simulateBattle, startHeroPower, upgradeTavern,
} from "../src/engine.js";

const fixed = () => 0.17;
const minion = (id) => MINIONS.find((item) => item.id === id) || CHROMATICS.find((item) => item.id === id);
const spell = (id) => SPELLS.find((item) => item.id === id);

assert.equal(UNDEAD.length, 21, "应包含当前快照全部21张亡灵");
assert.equal(DRAGONS.length, 22, "应包含当前快照全部22张龙");
assert.equal(MECHS.length, 20, "应包含20张机械专属随从，另有1张机械/亡灵双种族随从");
assert.equal(ELEMENTALS.length, 23, "应包含当前快照全部23张元素");
assert.equal(QUILBOAR.length, 22, "应包含当前快照全部22张野猪人");
assert.equal(BEASTS.length, 21, "应包含当前快照全部21张野兽");
assert.equal(NEUTRALS.length, 23, "应包含当前快照全部23张中立随从");
assert.equal(MINIONS.length, 152, "完整六种族与中立卡池应有152张随从");
assert.equal(new Set(MINIONS.map((item) => item.id)).size, MINIONS.length, "随从定义ID不应重复");
assert.deepEqual([1, 2, 3, 4, 5, 6].map((tier) => UNDEAD.filter((item) => item.tier === tier).length), [3, 3, 5, 4, 2, 4]);
assert.deepEqual([1, 2, 3, 4, 5, 6].map((tier) => DRAGONS.filter((item) => item.tier === tier).length), [2, 3, 5, 4, 4, 4]);
assert.ok([...UNDEAD, ...DRAGONS].every((item) => item.imageUrl.includes(item.cardId)));
assert.equal(SPELLS.filter((item) => item.pool).length, 48, "扩展卡池应包含48张可用酒馆法术");
assert.deepEqual([1, 2, 3, 4, 5, 6].map((tier) => SPELLS.filter((item) => item.pool && item.tier === tier).length), [8, 7, 10, 9, 10, 4]);
assert.ok(SPELLS.every((item) => Number.isInteger(item.cost)), "每张法术都应有独立铸币消耗");
assert.deepEqual([minion("BG32_170").attack, minion("BG32_170").health], [4, 2], "钢铁猎人的基础身材应为4/2");
assert.deepEqual([minion("BG31_320").attack, minion("BG31_320").health], [2, 2], "坑谷矿工的基础身材应为2/2");
assert.deepEqual([minion("BG28_303").attack, minion("BG28_303").health], [4, 4], "变装盗墓贼的基础身材应为4/4");
assert.deepEqual([minion("BG20_101").attack, minion("BG20_101").health], [3, 4], "路霸野猪人的基础身材应为3/4");

const game = createGame(HEROES[0].id, fixed);
assert.equal(game.player.gold, 3);
assert.equal(game.player.shop.length, 4);
assert.equal(game.player.shop.filter((item) => item.kind === "SPELL").length, 1, "每次刷新应额外提供一张酒馆法术");
assert.equal(game.bots.length, 7);
assert.ok(game.bots.every((bot) => bot.economy.buys >= 1 && bot.board.length >= 1), "电脑首回合应实际消费金币购买并上场");
assert.ok(game.bots.every((bot) => Array.isArray(bot.shop) && Array.isArray(bot.hand) && bot.upgradeCost === 5), "电脑应保留商店、手牌和升级费用");
const firstShop = game.player.shop[0];
assert.equal(buyMinion(game, firstShop.instanceId), true);
assert.equal(playCard(game, game.player.hand[0].instanceId, null, true, fixed), true);
assert.equal(game.player.board.length, 1);
assert.ok(beginCombat(game, fixed));
assert.ok(game.battle.frames.length >= 1, "战斗应生成独立页面可播放帧");
assert.ok(game.battle.frames.some((frame) => frame.event?.type === "attack" && frame.event.attackerId && frame.event.targetId), "战斗帧应标记攻击者、目标和伤害");
assert.ok(game.battle.insights.length >= 1, "战斗结束应生成关键原因摘要");

const finalRankingGame = createGame(HEROES[0].id, fixed);
finalRankingGame.round = finalRankingGame.maxRounds;
finalRankingGame.player.health = 8; finalRankingGame.player.alive = true; finalRankingGame.player.lastBattleResult = "WIN";
finalRankingGame.stats.wins = 7; finalRankingGame.stats.losses = 3;
[20, 16, 12, 9, 7, 4, 0].forEach((health, index) => { finalRankingGame.bots[index].health = health; finalRankingGame.bots[index].alive = health > 0; });
assert.equal(playerRank(finalRankingGame), 5, "十回合结束时应优先按存活和剩余生命值排名");
const fifthPlaceResult = gameResult(finalRankingGame);
assert.match(fifthPlaceResult.summary, /第10回合战斗胜利/, "结算页应明确展示最后一场战斗结果");
assert.match(fifthPlaceResult.summary, /排名第5/, "结算页应同时解释整局最终排名");
assert.match(fifthPlaceResult.rankingRule, /剩余生命值.*胜场.*阵容战力/, "结算页应展示完整排名规则");

const tieBreakGame = createGame(HEROES[0].id, fixed);
tieBreakGame.player.health = 10; tieBreakGame.player.alive = true; tieBreakGame.stats.wins = 3;
tieBreakGame.bots.forEach((bot, index) => { bot.health = index === 0 ? 10 : 0; bot.alive = index === 0; bot.wins = index === 0 ? 4 : 0; });
assert.equal(playerRank(tieBreakGame), 2, "同生命值时胜场更多的玩家应排在前面");
tieBreakGame.stats.wins = 5;
assert.equal(playerRank(tieBreakGame), 1, "玩家胜场超过同生命值对手后应排在前面");

const refreshGame = createGame("TB_BaconShop_HERO_57", fixed);
assert.equal(refreshShop(refreshGame, fixed), true);
assert.equal(refreshGame.player.gold, 3, "诺兹多姆第一次刷新免费");
assert.equal(refreshShop(refreshGame, fixed), true);
assert.equal(refreshGame.player.gold, 2);

const roundSixGame = createGame(HEROES[0].id, fixed);
for (let round = 1; round < 6; round += 1) {
  roundSixGame.player.board = [createMinion({ id: `gold-check-${round}`, name: "经济测试", tribe: "NEUTRAL", tribes: ["NEUTRAL"], tier: 6, attack: 999, health: 999, keywords: [] })];
  assert.ok(beginCombat(roundSixGame, fixed));
  assert.equal(advanceRound(roundSixGame, fixed), true);
}
assert.equal(roundSixGame.round, 6);
assert.equal(roundSixGame.player.gold, 8, "第六回合应获得8枚铸币，10是铸币上限");

const paidRefreshHero = HEROES.find((hero) => hero.power !== "FREE_REFRESH");
const ordinarySpendingGame = createGame(paidRefreshHero.id, fixed);
ordinarySpendingGame.player.gold = 10;
for (let refresh = 0; refresh < 7; refresh += 1) assert.equal(refreshShop(ordinarySpendingGame, fixed), true);
assert.equal(ordinarySpendingGame.player.modifiers.refreshBuffs.length, 0, "没有空气亡魂时，花费铸币不应给商店随从叠加+8/+8");

const airSpiritGame = createGame(paidRefreshHero.id, fixed);
airSpiritGame.player.board = [createMinion(minion("BG34_858"), false, airSpiritGame.player.modifiers)];
airSpiritGame.player.gold = 10;
for (let refresh = 0; refresh < 7; refresh += 1) assert.equal(refreshShop(airSpiritGame, fixed), true);
assert.deepEqual(airSpiritGame.player.modifiers.refreshBuffs, [{ attack: 8, health: 8, source: "BG34_858" }], "只有场上的空气亡魂应追踪7枚铸币并施放乘借东风");

const legacyAirSpiritGame = createGame(HEROES[0].id, fixed);
const legacyShopId = legacyAirSpiritGame.player.shop[0].instanceId;
legacyAirSpiritGame.player.modifiers.airSpiritSpendFix = 0;
legacyAirSpiritGame.player.modifiers.airSpent = 6;
legacyAirSpiritGame.player.modifiers.refreshBuffs = [{ attack: 8, health: 8 }];
assert.equal(reconcileCardDefinitions(legacyAirSpiritGame), true, "旧存档应清除被全局错误触发的乘借东风");
assert.equal(legacyAirSpiritGame.player.modifiers.airSpiritSpendFix, 1);
assert.equal(legacyAirSpiritGame.player.modifiers.refreshBuffs.length, 0);
assert.notEqual(legacyAirSpiritGame.player.shop[0].instanceId, legacyShopId, "受污染的旧商店应重新生成");

const upgradeGame = createGame(HEROES[0].id, fixed);
upgradeGame.player.gold = 5;
assert.equal(upgradeTavern(upgradeGame), true);
assert.equal(upgradeGame.player.tier, 2);

const botEconomyGame = createGame(HEROES[0].id, fixed);
botEconomyGame.player.board = [createMinion({ id: "bot-check", name: "经营测试", tribe: "NEUTRAL", tribes: ["NEUTRAL"], tier: 6, attack: 50, health: 50, keywords: [] })];
beginCombat(botEconomyGame, fixed);
advanceRound(botEconomyGame, fixed);
assert.ok(botEconomyGame.bots.some((bot) => bot.economy.upgrades >= 1 && bot.tier >= 2), "电脑应根据金币和升级费用升本");
assert.ok(botEconomyGame.bots.every((bot) => bot.decisions.length >= 1), "电脑应记录本回合真实经营决策");

const botScalingGame = createGame(HEROES[0].id, fixed);
botScalingGame.bots.forEach((bot) => { bot.health = 999; });
const botPower = (bot) => bot.board.reduce((sum, card) => sum + card.attack + card.health + card.keywords.length * 2, 0);
for (let round = 1; round <= 10; round += 1) {
  botScalingGame.player.board = [createMinion({ id: `scaling-check-${round}`, name: "强度测试", tribe: "NEUTRAL", tribes: ["NEUTRAL"], tier: 6, attack: 999, health: 999, keywords: [] })];
  beginCombat(botScalingGame, fixed);
  if (round < 10) advanceRound(botScalingGame, fixed);
}
assert.ok(botScalingGame.bots.every((bot) => bot.tier === 6 && bot.economy.upgrades === 5), "存活电脑应在十回合内逐步升级到6级酒馆");
assert.ok(botScalingGame.bots.every((bot) => bot.upgradeScaling === 5), "电脑应记录每次升本带来的强度成长");
assert.ok(botScalingGame.bots.every((bot) => bot.modifiers.shopAttack >= 5 && bot.modifiers.shopHealth >= 5), "每次升本都应提高电脑后续招募质量");
assert.ok(botScalingGame.bots.reduce((sum, bot) => sum + botPower(bot), 0) / botScalingGame.bots.length >= 120, "最终回合电脑平均战力不应停留在低级阵容水平");

const legacyDifficultyGame = createGame(HEROES[0].id, fixed);
const legacyBot = legacyDifficultyGame.bots[0];
legacyBot.tier = 4; legacyBot.economy.upgrades = 3; delete legacyBot.upgradeScaling;
const legacyPower = botPower(legacyBot);
assert.equal(reconcileBotUpgradeScaling(legacyDifficultyGame), true, "旧存档应按历史升本次数追补电脑成长");
assert.equal(legacyBot.upgradeScaling, 3);
assert.equal(botPower(legacyBot), legacyPower + legacyBot.board.length * 4 * 3);
assert.equal(reconcileBotUpgradeScaling(legacyDifficultyGame), false, "旧存档追补不应重复叠加");

const tokenSource = createMinion(minion("BG28_300"));
const giant = createMinion({ id: "giant", name: "测试巨人", tribe: "NEUTRAL", tribes: ["NEUTRAL"], tier: 6, attack: 30, health: 30, keywords: [] });
const tokenBattle = simulateBattle([tokenSource], [giant], null, fixed);
assert.ok(tokenBattle.log.some((entry) => entry.summon === "骷髅"), "无害的骨颅应召唤骷髅");

const reborn = createMinion(minion("BG25_001"));
reborn.attack += 20;
const rebornBattle = simulateBattle([reborn], [giant], null, fixed);
assert.ok(rebornBattle.log.some((entry) => entry.summon?.includes("复生")), "复活的骑兵应复生");
const rebornFrame = rebornBattle.frames.find((frame) => frame.event?.type === "reborn");
assert.ok(rebornFrame, "复生应生成独立的词条触发帧");
const returnedRider = rebornFrame.player.find((item) => item.baseId === "BG25_001");
assert.equal(returnedRider.attack, 2, "复生不应保留战斗中的临时攻击增益");
assert.equal(returnedRider.health, 1, "复生应以1点生命值返回");
assert.ok(!returnedRider.keywords.includes("REBORN"), "复生返回后应移除复生词条");

const rallyDragon = createMinion(minion("BG29_888"));
const weak = createMinion({ id: "weak", name: "木桩", tribe: "NEUTRAL", tribes: ["NEUTRAL"], tier: 1, attack: 0, health: 30, keywords: [] });
const rallyBattle = simulateBattle([rallyDragon], [weak], null, fixed);
assert.ok(rallyBattle.frames.some((frame) => frame.player.some((item) => item.baseId === "BG29_888" && item.attack >= 3)), "微光护卫者进击后应成长");

const roadboarBattle = simulateBattle(
  [createMinion(minion("BG20_101"))],
  [createMinion({ id: "roadboar-target", name: "宝石木桩", tribe: "NEUTRAL", tribes: ["NEUTRAL"], tier: 1, attack: 0, health: 1, keywords: [] })],
  null, fixed,
);
assert.equal(roadboarBattle.rewards.player.cards.filter((card) => card.id === "BG20_GEM").length, 2, "路霸野猪人每次进击应获取2张鲜血宝石");

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

const spellPurchaseGame = createGame(HEROES[0].id, fixed);
const shopSpell = spellPurchaseGame.player.shop.find((item) => item.kind === "SPELL");
const spellPrice = shopSpell.cost;
assert.equal(buyMinion(spellPurchaseGame, shopSpell.instanceId), true);
assert.equal(spellPurchaseGame.player.gold, 3 - spellPrice, "购买法术应按卡面价格扣费");

const bannerGame = createGame(HEROES[0].id, fixed);
const bannerBat = createMinion(minion("BG36_200"), false, bannerGame.player.modifiers);
const allianceFlag = createSpell(spell("BG31_880")); bannerGame.player.board = [bannerBat]; bannerGame.player.hand = [allianceFlag];
assert.equal(castSpell(bannerGame, allianceFlag.instanceId, bannerBat.instanceId, fixed), true);
assert.equal(chooseDiscover(bannerGame, "ATTACK", fixed), true);
assert.deepEqual([bannerBat.attack, bannerBat.health], [4, 5], "1/4的翩飞蝙蝠获得+3/+1后应为4/5");
assert.match(bannerGame.messages[0], /1\/4 → 4\/5/, "联盟旗帜应明确展示强化前后的身材");

const rallyBatGame = createGame(HEROES[0].id, fixed);
const rallyBat = createMinion(minion("BG36_200"), false, rallyBatGame.player.modifiers);
rallyBatGame.player.hand = [rallyBat]; rallyBatGame.player.board = [];
assert.equal(playCard(rallyBatGame, rallyBat.instanceId, null, true, fixed), true);
assert.equal(rallyBatGame.player.board.length, 1, "翩飞蝙蝠上场时不应提前召唤野兽");
const batSupport = createMinion({ id: "bat-support", name: "观战木桩", tribe: "NEUTRAL", tribes: ["NEUTRAL"], tier: 1, attack: 0, health: 30, keywords: [] });
const batKiller = createMinion({ id: "bat-killer", name: "反击木桩", tribe: "NEUTRAL", tribes: ["NEUTRAL"], tier: 1, attack: 20, health: 50, keywords: [] });
const batBattle = simulateBattle([rallyBat, batSupport], [batKiller], null, fixed);
const batRallyFrameIndex = batBattle.frames.findIndex((frame) => frame.event?.type === "rally" && frame.event.attackerId === rallyBat.instanceId);
assert.ok(batRallyFrameIndex > 0, "翩飞蝙蝠攻击后应生成独立的进击结算帧");
const batRallyFrame = batBattle.frames[batRallyFrameIndex];
assert.ok(batRallyFrame.player.some((item) => item.instanceId === rallyBat.instanceId), "进击结算时蝙蝠尚未进行阵亡清算");
assert.ok(batRallyFrame.player.some((item) => item.baseId === "BG36_200t"), "进击结算时应立即出现1/1野兽");
const batDeathFrame = batBattle.frames[batRallyFrameIndex + 1];
assert.ok(!batDeathFrame.player.some((item) => item.instanceId === rallyBat.instanceId), "进击召唤完成后才应清算蝙蝠阵亡");
assert.ok(batDeathFrame.player.some((item) => item.baseId === "BG36_200t"), "蝙蝠阵亡不应移除其进击召唤物");

const legacyBatGame = createGame(HEROES[0].id, fixed);
const legacyBat = createMinion(minion("BG36_200")); delete legacyBat.rally; legacyBat.battlecry = "SUMMON_SMALL_BEAST"; legacyBat.battlecryResolved = true;
legacyBatGame.player.board = [legacyBat, createMinion({ ...minion("BG36_200"), id: "BG36_200t", name: "幼小野兽", attack: 1, health: 1, token: true })];
assert.equal(reconcileCardDefinitions(legacyBatGame), true, "旧版本中被错误迁移为战吼的蝙蝠应恢复为进击");
assert.equal(legacyBatGame.player.board.length, 1, "旧版本错误预先生成的1/1召唤物应被移除");
assert.equal(legacyBatGame.player.board[0].rally, "BG36_200");
assert.equal(legacyBatGame.player.board[0].battlecry, undefined);

const gemGame = createGame(HEROES[0].id, fixed);
gemGame.player.board = [createMinion(minion("BG20_100"), false, gemGame.player.modifiers)];
const gem = createSpell(spell("BG20_GEM")); gemGame.player.hand = [gem];
assert.equal(castSpell(gemGame, gem.instanceId, null, fixed), "PENDING");
assert.equal(resolvePendingTarget(gemGame, gemGame.player.board[0].instanceId, fixed), true);
assert.deepEqual([gemGame.player.board[0].attack, gemGame.player.board[0].health], [3, 2], "鲜血宝石应永久提供+1/+1");
assert.equal(gemGame.player.hand.length, 0, "鲜血宝石施放后必须离开手牌");

const trainedGemGame = createGame(HEROES[0].id, fixed);
trainedGemGame.player.board = [createMinion(minion("BG20_100"), false, trainedGemGame.player.modifiers)];
const gemTraining = createSpell(spell("BG31_893")); trainedGemGame.player.hand = [gemTraining];
assert.equal(castSpell(trainedGemGame, gemTraining.instanceId, null, fixed), true);
assert.equal(chooseDiscover(trainedGemGame, "ATTACK", fixed), true);
assert.match(trainedGemGame.messages[0], /\+2\/\+1/, "锋利宝石后应明确提示鲜血宝石变为+2/+1");
const trainedGem = createSpell(spell("BG20_GEM")); trainedGemGame.player.hand = [trainedGem];
assert.equal(castSpell(trainedGemGame, trainedGem.instanceId, null, fixed), "PENDING");
assert.equal(resolvePendingTarget(trainedGemGame, trainedGemGame.player.board[0].instanceId, fixed), true);
assert.deepEqual([trainedGemGame.player.board[0].attack, trainedGemGame.player.board[0].health], [4, 2], "锋利宝石后每张鲜血宝石应实际提供+2/+1");
assert.match(trainedGemGame.messages[0], /实际 \+2\/\+1/, "施放鲜血宝石后应展示实际获得的属性");

const emptyGemGame = createGame(HEROES[0].id, fixed);
const unusableGem = createSpell(spell("BG20_GEM")); emptyGemGame.player.hand = [unusableGem]; emptyGemGame.player.board = [];
assert.equal(castSpell(emptyGemGame, unusableGem.instanceId, null, fixed), false, "没有随从时鲜血宝石应明确拒绝施放");
assert.equal(emptyGemGame.player.hand.length, 1, "没有有效目标时不应误吞鲜血宝石");
assert.match(emptyGemGame.messages[0], /没有可用目标/, "没有目标时应给出可见反馈");

const mechMagneticGame = createGame(HEROES[0].id, fixed);
const mechTarget = createMinion(minion("BG_TTN_401"), false, mechMagneticGame.player.modifiers);
const magneticCard = createMinion(minion("BG26_146"), false, mechMagneticGame.player.modifiers);
mechMagneticGame.player.board = [mechTarget]; mechMagneticGame.player.hand = [magneticCard];
assert.equal(playCard(mechMagneticGame, magneticCard.instanceId, mechTarget.instanceId, false, fixed), true);
assert.equal(mechTarget.magneticCount, 1, "磁力机械应能吸附到机械随从");

const beetleBattle = simulateBattle([createMinion(minion("BG31_803"))], [giant], null, fixed);
assert.ok(beetleBattle.log.some((entry) => entry.summon === "甲虫"), "野兽亡语应召唤甲虫");

const venomTarget = createMinion({ id: "venom-target", name: "烈毒木桩", tribe: "NEUTRAL", tribes: ["NEUTRAL"], tier: 6, attack: 0, health: 30, keywords: [] });
const venomBattle = simulateBattle([createMinion(minion("BGS_131"))], [venomTarget], null, fixed);
assert.equal(venomBattle.winner, "player", "烈毒应消灭受到伤害的随从");

for (const definition of SPELLS.filter((item) => item.pool)) {
  const sandbox = createGame(HEROES[0].id, fixed);
  sandbox.player.tier = 6; sandbox.player.gold = 20; sandbox.player.goldCap = 20;
  sandbox.player.board = [
    createMinion(minion("BG25_001"), false, sandbox.player.modifiers),
    createMinion(minion("BG35_814"), false, sandbox.player.modifiers),
    createMinion(minion("BG28_300"), false, sandbox.player.modifiers),
  ];
  const card = createSpell(definition); sandbox.player.hand = [card];
  let result = castSpell(sandbox, card.instanceId, null, fixed);
  if (result === "PENDING") result = resolvePendingTarget(sandbox, sandbox.pendingAction.validIds[0], fixed);
  assert.equal(result, true, `${definition.name}应能完成施放`);
  let choiceGuard = 0;
  while (sandbox.pendingDiscover && choiceGuard++ < 4) {
    const pending = Array.isArray(sandbox.pendingDiscover) ? { items: sandbox.pendingDiscover } : sandbox.pendingDiscover;
    assert.equal(chooseDiscover(sandbox, pending.items[0].id, fixed), true, `${definition.name}的发现/抉择应可完成`);
  }
  assert.ok(choiceGuard < 4, `${definition.name}不应产生无法结束的选择循环`);
}

const combatSpellBoard = [createMinion(minion("BG35_814"))];
const combatSpellEnemy = [createMinion(minion("BG25_001"))];
const combatSpellResult = simulateBattle(combatSpellBoard, combatSpellEnemy, null, fixed, {
  player: { doubleLeftAttack: 1, upperHand: 1 }, enemy: {},
});
assert.equal(combatSpellResult.frames[0].player[0].attack, 6, "诺兹多姆的子嗣应在战斗开始时翻倍最左随从攻击力");
assert.equal(combatSpellResult.frames[0].enemy[0].maxHealth, 1, "优势压制应将一个敌方随从生命值变为1");

const activateGame = createGame(HEROES[0].id, fixed);
activateGame.player.gold = 10;
activateGame.player.board = [createMinion(minion("BG36_240"))];
assert.equal(activateMinion(activateGame, activateGame.player.board[0].instanceId, null, fixed), true);
assert.equal(activateGame.player.hand.length, 1);
assert.ok(CHROMATICS.some((item) => item.id === activateGame.player.hand[0].baseId));

const targetedActivateGame = createGame(HEROES[0].id, fixed);
targetedActivateGame.player.gold = 10;
targetedActivateGame.player.board = [createMinion(minion("BG36_511")), createMinion(minion("BG28_300"))];
assert.equal(activateMinion(targetedActivateGame, targetedActivateGame.player.board[0].instanceId, null, fixed), "PENDING");
assert.equal(resolvePendingTarget(targetedActivateGame, targetedActivateGame.player.board[1].instanceId, fixed), true);
assert.equal(targetedActivateGame.player.board[0].attack, 7, "丧钟死灵发动后应获得+4/+4");
assert.equal(targetedActivateGame.player.board.filter((item) => item.baseId === "BG_ICC_026t").length, 2, "发动消灭亡语随从时应正确触发亡语");

const heroPowerGame = createGame("TB_BaconShop_HERO_41", fixed);
heroPowerGame.player.board = [createMinion(minion("BG35_814"))];
assert.equal(startHeroPower(heroPowerGame), "PENDING", "雷诺英雄技能应从英雄区域进入目标选择");
assert.equal(heroPowerGame.pendingAction.type, "HERO_POWER");
assert.equal(resolvePendingTarget(heroPowerGame, heroPowerGame.player.board[0].instanceId, fixed), true);
assert.equal(heroPowerGame.player.board[0].golden, true, "点金目标应正确变为金色");
assert.equal(startHeroPower(heroPowerGame), false, "点金术每局只能使用一次");

const effectTripleGame = createGame(HEROES[0].id, fixed);
const survivorDefinition = minion("BG35_814");
effectTripleGame.player.board = [createMinion(survivorDefinition), createMinion(survivorDefinition)];
const [firstTripleCopy, secondTripleCopy] = effectTripleGame.player.board;
firstTripleCopy.attack += 9; firstTripleCopy.health += 7; firstTripleCopy.maxHealth += 7;
firstTripleCopy.bloodGems = 2; firstTripleCopy.magneticCount = 1;
secondTripleCopy.attack += 4; secondTripleCopy.health += 5; secondTripleCopy.maxHealth += 5;
secondTripleCopy.bloodGems = 1; secondTripleCopy.magneticCount = 2;
effectTripleGame.player.board.forEach((card) => card.keywords.push("DIVINE_SHIELD"));
effectTripleGame.pendingDiscover = { title: "测试发现", items: [survivorDefinition], mode: "ADD_CARD" };
assert.equal(chooseDiscover(effectTripleGame, survivorDefinition.id, fixed), true, "效果获得第三张同名随从时应立即三连");
assert.equal(effectTripleGame.player.board.some((card) => card.baseId === survivorDefinition.id), false, "带圣盾和属性变化的同名随从也应被三连消耗");
assert.equal(effectTripleGame.player.hand.filter((card) => card.baseId === survivorDefinition.id && card.golden).length, 1, "三连后应在手牌生成金色随从");
const inheritedGolden = effectTripleGame.player.hand.find((card) => card.baseId === survivorDefinition.id && card.golden);
assert.equal(inheritedGolden.attack, survivorDefinition.attack * 2 + 13, "金色随从应继承三张素材的全部额外攻击力");
assert.equal(inheritedGolden.maxHealth, survivorDefinition.health * 2 + 12, "金色随从应继承三张素材的全部额外生命值");
assert.equal(inheritedGolden.health, inheritedGolden.maxHealth, "合成后的金色随从应以完整生命值进入手牌");
assert.ok(inheritedGolden.keywords.includes("DIVINE_SHIELD"), "金色随从应继承素材后天获得的关键词");
assert.equal(inheritedGolden.bloodGems, 3, "金色随从应继承鲜血宝石计数");
assert.equal(inheritedGolden.magneticCount, 3, "金色随从应继承磁力计数");
assert.equal(effectTripleGame.stats.triples, 1);

const savedTripleGame = createGame(HEROES[0].id, fixed);
savedTripleGame.player.board = [createMinion(survivorDefinition), createMinion(survivorDefinition)];
savedTripleGame.player.board.forEach((card) => card.keywords.push("DIVINE_SHIELD"));
savedTripleGame.player.hand = [createMinion(survivorDefinition)];
assert.equal(resolveTriples(savedTripleGame), true, "旧存档中已存在的三张同名随从应自动补做三连");
assert.equal(savedTripleGame.player.board.length, 0);
assert.equal(savedTripleGame.player.hand.filter((card) => card.baseId === survivorDefinition.id && card.golden).length, 1);

const magneticGame = createGame(HEROES[0].id, fixed);
magneticGame.player.board = [createMinion(minion("BG25_001"))];
const hand = createMinion(minion("BG_DEEP_015"));
magneticGame.player.hand = [hand];
assert.equal(playCard(magneticGame, hand.instanceId, null, false, fixed), "PENDING");
assert.equal(resolvePendingTarget(magneticGame, magneticGame.player.board[0].instanceId, fixed), true);
assert.equal(magneticGame.player.board.length, 1);
assert.ok(magneticGame.player.board[0].attack >= 5);

const sixMinionGame = createGame(HEROES[0].id, fixed);
sixMinionGame.player.board = Array.from({ length: 6 }, () => createMinion(minion("BG28_300")));
const seventhMinion = createMinion(minion("BG29_888"));
sixMinionGame.player.hand = [seventhMinion];
assert.equal(playCard(sixMinionGame, seventhMinion.instanceId, null, false, fixed), true, "战队为6/7时手牌随从应可以上场");
assert.equal(sixMinionGame.player.board.length, 7);

const dragSellGame = createGame(HEROES[0].id, fixed);
const soldMinion = createMinion(minion("BG29_888"));
dragSellGame.player.board = [soldMinion];
dragSellGame.player.gold = 4;
assert.equal(sellMinion(dragSellGame, soldMinion.instanceId), true, "拖回酒馆的场上随从应可正常出售");
assert.equal(dragSellGame.player.board.length, 0);
assert.equal(dragSellGame.player.gold, 5, "出售随从应获得1枚铸币");

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

console.log("engine tests passed: 152 minions across six tribes and neutral, economic bots, combat events, targeting, spells, magnetic, blood gems, venomous, rally, reborn, 160 fuzz battles");
