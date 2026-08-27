import { HEROES, MAX_BOARD, MINIONS, TRIBES } from "./data.js?v=42";
import {
  activateHeroPower, activateMinion, advanceRound, beginCombat, buyMinion, cancelPendingAction, canEndTurn,
  cardPurchaseCost, castSpell, chooseDiscover, createGame, gameResult, moveMinion, playCard, playerRank,
  reconcileBotUpgradeScaling, reconcileCardDefinitions, refreshShop, reorderMinion, resolvePendingTarget, resolveTriples, sellMinion, standings, toggleFreeze,
  startHeroPower, tavernRefreshCost, upgradeTavern,
} from "./engine.js?v=42";
import { attackVectorGeometry, battleFrameDelay, battleHeaderState, combatKeywordState, newCombatantIds } from "./battle-presentation.js?v=42";

const app = document.querySelector("#app");
const SAVE_KEY = "mergewar-save-v3";
const CLIENT_VERSION = "prototype-v42";
const MAX_BEHAVIOR_EVENTS = 300;
const BUG_REPORT_LOG_LIMIT = MAX_BEHAVIOR_EVENTS;
let game = loadGame();
let selectedBoardId = null;
let selectedCard = null;
let battleFrame = 0;
let battleTimer = null;
let battlePlaying = false;
let battleSpeed = 1;
let pointerDrag = null;
let dragState = null;
let suppressClickUntil = 0;
let bugReportOpen = false;
let bugReportStatus = "IDLE";

function createPlaytestMetadata() {
  const fallbackId = `playtest-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { sessionId: globalThis.crypto?.randomUUID?.() || fallbackId, startedAt: Date.now(), behaviorLog: [], gameUploadStatus: "PENDING", feedbackStatus: "IDLE" };
}

function ensurePlaytestMetadata() {
  if (!game.playtest?.sessionId) game.playtest = createPlaytestMetadata();
  if (!Array.isArray(game.playtest.behaviorLog)) game.playtest.behaviorLog = [];
  if (!game.playtest.gameUploadStatus) game.playtest.gameUploadStatus = "PENDING";
  return game.playtest;
}

function recordBehavior(action, card = null, success = true) {
  if (!game || !action) return;
  const playtest = ensurePlaytestMetadata();
  const event = {
    atMs: Math.max(0, Date.now() - playtest.startedAt), round: game.round, phase: game.phase, action,
    cardId: card?.baseId || "", success: success !== false,
    gold: game.player?.gold || 0, tier: game.player?.tier || 0,
    boardSize: game.player?.board?.length || 0, handSize: game.player?.hand?.length || 0,
  };
  playtest.behaviorLog.push(event);
  if (playtest.behaviorLog.length > MAX_BEHAVIOR_EVENTS) playtest.behaviorLog.splice(0, playtest.behaviorLog.length - MAX_BEHAVIOR_EVENTS);
}

function saveGame() {
  if (!game) return localStorage.removeItem(SAVE_KEY);
  localStorage.setItem(SAVE_KEY, JSON.stringify(game));
}

function loadGame() {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (saved?.playtest?.gameUploadStatus === "UPLOADING") saved.playtest.gameUploadStatus = "PENDING";
    if (saved?.version === 3) {
      const currentHero = HEROES.find((hero) => hero.id === saved.hero?.id);
      if (currentHero) saved.hero = currentHero;
      for (const owner of [saved.player, ...(saved.bots || [])]) {
        if (!owner) continue;
        owner.armor ??= 0; owner.goldCap ??= 10; owner.nextTurnGold ??= 0;
        owner.turnGoldCap ??= Math.max(owner.gold || 0, Math.min(owner.goldCap, (saved.round || 1) + 2));
        owner.wins ??= 0; owner.losses ??= 0;
        owner.scheduledBoardBuffs ??= []; owner.pendingBattleBuffs ??= []; owner.combatSpells ??= {};
        owner.modifiers ??= {};
        Object.assign(owner.modifiers, {
          shopAttack: 0, shopHealth: 0, shopTribeBuffs: {}, elementalAttack: 0, elementalHealth: 0,
          bloodGemAttack: 0, bloodGemHealth: 0, beetleAttack: 0, beetleHealth: 0, refreshBuffs: [],
          refreshBloodGems: 0, airSpent: 0, elementalPlays: 0, spellsCast: 0, chooseBothUsed: false,
          ...owner.modifiers,
        });
      }
      saved.player.heroPowerUsed ??= false;
      saved.player.heroPowerUsedThisTurn ??= false;
      const difficultyHealed = reconcileBotUpgradeScaling(saved);
      const definitionsHealed = reconcileCardDefinitions(saved);
      if (resolveTriples(saved) || difficultyHealed || definitionsHealed || currentHero) localStorage.setItem(SAVE_KEY, JSON.stringify(saved));
    }
    return saved?.version === 3 ? saved : null;
  } catch { return null; }
}

function tribeLabel(card) {
  if (card.kind === "SPELL") return "酒馆法术";
  return (card.tribes || [card.tribe]).map((tribe) => `${TRIBES[tribe]?.icon || "◇"} ${TRIBES[tribe]?.name || tribe}`).join(" · ");
}

function cardText(card) {
  if (card?.baseId === "BG20_GEM") {
    const modifiers = game?.player?.modifiers || {};
    return `使一个随从获得+${1 + (modifiers.bloodGemAttack || 0)}/+${1 + (modifiers.bloodGemHealth || 0)}。`;
  }
  return card?.text || "无特殊效果";
}

function shopBuffStatus() {
  const modifiers = game.player.modifiers || {};
  const attack = modifiers.shopAttack || 0;
  const health = modifiers.shopHealth || 0;
  if (!attack && !health) return "";
  return `<span class="shop-buff-status" title="刷新和购买到的酒馆随从会继承这项强化">酒馆随从 +${attack}/+${health}</span>`;
}

const KEYWORD_LABELS = {
  DIVINE_SHIELD: "圣盾", WINDFURY: "风怒", TAUNT: "嘲讽", REBORN: "复生",
  ATTACK_IMMUNE: "攻击免疫", MAGNETIC: "磁力",
  VENOMOUS: "烈毒", STEALTH: "潜行",
};

function keywordBadges(card, compact = false) {
  const keywords = [...new Set(card.keywords || [])].filter((key) => KEYWORD_LABELS[key]);
  if (!keywords.length) return "";
  return `<div class="keyword-row ${compact ? "compact" : ""}">${keywords.map((key) => `<span data-keyword="${key}">${KEYWORD_LABELS[key]}</span>`).join("")}</div>`;
}

function goldenDecor(card) {
  return card.golden ? `<i class="golden-sheen" aria-hidden="true"></i><i class="golden-badge">✦ 金色</i>` : "";
}

function boardMinionView(card) {
  const pendingTarget = game.pendingAction?.validIds?.includes(card.instanceId);
  const selected = selectedBoardId === card.instanceId;
  const keywords = new Set(card.keywords || []);
  const effects = [
    keywords.has("DIVINE_SHIELD") ? `<i class="recruit-vfx shield-aura" aria-hidden="true"></i>` : "",
    keywords.has("WINDFURY") ? `<i class="recruit-vfx windfury-aura" aria-hidden="true"></i>` : "",
    keywords.has("TAUNT") ? `<i class="recruit-vfx taunt-aura" aria-hidden="true"></i>` : "",
    keywords.has("REBORN") ? `<i class="recruit-vfx reborn-aura" aria-hidden="true"></i>` : "",
  ].join("");
  return `<article class="game-card board-minion ${card.golden ? "golden" : ""} ${pendingTarget ? "valid-target" : ""} ${selected ? "selected" : ""}"
      data-card-id="${card.instanceId}" data-zone="board" data-kind="MINION" data-tribe="${card.tribe}" draggable="true">
    <div class="minion-portrait">${effects}${goldenDecor(card)}<span class="minion-art"><img src="${card.imageUrl}" alt="${card.name}" loading="lazy" draggable="false"></span><span class="minion-tier">${card.tier}</span>
      <b>${card.golden ? "✦ " : ""}${card.name}</b><div class="minion-stats"><strong>${card.attack}</strong><strong>${card.health}</strong></div></div>
    ${keywordBadges(card, true)}
    <div class="board-minion-actions">${card.activate ? `<button data-action="activate" data-id="${card.instanceId}" ${card.activatedThisTurn || game.player.gold < card.activateCost ? "disabled" : ""}>发动 · ${card.activateCost}</button>` : ""}<button data-action="sell" data-id="${card.instanceId}">出售</button></div>
  </article>`;
}

function cardView(card, zone) {
  if (zone === "board") return boardMinionView(card);
  const isSpell = card.kind === "SPELL";
  const pendingTarget = game.pendingAction?.validIds?.includes(card.instanceId);
  const selected = selectedBoardId === card.instanceId;
  const disabled = game.phase !== "SHOP";
  let controls = "";
  const price = cardPurchaseCost(game, card);
  const cannotPay = card.healthCost ? game.player.health <= price : game.player.gold < price;
  if (zone === "shop") {
    const unavailable = disabled || cannotPay;
    return `<article class="game-card shop-card ${isSpell ? "spell-card" : ""} ${card.golden ? "golden" : ""} ${selected ? "selected" : ""}"
        data-card-id="${card.instanceId}" data-zone="shop" data-kind="${card.kind}" data-tribe="${card.tribe || "SPELL"}">
      ${goldenDecor(card)}
      <button class="shop-card-art" data-action="inspect" data-id="${card.instanceId}" aria-label="查看${card.name}"><img src="${card.imageUrl}" alt="${card.name}" loading="lazy"></button>
      <div class="cost-diamond ${card.healthCost ? "health-cost" : ""}" title="${card.healthCost ? "生命费用" : "购买费用"}"><span>${price}</span></div>
      <div class="shop-card-copy"><h3>${card.golden ? "✦ " : ""}${card.name}</h3><small>${tribeLabel(card)} · ${card.tier || "法术"}级</small>${keywordBadges(card, true)}<p>${cardText(card)}</p></div>
      ${!isSpell ? `<div class="shop-stats"><b title="攻击力">${card.attack}</b><b title="生命值">${card.health}</b></div>` : ""}
      <button class="shop-buy" data-action="buy" data-id="${card.instanceId}" ${unavailable ? "disabled" : ""}>${unavailable ? "不可购买" : "购买"}</button>
    </article>`;
  }
  if (zone === "hand") controls = `<button data-action="play" data-id="${card.instanceId}" ${disabled || card.lockedTurns > 0 ? "disabled" : ""}>${card.lockedTurns > 0 ? `锁定 ${card.lockedTurns}` : isSpell ? "施放" : "上场"}</button>`;
  return `<article class="game-card ${isSpell ? "spell-card" : ""} ${card.golden ? "golden" : ""} ${pendingTarget ? "valid-target" : ""} ${selected ? "selected" : ""}"
      data-card-id="${card.instanceId}" data-zone="${zone}" data-kind="${card.kind}" data-tribe="${card.tribe || "SPELL"}" ${zone === "hand" ? `draggable="true"` : ""}>
    ${goldenDecor(card)}
    <div class="tier-gem">${card.tier || "✦"}</div>
    <button class="art-button" data-action="inspect" data-id="${card.instanceId}">
      <img src="${card.imageUrl}" alt="${card.name}" loading="lazy" draggable="false"><span>${card.name}</span>
    </button>
    <div class="card-meta">${tribeLabel(card)}</div>
    ${keywordBadges(card)}
    <p>${cardText(card)}</p>
    ${!isSpell ? `<div class="card-stats"><b>${card.attack}</b><b>${card.health}</b></div>` : ""}
    <div class="card-controls">${controls}</div>
  </article>`;
}

function renderStart() {
  const hasSave = Boolean(game);
  app.innerHTML = `<main class="start-screen">
    <section class="start-copy"><span class="brand-mark">✦</span><p class="eyebrow">MERGEWAR · 私有研究版</p>
      <h1>十分钟酒馆构筑</h1><p>六大种族与中立完整卡池 · 横屏操作 · 独立战斗舞台</p>
      ${hasSave ? `<button class="resume-button" data-action="resume">继续第${game.round}回合</button>` : ""}
    </section>
    <section class="hero-grid">${HEROES.map((hero) => `<button class="hero-choice" data-hero="${hero.id}">
      <img src="${hero.imageUrl}" alt="${hero.name}"><div><small>${hero.tag}</small><strong>${hero.name}</strong><p>${hero.description}</p></div>
    </button>`).join("")}</section>
    <p class="legal-note">内部玩法研究原型，炉石名称与远程图片不用于公开发行。</p>
  </main>`;
}

function heroPowerControl() {
  const activation = game.hero.activation;
  if (activation) {
    const used = activation.limit === "GAME" ? game.player.heroPowerUsed : game.player.heroPowerUsedThisTurn;
    const pending = game.pendingAction?.type === "HERO_POWER";
    const hasTarget = !activation.target || (game.hero.power === "GOLDEN_TOUCH" && game.player.board.some((item) => !item.golden));
    const ready = game.phase === "SHOP" && !used && !game.pendingAction && hasTarget && game.player.gold >= (activation.cost || 0);
    const state = used ? (activation.limit === "GAME" ? "本局已使用" : "本回合已使用")
      : pending ? "请选择目标"
      : game.player.gold < (activation.cost || 0) ? "铸币不足"
      : activation.target && !hasTarget ? "先打出随从"
      : activation.target ? "选择一个随从" : game.hero.description;
    return `<button class="hero-power-control ${pending ? "active" : ""}" data-action="${activation.target ? "hero-power-select" : "hero-power-use"}" ${ready ? "" : "disabled"}>
      <span>英雄技能 · ${activation.cost || 0}</span><b>${game.hero.tag}</b><small>${state}</small>
    </button>`;
  }
  return `<div class="hero-power-control passive"><span>英雄技能 · 被动</span><b>${game.hero.tag}</b><small>${game.hero.description}</small></div>`;
}

const BUG_ACTION_LABELS = {
  "game-start": "开始对局", buy: "购买卡牌", play: "随从上场", sell: "出售随从", refresh: "刷新酒馆",
  upgrade: "升级酒馆", freeze: "冻结酒馆", combat: "进入战斗", continue: "返回酒馆", cast: "施放法术",
  activate: "发动随从", "hero-power-use": "发动英雄技能", "hero-power-select": "选择英雄技能目标",
  "drag-play": "拖动随从上场", "drag-cast": "拖动施放法术", "drag-sell": "拖动出售", "drag-reorder": "拖动调整站位",
  "resolve-target": "选择效果目标", "bug-report-open": "打开快速反馈",
};

function bugReportTrigger(extraClass = "") {
  return `<button class="bug-report-trigger ${extraClass}" type="button" data-action="bug-report-open" aria-label="快速反馈问题" title="快速反馈问题">
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M9.8 9.2a2.35 2.35 0 0 1 4.55.75c0 1.8-2.35 2.05-2.35 3.65"></path><path d="M12 17.25h.01"></path></svg>
  </button>`;
}

function renderBugReportDialog() {
  if (!bugReportOpen) return "";
  const playtest = ensurePlaytestMetadata();
  const logs = playtest.behaviorLog.slice(-BUG_REPORT_LOG_LIMIT);
  if (bugReportStatus === "SUBMITTED") return `<div class="bug-report-overlay"><section class="bug-report-dialog bug-report-done" role="dialog" aria-modal="true" aria-labelledby="bug-report-title">
    <button class="bug-report-close" type="button" data-action="bug-report-close" aria-label="关闭">×</button><span>✓</span><h2 id="bug-report-title">问题已收到</h2><p>已保存你的描述和所选操作日志，我们会结合当时的游戏状态排查。</p><button type="button" data-action="bug-report-close">继续游戏</button>
  </section></div>`;
  const preview = logs.slice(-6).map((event) => `<li><b>第${event.round}回合</b><span>${BUG_ACTION_LABELS[event.action] || event.action}</span>${event.cardId ? `<small>${event.cardId}</small>` : ""}</li>`).join("");
  return `<div class="bug-report-overlay"><form class="bug-report-dialog" id="bug-report-form" role="dialog" aria-modal="true" aria-labelledby="bug-report-title">
    <div class="bug-report-heading"><div><small>快速反馈 · 不会结束当前对局</small><h2 id="bug-report-title">遇到了什么问题？</h2></div><button class="bug-report-close" type="button" data-action="bug-report-close" aria-label="关闭">×</button></div>
    <label class="bug-report-description">一句话描述问题<textarea name="description" maxlength="500" rows="2" required autofocus placeholder="例如：拖动鲜血宝石后没有生效"></textarea></label>
    <label class="bug-log-option"><input type="checkbox" name="includeLogs" checked><span><b>附带本局全部 ${logs.length} 条操作日志</b><small>默认已勾选，仅包含游戏内操作、回合和阵容状态</small></span></label>
    <div class="bug-log-preview"><small>最近 ${Math.min(6, logs.length)} 条预览 · 提交包含本局全部日志</small>${preview ? `<ol>${preview}</ol>` : `<p>当前还没有操作记录</p>`}</div>
    <div class="bug-report-actions"><p class="bug-report-error" aria-live="polite"></p><button type="submit">提交 Bug</button></div>
  </form></div>`;
}

function combatButtonLabel() {
  if (!game.player.board.length) return "先上阵一个随从";
  if (game.pendingDiscover || game.pendingAction) return "先完成当前选择";
  return "进入战斗 →";
}

function renderTopbar(displayState = {}) {
  const shopPhase = game.phase === "SHOP";
  const displayHealth = displayState.health ?? game.player.health;
  const displayArmor = displayState.armor ?? game.player.armor;
  const displayRank = displayState.rank ?? playerRank(game);
  return `<header class="topbar">
    <div class="round"><span>回合</span><b>${game.round}</b><i>/${game.maxRounds}</i></div>
    <div class="hero-cluster"><div class="hero"><img src="${game.hero.imageUrl}" alt=""><div><b>${game.hero.name}</b><small>${game.hero.tag}</small></div></div>${heroPowerControl()}</div>
    <div class="resources"><span class="hp">♥ ${displayHealth}</span>${displayArmor ? `<span class="armor">◆ ${displayArmor}</span>` : ""}<span class="coin" title="当前铸币 / 本回合铸币额度">● ${game.player.gold}/${game.player.turnGoldCap || Math.max(game.player.gold, Math.min(game.player.goldCap || 10, game.round + 2))}</span><span># ${displayRank}</span></div>
    ${shopPhase ? `<button class="combat-button topbar-combat" data-action="combat" ${canEndTurn(game) ? "" : "disabled"}>${combatButtonLabel()}</button>` : ""}
    <div class="topbar-tools"><button class="quiet-button" data-action="new-game">重新开始</button>${bugReportTrigger()}</div>
  </header>`;
}

function renderStandings() {
  return `<aside class="standings"><div class="side-title">8人酒馆</div>${standings(game).map((item, index) => `<div class="standing ${item.id === "player" ? "you" : ""} ${!item.alive ? "dead" : ""}">
    <b>${index + 1}</b><i style="--c:${item.accent || "#f4c76b"}"></i><div><strong>${item.name}</strong><small>${item.hero}</small></div><span>${item.alive ? `♥${item.health}` : "淘汰"}</span>
  </div>`).join("")}</aside>`;
}

function renderShop() {
  const opponent = game.currentOpponent;
  const targetText = game.pendingAction?.type === "HERO_POWER"
    ? "选择要变为金色的随从"
    : game.pendingAction?.type === "SPELL"
      ? `选择高亮随从，施放${game.pendingAction.sourceName || "法术"}`
      : game.pendingAction ? "选择一个高亮目标" : "";
  const targetHint = game.pendingAction ? `<div class="target-banner">${targetText} <button data-action="cancel-target">取消</button>${game.pendingAction.allowNoTarget ? `<button data-action="normal-play">普通打出</button>` : ""}</div>` : "";
  app.innerHTML = `<main class="game-shell shop-screen">${renderTopbar()}${targetHint}
    <div class="landscape-layout">${renderStandings()}
      <section class="recruit-stage tavern-table">
        <div class="opponent-bar" title="${opponent.decisions?.join(" · ") || "正在规划阵容"}"><div><div class="opponent-name"><small>下一位对手</small><b>${opponent.name}</b></div><span>${opponent.hero} · ${opponent.tier}级酒馆 · 已升本${opponent.economy?.upgrades || 0}次</span></div>
          <div class="enemy-mini">${opponent.board.map((item) => `<span title="${item.name}"><img src="${item.imageUrl}" alt=""><i>${item.attack}/${item.health}</i></span>`).join("")}</div></div>
        <section class="zone shop-zone" data-drop-zone="shop" data-drop-label="松开出售 · +1铸币"><header><div class="zone-heading"><span class="zone-step">1</span><div><small>购买区 · 从这里挑选卡牌</small><h2>${game.player.tier}级酒馆商店 ${shopBuffStatus()}</h2></div></div><div class="shop-actions">
          <button data-action="upgrade" ${game.player.tier >= 6 || game.player.gold < game.player.upgradeCost ? "disabled" : ""}>升级 · ${game.player.tier >= 6 ? "满级" : game.player.upgradeCost}</button>
          <button data-action="refresh" ${game.player.gold < tavernRefreshCost(game) ? "disabled" : ""}>刷新 · ${tavernRefreshCost(game) ? tavernRefreshCost(game) : "免费"}</button>
          <button data-action="freeze" class="${game.player.frozen ? "active" : ""}">${game.player.frozen ? "已冻结" : "冻结"}</button>
        </div></header><div class="zone-help">购买后进入手牌 · 将场上随从拖到这里出售</div><div class="card-strip shop-strip" data-count="${game.player.shop.length}">${game.player.shop.map((item) => cardView(item, "shop")).join("") || `<div class="empty"><b>商店已买空</b><span>刷新后会补充新的随从和法术</span></div>`}</div></section>
        <section class="zone board-zone" data-drop-zone="board" data-drop-label="松开上场"><header><div class="zone-heading"><span class="zone-step">2</span><div><small>上阵区 · 战斗时自动出战</small><h2>你的战队 <em>${game.player.board.length}/${MAX_BOARD}</em></h2></div></div><span>${selectedBoardId ? "再点一张随从可交换位置" : "拖动随从调整攻击顺序"}</span></header>
          <div class="zone-help">从左到右依次攻击 · 拖动调整顺序 · 拖回上方出售</div><div class="card-strip board-strip" data-count="${game.player.board.length}">${game.player.board.map((item) => cardView(item, "board")).join("") || `<div class="empty board-empty"><b>战队还是空的</b><span>将下方手牌中的随从拖到这里上场</span></div>`}</div></section>
        <section class="zone hand-zone"><header><div class="zone-heading"><span class="zone-step">3</span><div><small>准备区 · 购买和获取的牌先到这里</small><h2>你的手牌 <em>${game.player.hand.length}/10</em></h2></div></div><span>随从拖到战队 · 法术拖到目标随从或点“施放”</span></header>
          <div class="card-strip hand-strip" data-count="${game.player.hand.length}">${game.player.hand.map((item) => cardView(item, "hand")).join("") || `<div class="empty compact"><b>手牌为空</b><span>从上方商店购买卡牌</span></div>`}</div></section>
      </section>
      <aside class="detail-panel">${renderDetail()}<div class="message-log"><b>最近事件</b>${game.messages.slice(0, 6).map((text) => `<p>${text}</p>`).join("")}</div></aside>
    </div>
    <footer class="action-bar"><span><b>当前提示</b>${game.messages[0]}</span><button class="combat-button mobile-combat" data-action="combat" ${canEndTurn(game) ? "" : "disabled"}>${combatButtonLabel()}</button></footer>
    ${game.pendingDiscover ? renderDiscover() : ""}
    ${renderBugReportDialog()}
    <div class="rotate-hint">旋转设备，横屏体验完整酒馆</div>
  </main>`;
}

function renderDetail() {
  const card = selectedCard || game.player.board[0] || game.player.shop[0];
  if (!card) return `<div class="detail-empty">点击卡牌查看详情</div>`;
  return `<div class="detail-card ${card.golden ? "golden-detail" : ""}"><img src="${card.imageUrl}" alt="${card.name}">${card.golden ? `<em class="detail-golden">✦ 金色随从</em>` : ""}<small>${tribeLabel(card)} · ${card.tier || "法术"}级</small><h3>${card.golden ? "✦ " : ""}${card.name}</h3>${keywordBadges(card)}<p>${cardText(card)}</p>${card.kind !== "SPELL" ? `<strong>${card.attack} / ${card.health}</strong>` : ""}</div>`;
}

function renderDiscover() {
  const pending = Array.isArray(game.pendingDiscover) ? { title: "发现一个更高等级随从", items: game.pendingDiscover } : game.pendingDiscover;
  return `<div class="overlay"><section class="discover"><small>做出选择</small><h2>${pending.title}</h2><div>${pending.items.map((item) => `<button data-action="discover" data-id="${item.id}">${item.imageUrl ? `<img src="${item.imageUrl}" alt="">` : ""}<b>${item.name}</b>${item.attack != null && item.health != null ? `<span>${item.attack}/${item.health}</span>` : ""}<p>${item.text || ""}</p></button>`).join("")}</div></section></div>`;
}

function renderBattle() {
  const battle = game.battle;
  const frames = battle.frames?.length ? battle.frames : [{ label: "战斗结果", player: battle.playerBoard, enemy: battle.enemyBoard }];
  battleFrame = Math.min(battleFrame, frames.length - 1);
  const frame = frames[battleFrame];
  const previousFrame = frames[battleFrame - 1];
  const playerArrivals = newCombatantIds(frame, previousFrame, "player");
  const enemyArrivals = newCombatantIds(frame, previousFrame, "enemy");
  const eventType = frame.event?.type || "state";
  const finished = battleFrame >= frames.length - 1;
  const headerState = battleHeaderState(battle, game.player, playerRank(game), finished);
  if (finished) battlePlaying = false;
  app.innerHTML = `<main class="battle-screen">${renderTopbar(headerState)}
    <section class="battle-stage battle-arena event-${eventType}" data-event-type="${eventType}">
      <header><div><small>第${game.round}回合 · ${battle.opponent.name}</small><h1 aria-live="polite">${frame.label}</h1></div><div class="playback">
        <button data-action="battle-toggle" ${finished ? "disabled" : ""}>${battlePlaying ? "暂停" : "播放"}</button>
        <button data-action="battle-speed">${battleSpeed}×</button><button data-action="battle-prev" ${battleFrame === 0 ? "disabled" : ""}>‹</button><span>${battleFrame + 1}/${frames.length}</span><button data-action="battle-next" ${finished ? "disabled" : ""}>›</button><button data-action="battle-skip">跳到结果</button>
      </div></header>
      <div class="battle-event-cue" aria-hidden="true"><span>${eventType === "attack" ? "交战" : eventType === "reborn" ? "复生" : eventType === "resolve" ? "结算" : "战斗"}</span></div>
      ${renderAttackVector(frame)}
      <div class="combat-board enemy-board ${frame.event?.targetSide === "enemy" ? "impact-board" : ""}" data-count="${frame.enemy.length}"><div class="battle-side-badge"><small>对手</small><b>${battle.opponent.name}</b></div>${frame.enemy.map((item) => battleCard(item, "enemy", frame, enemyArrivals)).join("") || `<div class="defeated">全军覆没</div>`}</div>
      <div class="versus-line"><span></span><b>VS</b><i class="impact-flash" aria-hidden="true"></i><span></span></div>
      <div class="combat-board player-board ${frame.event?.targetSide === "player" ? "impact-board" : ""}" data-count="${frame.player.length}"><div class="battle-side-badge"><small>我方</small><b>${game.hero.name}</b></div>${frame.player.map((item) => battleCard(item, "player", frame, playerArrivals)).join("") || `<div class="defeated">全军覆没</div>`}</div>
      <footer><div><p>${finished ? battleResultText(battle) : frame.event?.type === "attack" ? "高亮卡牌正在交战，数字为本次承受的伤害。" : frame.event?.type === "reborn" ? "复生：该随从以初始攻击力和1点生命值重新返回战场。" : "触发效果结算中，可暂停或调整播放速度。"}</p>${finished ? `<div class="battle-insights">${(battle.insights || []).map((text) => `<span>${text}</span>`).join("")}</div>` : ""}</div><button data-action="continue" ${finished ? "" : "disabled"}>${finished ? (!game.player.alive || game.round >= game.maxRounds ? "查看结果" : "返回酒馆") : "战斗结算中"}</button></footer>
    </section>${renderBugReportDialog()}</main>`;
  requestAnimationFrame(() => positionAttackVector());
}

function renderAttackVector(frame) {
  const event = frame.event;
  if (event?.type !== "attack") return "";
  return `<svg class="attack-vector" data-attacker-side="${event.attackerSide}" data-attacker-id="${event.attackerId}" data-target-side="${event.targetSide}" data-target-id="${event.targetId}" aria-hidden="true"><defs><marker id="attack-arrow" markerUnits="userSpaceOnUse" markerWidth="18" markerHeight="18" refX="15" refY="9" orient="auto"><path d="M0,0 L18,9 L0,18 Z"></path></marker></defs><line pathLength="1" marker-end="url(#attack-arrow)"></line></svg>`;
}

function positionAttackVector() {
  const vector = app.querySelector(".attack-vector");
  if (!vector) return;
  const attacker = app.querySelector(`.${vector.dataset.attackerSide}-board [data-combat-id="${CSS.escape(vector.dataset.attackerId)}"]`);
  const target = app.querySelector(`.${vector.dataset.targetSide}-board [data-combat-id="${CSS.escape(vector.dataset.targetId)}"]`);
  const line = vector.querySelector("line");
  if (!attacker || !target || !line) return;
  const vectorRect = vector.getBoundingClientRect();
  const geometry = attackVectorGeometry(attacker.getBoundingClientRect(), target.getBoundingClientRect(), vectorRect);
  if (!geometry || !vectorRect.width || !vectorRect.height) return;
  vector.setAttribute("viewBox", `0 0 ${vectorRect.width} ${vectorRect.height}`);
  for (const [attribute, value] of Object.entries(geometry)) line.setAttribute(attribute, value.toFixed(2));
  vector.classList.add("positioned");
}

function battleCard(card, side, frame, arrivalIds = new Set()) {
  const event = frame.event || {};
  const attacking = event.attackerSide === side && event.attackerId === card.instanceId;
  const targeted = event.targetSide === side && event.targetId === card.instanceId;
  const reborned = event.type === "reborn" && event.side === side && event.minionId === card.instanceId;
  const damage = attacking ? event.damageToAttacker : targeted ? event.damageToTarget : 0;
  const shieldBroken = attacking ? event.attackerShieldBroken : targeted ? event.targetShieldBroken : false;
  const immune = attacking && event.attackerImmune;
  const defeated = event.type === "attack" && card.health <= 0;
  const arriving = arrivalIds.has(card.instanceId);
  const keywordState = combatKeywordState(card, event, side);
  const keywordNames = { REBORN: "复生", TAUNT: "嘲讽", DIVINE_SHIELD: "圣盾", WINDFURY: "风怒", ATTACK_IMMUNE: "攻击免疫", VENOMOUS: "烈毒", STEALTH: "潜行" };
  const keywords = (card.keywords || []).map((key) => keywordNames[key]).filter(Boolean);
  const stateClasses = [keywordState.taunt && "has-taunt", keywordState.windfury && "has-windfury", keywordState.reborn && "has-reborn", keywordState.tauntTriggered && "taunt-triggered", keywordState.windfuryTriggered && "windfury-triggered"].filter(Boolean).join(" ");
  return `<article class="combat-card ${stateClasses} ${card.golden ? "golden" : ""} ${card.shield ? "shield" : ""} ${attacking ? "attacking" : ""} ${targeted ? "targeted" : ""} ${defeated ? "defeated-card" : ""} ${arriving ? "summoned" : ""} ${reborned ? "reborned" : ""}" data-combat-id="${card.instanceId}">${renderKeywordEffects(keywordState, reborned)}${goldenDecor(card)}<span class="combat-art"><img src="${card.imageUrl}" alt=""></span><b>${card.name}</b>${keywords.length ? `<small class="combat-keywords">${keywords.join(" · ")}</small>` : ""}${event.type === "attack" && (damage || shieldBroken || immune) ? `<i class="float-change ${shieldBroken || immune ? "blocked" : ""}">${shieldBroken ? "圣盾破裂" : immune ? "免疫" : `-${damage}`}</i>` : ""}${reborned ? `<i class="keyword-pop">复生</i>` : ""}<div><span>${card.attack}</span><span>${Math.max(0, card.health)}</span></div></article>`;
}

function renderKeywordEffects(state, reborned) {
  return [
    state.taunt ? `<i class="keyword-vfx taunt-vfx" aria-hidden="true"><em></em></i>` : "",
    state.windfury ? `<i class="keyword-vfx windfury-vfx" aria-hidden="true"><em></em></i>` : "",
    state.reborn ? `<i class="keyword-vfx reborn-vfx" aria-hidden="true"><em></em></i>` : "",
    reborned ? `<i class="keyword-vfx reborn-trigger-vfx" aria-hidden="true"><em></em></i>` : "",
  ].join("");
}

function battleResultText(battle) {
  if (battle.winner === "tie") return "双方战平，没有受到伤害。";
  return battle.winner === "player" ? `战斗胜利，对${battle.opponent.name}造成${battle.damage}点伤害。` : `战斗失败，受到${battle.damage}点伤害。`;
}

function renderGameOver() {
  const result = gameResult(game);
  const playtest = ensurePlaytestMetadata();
  if (!playtest.endedAt) { playtest.endedAt = Date.now(); saveGame(); }
  const feedback = playtest.feedbackStatus === "SUBMITTED"
    ? `<section class="feedback-card feedback-thanks"><span>✓</span><h2>反馈已收到</h2><p>感谢你的评分和建议。</p></section>`
    : `<form class="feedback-card" id="feedback-form">
      <div class="feedback-heading"><div><small>匿名试玩反馈 · 约10秒</small><h2>给这一局打个分</h2></div><span>行为日志已自动保存</span></div>
      <fieldset class="rating-picker"><legend>1分表示不好玩，5分表示很好玩</legend><div>${[1, 2, 3, 4, 5].map((rating) => `<input type="radio" id="rating-${rating}" name="rating" value="${rating}" required><label for="rating-${rating}" aria-label="${rating}分"><b>${rating}</b><small>★</small></label>`).join("")}</div></fieldset>
      <label>有什么建议？<textarea name="suggestion" maxlength="1000" rows="3" placeholder="选填：哪里不顺、哪里不清楚，或最想调整什么"></textarea></label>
      <div class="feedback-actions"><p class="feedback-error" aria-live="polite"></p><button type="submit">提交反馈</button></div>
    </form>`;
  app.innerHTML = `<main class="game-over">${bugReportTrigger("floating")}<section class="result-panel"><span class="brand-mark">${result.rank === 1 ? "♛" : "✦"}</span><small>本局结束</small><h1>${result.title}</h1><p class="result-summary">${result.summary}</p>
    <div class="result-stats"><span><b>${game.round}</b>回合</span><span><b>${game.stats.wins}</b>胜利</span><span><b>${game.player.health}</b>剩余生命</span><span><b>${game.stats.triples}</b>三连</span><span><b>${game.stats.spells}</b>法术</span></div>
    <p class="ranking-rule">${result.rankingRule}</p>
    <div class="upload-status" aria-live="polite">${uploadStatusView(playtest)}</div></section>
    <section class="result-feedback-stack">${feedback}<button class="restart-button" data-action="restart">${playtest.feedbackStatus === "SUBMITTED" ? "再来一局" : "暂不反馈，直接重开"}</button></section>${renderBugReportDialog()}</main>`;
  if (playtest.gameUploadStatus === "PENDING") queueMicrotask(uploadCompletedGame);
}

function completedGameData() {
  const playtest = ensurePlaytestMetadata();
  const result = gameResult(game);
  return {
    sessionId: playtest.sessionId,
    clientVersion: CLIENT_VERSION,
    heroId: game.hero.id,
    heroName: game.hero.name,
    rank: result.rank,
    rounds: game.round,
    durationMs: Math.max(0, playtest.endedAt - playtest.startedAt),
    health: game.player.health,
    stats: game.stats,
    behaviorLog: playtest.behaviorLog,
    finalBoard: game.player.board.map((card) => ({ id: card.baseId, name: card.name, tribe: card.tribe, tier: card.tier, attack: card.attack, health: card.health, golden: card.golden })),
  };
}

function feedbackPayload(form) {
  const data = new FormData(form);
  return {
    game: completedGameData(),
    feedback: {
      rating: Number(data.get("rating")),
      suggestion: data.get("suggestion"),
    },
  };
}

const bugCardRef = (card) => ({
  id: card.baseId || card.id || "", name: card.name || "", attack: card.attack || 0,
  health: card.health || 0, golden: Boolean(card.golden),
});

function bugReportPayload(form) {
  const data = new FormData(form);
  const playtest = ensurePlaytestMetadata();
  const includeLogs = data.get("includeLogs") === "on";
  return {
    report: {
      sessionId: playtest.sessionId,
      clientVersion: CLIENT_VERSION,
      heroId: game.hero.id,
      heroName: game.hero.name,
      round: game.round,
      phase: game.phase,
      description: data.get("description"),
      includeLogs,
      behaviorLog: includeLogs ? playtest.behaviorLog.slice(-BUG_REPORT_LOG_LIMIT) : [],
      snapshot: {
        health: game.player.health, armor: game.player.armor, gold: game.player.gold,
        goldLimit: game.player.turnGoldCap, tier: game.player.tier, rank: playerRank(game),
        board: game.player.board.map(bugCardRef), hand: game.player.hand.map(bugCardRef),
        shop: game.player.shop.map(bugCardRef), message: game.messages[0] || "",
        battleFrame, battleFrames: game.battle?.frames?.length || 0,
      },
      viewport: { width: window.innerWidth, height: window.innerHeight },
    },
  };
}

function uploadStatusView(playtest) {
  if (playtest.gameUploadStatus === "UPLOADED") return `<span class="saved">✓ 本局行为与结果已匿名保存</span>`;
  if (playtest.gameUploadStatus === "FAILED") return `<span class="failed">本局数据暂未上传</span><button data-action="retry-upload">重新上传</button>`;
  return `<span>正在匿名保存本局行为与结果…</span>`;
}

function syncUploadStatus() {
  const target = app.querySelector(".upload-status");
  if (target) target.innerHTML = uploadStatusView(ensurePlaytestMetadata());
}

async function uploadCompletedGame() {
  const playtest = ensurePlaytestMetadata();
  if (["UPLOADING", "UPLOADED"].includes(playtest.gameUploadStatus)) return;
  playtest.gameUploadStatus = "UPLOADING"; saveGame(); syncUploadStatus();
  try {
    const response = await fetch("/api/playtests/complete", {
      method: "POST", headers: { "content-type": "application/json" }, keepalive: true,
      body: JSON.stringify({ game: completedGameData() }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "上传失败");
    playtest.gameUploadStatus = "UPLOADED";
    playtest.submissionId = result.id;
  } catch {
    playtest.gameUploadStatus = "FAILED";
  }
  saveGame(); syncUploadStatus();
}

async function submitFeedback(form) {
  const button = form.querySelector('button[type="submit"]');
  const errorBox = form.querySelector(".feedback-error");
  recordBehavior("feedback-submit"); saveGame();
  button.disabled = true; button.textContent = "正在提交…"; errorBox.textContent = "";
  try {
    const response = await fetch("/api/playtests/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(feedbackPayload(form)) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "提交失败，请稍后重试");
    game.playtest.feedbackStatus = "SUBMITTED";
    game.playtest.gameUploadStatus = "UPLOADED";
    game.playtest.submissionId = result.id;
    game.playtest.submittedAt = Date.now();
    saveGame(); render();
  } catch (error) {
    errorBox.textContent = error.message === "Failed to fetch" ? "无法连接反馈接口，请确认使用 npm run dev 启动项目。" : error.message;
    button.disabled = false; button.textContent = "重新提交";
  }
}

async function submitBugReport(form) {
  const button = form.querySelector('button[type="submit"]');
  const errorBox = form.querySelector(".bug-report-error");
  recordBehavior("bug-report-submit"); saveGame();
  button.disabled = true; button.textContent = "正在提交…"; errorBox.textContent = "";
  try {
    const response = await fetch("/api/bug-reports", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(bugReportPayload(form)),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "提交失败，请稍后重试");
    const playtest = ensurePlaytestMetadata();
    playtest.lastBugReportId = result.id;
    playtest.lastBugReportAt = Date.now();
    bugReportStatus = "SUBMITTED";
    saveGame(); render();
  } catch (error) {
    errorBox.textContent = error.message === "Failed to fetch" ? "暂时无法连接反馈接口，请稍后重试。" : error.message;
    button.disabled = false; button.textContent = "重新提交";
  }
}

function render() {
  clearTimeout(battleTimer);
  if (!game) return renderStart();
  if (game.phase === "GAME_OVER") return renderGameOver();
  if (game.phase === "COMBAT" && game.battle) return renderBattle();
  renderShop();
}

function startBattlePlayback() {
  battleFrame = 0; battlePlaying = true; battleSpeed = 1; saveGame(); render(); scheduleBattlePlayback(800);
}

function scheduleBattlePlayback(delay = null) {
  clearTimeout(battleTimer);
  if (!battlePlaying || !game?.battle || battleFrame >= game.battle.frames.length - 1) return;
  const frame = game.battle.frames[battleFrame];
  const reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches || false;
  const frameDelay = delay ?? battleFrameDelay(frame, battleSpeed, reducedMotion);
  battleTimer = setTimeout(() => {
    if (!battlePlaying || !game?.battle) return;
    battleFrame = Math.min(game.battle.frames.length - 1, battleFrame + 1);
    if (battleFrame >= game.battle.frames.length - 1) battlePlaying = false;
    render(); scheduleBattlePlayback();
  }, frameDelay);
}

function findCard(instanceId) {
  return [...(game?.player.shop || []), ...(game?.player.hand || []), ...(game?.player.board || [])].find((item) => item.instanceId === instanceId);
}

function canDropCard(sourceId, sourceZone, destinationZone) {
  if (!game || game.phase !== "SHOP" || game.pendingAction) return false;
  const card = findCard(sourceId);
  if (!card) return false;
  if (sourceZone === "hand" && destinationZone === "board") {
    if (card.lockedTurns > 0) return false;
    if (card.kind === "SPELL") return true;
    const canMagnetize = card.scripts?.includes("MAGNETIC") && game.player.board.some((item) => item.tribe === "UNDEAD" || item.tribes?.includes("UNDEAD"));
    return game.player.board.length < MAX_BOARD || canMagnetize;
  }
  if (sourceZone === "board" && destinationZone === "shop") return true;
  return sourceZone === "board" && destinationZone === "board";
}

function updateDragPresentation(sourceId = null, sourceZone = null, activeZone = null) {
  const shell = app.querySelector(".shop-screen");
  if (!shell) return;
  shell.classList.toggle("drag-from-hand", sourceZone === "hand");
  shell.classList.toggle("drag-from-board", sourceZone === "board");
  shell.querySelectorAll("[data-drop-zone]").forEach((zone) => {
    const ready = canDropCard(sourceId, sourceZone, zone.dataset.dropZone);
    zone.classList.toggle("drop-ready", ready);
    zone.classList.toggle("drop-active", ready && zone.dataset.dropZone === activeZone);
  });
  shell.querySelectorAll(".game-card.dragging").forEach((card) => card.classList.toggle("dragging", card.dataset.cardId === sourceId));
  shell.querySelector(`.game-card[data-card-id="${CSS.escape(sourceId || "")}"]`)?.classList.add("dragging");
}

function clearDragPresentation() {
  const shell = app.querySelector(".shop-screen");
  shell?.classList.remove("drag-from-hand", "drag-from-board");
  shell?.querySelectorAll(".drop-ready,.drop-active,.dragging").forEach((element) => element.classList.remove("drop-ready", "drop-active", "dragging"));
}

function performCardDrop(sourceId, sourceZone, destinationZone, targetCard = null) {
  if (!canDropCard(sourceId, sourceZone, destinationZone)) return false;
  const moved = findCard(sourceId);
  let result = false;
  let action = "drag-drop";
  if (sourceZone === "hand" && destinationZone === "board") {
    if (moved.kind === "SPELL") {
      const targetId = targetCard?.dataset.cardId || null;
      result = castSpell(game, sourceId, targetId);
      if (!result && targetId && game.player.hand.some((item) => item.instanceId === sourceId)) result = castSpell(game, sourceId);
      action = "drag-cast";
    } else {
      result = playCard(game, sourceId);
      action = "drag-play";
    }
  } else if (sourceZone === "board" && destinationZone === "shop") {
    result = sellMinion(game, sourceId);
    action = "drag-sell";
    if (result) selectedBoardId = null;
  } else if (sourceZone === "board" && destinationZone === "board") {
    const targetId = targetCard?.dataset.cardId;
    const targetIndex = targetId ? game.player.board.findIndex((item) => item.instanceId === targetId) : game.player.board.length - 1;
    if (targetId !== sourceId && targetIndex >= 0) result = reorderMinion(game, sourceId, targetIndex);
    action = "drag-reorder";
    if (result) selectedBoardId = null;
  }
  recordBehavior(action, moved, result);
  saveGame();
  render();
  return result;
}

app.addEventListener("click", (event) => {
  if (Date.now() < suppressClickUntil) { event.preventDefault(); return; }
  const target = event.target.closest("[data-action], [data-hero], .game-card[data-zone=board]");
  if (!target) return;
  if (target.dataset.hero) { game = createGame(target.dataset.hero); game.playtest = createPlaytestMetadata(); recordBehavior("game-start"); selectedCard = null; saveGame(); render(); return; }
  const pendingCard = event.target.closest(".game-card[data-card-id]");
  if (game?.pendingAction && pendingCard && game.pendingAction.validIds.includes(pendingCard.dataset.cardId)) {
    const targetCard = findCard(pendingCard.dataset.cardId);
    const resolved = resolvePendingTarget(game, pendingCard.dataset.cardId);
    recordBehavior("resolve-target", targetCard, resolved); saveGame(); render(); return;
  }
  const action = target.dataset.action;
  const id = target.dataset.id || target.closest("[data-card-id]")?.dataset.cardId;
  if (!action && target.matches(".game-card[data-zone=board]")) {
    if (game.pendingAction?.validIds.includes(id)) resolvePendingTarget(game, id);
    else if (selectedBoardId && selectedBoardId !== id) { const moved = findCard(selectedBoardId); reorderMinion(game, selectedBoardId, game.player.board.findIndex((item) => item.instanceId === id)); recordBehavior("reorder", moved); selectedBoardId = null; }
    else { selectedBoardId = selectedBoardId === id ? null : id; recordBehavior("board-select", findCard(id)); }
    saveGame(); render(); return;
  }
  const trackedCard = id ? findCard(id) : null;
  const actions = {
    resume: () => {},
    "bug-report-open": () => { bugReportOpen = true; bugReportStatus = "IDLE"; battlePlaying = false; queueMicrotask(() => app.querySelector('#bug-report-form textarea')?.focus()); return true; },
    "bug-report-close": () => { bugReportOpen = false; bugReportStatus = "IDLE"; return true; },
    buy: () => buyMinion(game, id), play: () => playCard(game, id), sell: () => sellMinion(game, id),
    activate: () => activateMinion(game, id), "hero-power-select": () => startHeroPower(game), "hero-power-use": () => activateHeroPower(game),
    upgrade: () => upgradeTavern(game), refresh: () => refreshShop(game), freeze: () => toggleFreeze(game),
    discover: () => chooseDiscover(game, id), "cancel-target": () => cancelPendingAction(game),
    "normal-play": () => resolvePendingTarget(game, null), inspect: () => { selectedCard = findCard(id); },
    "retry-upload": () => { game.playtest.gameUploadStatus = "PENDING"; },
    combat: () => { const started = beginCombat(game); if (started) startBattlePlayback(); return started; },
    "battle-toggle": () => { battlePlaying = !battlePlaying; },
    "battle-speed": () => { battleSpeed = battleSpeed === 1 ? 2 : battleSpeed === 2 ? 4 : 1; },
    "battle-prev": () => { battlePlaying = false; battleFrame = Math.max(0, battleFrame - 1); },
    "battle-next": () => { battlePlaying = false; battleFrame = Math.min(game.battle.frames.length - 1, battleFrame + 1); },
    "battle-skip": () => { battlePlaying = false; battleFrame = game.battle.frames.length - 1; },
    continue: () => { battlePlaying = false; advanceRound(game); battleFrame = 0; },
    restart: () => { bugReportOpen = false; bugReportStatus = "IDLE"; game = null; localStorage.removeItem(SAVE_KEY); },
    "new-game": () => { if (confirm("确定放弃当前对局并重新选择英雄吗？")) { bugReportOpen = false; bugReportStatus = "IDLE"; game = null; localStorage.removeItem(SAVE_KEY); } },
  };
  const actionResult = actions[action]?.();
  if (action && !["restart", "new-game"].includes(action) && game) recordBehavior(action, trackedCard, actionResult);
  if (action !== "combat") {
    saveGame(); render();
    if (game?.phase === "COMBAT" && battlePlaying) scheduleBattlePlayback();
  } else saveGame();
});

app.addEventListener("submit", (event) => {
  if (event.target.matches("#feedback-form")) { event.preventDefault(); submitFeedback(event.target); return; }
  if (event.target.matches("#bug-report-form")) { event.preventDefault(); submitBugReport(event.target); }
});

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !bugReportOpen) return;
  bugReportOpen = false; bugReportStatus = "IDLE"; recordBehavior("bug-report-close"); saveGame(); render();
});

app.addEventListener("dragstart", (event) => {
  const card = event.target.closest('.game-card[data-zone="board"],.game-card[data-zone="hand"]');
  if (!card) return;
  pointerDrag = null;
  dragState = { id: card.dataset.cardId, sourceZone: card.dataset.zone };
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", card.dataset.cardId);
  const rect = card.getBoundingClientRect();
  event.dataTransfer.setDragImage(card, Math.max(0, Math.min(rect.width, event.clientX - rect.left)), Math.max(0, Math.min(rect.height, event.clientY - rect.top)));
  updateDragPresentation(dragState.id, dragState.sourceZone);
});

app.addEventListener("dragend", () => {
  dragState = null;
  clearDragPresentation();
});

app.addEventListener("dragover", (event) => {
  if (!dragState) return;
  const dropZone = event.target.closest("[data-drop-zone]");
  const destinationZone = dropZone?.dataset.dropZone;
  if (!canDropCard(dragState.id, dragState.sourceZone, destinationZone)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  updateDragPresentation(dragState.id, dragState.sourceZone, destinationZone);
});

app.addEventListener("drop", (event) => {
  if (!dragState) return;
  const dropZone = event.target.closest("[data-drop-zone]");
  const destinationZone = dropZone?.dataset.dropZone;
  if (!canDropCard(dragState.id, dragState.sourceZone, destinationZone)) return;
  event.preventDefault();
  const targetCard = event.target.closest('.game-card[data-zone="board"]');
  const { id, sourceZone } = dragState;
  dragState = null;
  clearDragPresentation();
  performCardDrop(id, sourceZone, destinationZone, targetCard);
});

app.addEventListener("pointerdown", (event) => {
  const card = event.target.closest('.game-card[data-zone="board"],.game-card[data-zone="hand"]');
  if (!card || event.target.closest(".board-minion-actions") || (event.pointerType === "mouse" && event.button !== 0)) return;
  pointerDrag = { id: card.dataset.cardId, sourceZone: card.dataset.zone, x: event.clientX, y: event.clientY, moved: false };
  if (event.pointerType !== "mouse") card.setPointerCapture?.(event.pointerId);
});

app.addEventListener("pointermove", (event) => {
  if (!pointerDrag) return;
  if (!pointerDrag.moved && Math.hypot(event.clientX - pointerDrag.x, event.clientY - pointerDrag.y) > 18) pointerDrag.moved = true;
  if (!pointerDrag.moved) return;
  event.preventDefault();
  const element = document.elementFromPoint(event.clientX, event.clientY);
  const destinationZone = element?.closest("[data-drop-zone]")?.dataset.dropZone;
  updateDragPresentation(pointerDrag.id, pointerDrag.sourceZone, destinationZone);
});

app.addEventListener("pointerup", (event) => {
  if (!pointerDrag) return;
  const currentDrag = pointerDrag;
  pointerDrag = null;
  if (!currentDrag.moved) return;
  const element = document.elementFromPoint(event.clientX, event.clientY);
  const destinationZone = element?.closest("[data-drop-zone]")?.dataset.dropZone;
  const targetCard = element?.closest('.game-card[data-zone="board"]');
  suppressClickUntil = Date.now() + 350;
  clearDragPresentation();
  performCardDrop(currentDrag.id, currentDrag.sourceZone, destinationZone, targetCard);
});

app.addEventListener("pointercancel", () => {
  pointerDrag = null;
  clearDragPresentation();
});

app.addEventListener("scroll", (event) => {
  if (event.target?.closest?.(".combat-board")) requestAnimationFrame(() => positionAttackVector());
}, true);

globalThis.addEventListener("resize", () => requestAnimationFrame(() => positionAttackVector()));

render();
