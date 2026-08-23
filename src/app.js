import { HEROES, MAX_BOARD, MINIONS, TRIBES } from "./data.js";
import {
  activateMinion, advanceRound, beginCombat, buyMinion, cancelPendingAction, canEndTurn,
  castSpell, chooseDiscover, createGame, gameResult, moveMinion, playCard, playerRank,
  refreshShop, reorderMinion, resolvePendingTarget, sellMinion, standings, toggleFreeze,
  upgradeTavern, useHeroPower,
} from "./engine.js";

const app = document.querySelector("#app");
const SAVE_KEY = "mergewar-save-v2";
let game = loadGame();
let selectedBoardId = null;
let selectedCard = null;
let battleFrame = 0;
let battleTimer = null;
let pointerDrag = null;
let suppressClickUntil = 0;

function saveGame() {
  if (!game) return localStorage.removeItem(SAVE_KEY);
  localStorage.setItem(SAVE_KEY, JSON.stringify(game));
}

function loadGame() {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
    return saved?.version === 2 ? saved : null;
  } catch { return null; }
}

function tribeLabel(card) {
  if (card.kind === "SPELL") return "酒馆法术";
  return (card.tribes || [card.tribe]).map((tribe) => `${TRIBES[tribe]?.icon || "◇"} ${TRIBES[tribe]?.name || tribe}`).join(" · ");
}

function cardView(card, zone) {
  const isSpell = card.kind === "SPELL";
  const pendingTarget = game.pendingAction?.validIds?.includes(card.instanceId);
  const selected = selectedBoardId === card.instanceId;
  const disabled = game.phase !== "SHOP";
  let controls = "";
  if (zone === "shop") controls = `<button data-action="buy" data-id="${card.instanceId}" ${disabled || game.player.gold < 3 ? "disabled" : ""}>购买 · 3</button>`;
  else if (zone === "hand") controls = `<button data-action="play" data-id="${card.instanceId}" ${disabled ? "disabled" : ""}>${isSpell ? "施放" : "打出"}</button>`;
  else if (zone === "board") controls = `<div class="card-actions">
    ${card.activate ? `<button data-action="activate" data-id="${card.instanceId}" ${disabled || card.activatedThisTurn || game.player.gold < card.activateCost ? "disabled" : ""}>发动 · ${card.activateCost}</button>` : ""}
    ${game.hero.power === "GOLDEN_TOUCH" && !game.player.heroPowerUsed && !card.golden ? `<button data-action="hero-power" data-id="${card.instanceId}">点金</button>` : ""}
    <button data-action="sell" data-id="${card.instanceId}" ${disabled ? "disabled" : ""}>出售</button>
  </div>`;
  return `<article class="game-card ${isSpell ? "spell-card" : ""} ${card.golden ? "golden" : ""} ${pendingTarget ? "valid-target" : ""} ${selected ? "selected" : ""}"
      data-card-id="${card.instanceId}" data-zone="${zone}" data-tribe="${card.tribe || "SPELL"}" ${zone === "board" ? "draggable=true" : ""}>
    <div class="tier-gem">${card.tier || "✦"}</div>
    <button class="art-button" data-action="inspect" data-id="${card.instanceId}">
      <img src="${card.imageUrl}" alt="${card.name}" loading="lazy"><span>${card.name}</span>
    </button>
    <div class="card-meta">${tribeLabel(card)}</div>
    <p>${card.text || "无特殊效果"}</p>
    ${!isSpell ? `<div class="card-stats"><b>${card.attack}</b><b>${card.health}</b></div>` : ""}
    <div class="card-controls">${controls}</div>
  </article>`;
}

function renderStart() {
  const hasSave = Boolean(game);
  app.innerHTML = `<main class="start-screen">
    <section class="start-copy"><span class="brand-mark">✦</span><p class="eyebrow">MERGEWAR · 私有研究版</p>
      <h1>十分钟酒馆构筑</h1><p>亡灵与龙完整卡池 · 横屏操作 · 独立战斗舞台</p>
      ${hasSave ? `<button class="resume-button" data-action="resume">继续第${game.round}回合</button>` : ""}
    </section>
    <section class="hero-grid">${HEROES.map((hero) => `<button class="hero-choice" data-hero="${hero.id}">
      <img src="${hero.imageUrl}" alt="${hero.name}"><div><small>${hero.tag}</small><strong>${hero.name}</strong><p>${hero.description}</p></div>
    </button>`).join("")}</section>
    <p class="legal-note">内部玩法研究原型，炉石名称与远程图片不用于公开发行。</p>
  </main>`;
}

function renderTopbar() {
  return `<header class="topbar">
    <div class="round"><span>回合</span><b>${game.round}</b><i>/${game.maxRounds}</i></div>
    <div class="hero"><img src="${game.hero.imageUrl}" alt=""><div><b>${game.hero.name}</b><small>${game.hero.tag}</small></div></div>
    <div class="resources"><span class="hp">♥ ${game.player.health}</span><span class="coin">● ${game.player.gold}</span><span># ${playerRank(game)}</span></div>
    <button class="quiet-button" data-action="new-game">重新开始</button>
  </header>`;
}

function renderStandings() {
  return `<aside class="standings"><div class="side-title">8人酒馆</div>${standings(game).map((item, index) => `<div class="standing ${item.id === "player" ? "you" : ""} ${!item.alive ? "dead" : ""}">
    <b>${index + 1}</b><i style="--c:${item.accent || "#f4c76b"}"></i><div><strong>${item.name}</strong><small>${item.hero}</small></div><span>${item.alive ? `♥${item.health}` : "淘汰"}</span>
  </div>`).join("")}</aside>`;
}

function renderShop() {
  const opponent = game.currentOpponent;
  const targetHint = game.pendingAction ? `<div class="target-banner">选择一个高亮目标 <button data-action="cancel-target">取消</button>${game.pendingAction.allowNoTarget ? `<button data-action="normal-play">普通打出</button>` : ""}</div>` : "";
  app.innerHTML = `<main class="game-shell shop-screen">${renderTopbar()}${targetHint}
    <div class="landscape-layout">${renderStandings()}
      <section class="recruit-stage">
        <div class="opponent-bar"><div><small>下一位对手</small><b>${opponent.name}</b><span>${opponent.hero} · ${opponent.tier}级酒馆</span></div>
          <div class="enemy-mini">${opponent.board.map((item) => `<span title="${item.name}"><img src="${item.imageUrl}" alt=""><i>${item.attack}/${item.health}</i></span>`).join("")}</div></div>
        <section class="zone shop-zone"><header><div><small>招募阶段</small><h2>${game.player.tier}级酒馆</h2></div><div class="shop-actions">
          <button data-action="upgrade" ${game.player.tier >= 6 || game.player.gold < game.player.upgradeCost ? "disabled" : ""}>升级 · ${game.player.tier >= 6 ? "满级" : game.player.upgradeCost}</button>
          <button data-action="refresh" ${game.player.gold < (game.player.freeRefresh || game.player.freeRefreshes ? 0 : 1) ? "disabled" : ""}>刷新 · ${game.player.freeRefresh || game.player.freeRefreshes ? "免费" : 1}</button>
          <button data-action="freeze" class="${game.player.frozen ? "active" : ""}">${game.player.frozen ? "已冻结" : "冻结"}</button>
        </div></header><div class="card-strip">${game.player.shop.map((item) => cardView(item, "shop")).join("") || `<div class="empty">酒馆已买空</div>`}</div></section>
        <section class="zone board-zone"><header><div><small>你的战队 · 可拖动换位</small><h2>${game.player.board.length}/${MAX_BOARD}</h2></div><span>${selectedBoardId ? "再点一张随从可交换位置" : "点击查看 · 拖动排序"}</span></header>
          <div class="card-strip board-strip" data-drop-zone="board">${game.player.board.map((item) => cardView(item, "board")).join("") || `<div class="empty">从手牌打出第一个随从</div>`}</div></section>
        <section class="hand-dock"><label>手牌 <b>${game.player.hand.length}/10</b></label><div class="card-strip hand-strip">${game.player.hand.map((item) => cardView(item, "hand")).join("") || `<div class="empty compact">购买的随从和获取的法术会出现在这里</div>`}</div></section>
      </section>
      <aside class="detail-panel">${renderDetail()}<div class="message-log"><b>最近事件</b>${game.messages.slice(0, 6).map((text) => `<p>${text}</p>`).join("")}</div></aside>
    </div>
    <footer class="action-bar"><span>${game.messages[0]}</span><button class="combat-button" data-action="combat" ${canEndTurn(game) ? "" : "disabled"}>进入战斗 →</button></footer>
    ${game.pendingDiscover ? renderDiscover() : ""}
    <div class="rotate-hint">旋转设备，横屏体验完整酒馆</div>
  </main>`;
}

function renderDetail() {
  const card = selectedCard || game.player.board[0] || game.player.shop[0];
  if (!card) return `<div class="detail-empty">点击卡牌查看详情</div>`;
  return `<div class="detail-card"><img src="${card.imageUrl}" alt="${card.name}"><small>${tribeLabel(card)} · ${card.tier || "法术"}级</small><h3>${card.golden ? "✦ " : ""}${card.name}</h3><p>${card.text || "无特殊效果"}</p>${card.kind !== "SPELL" ? `<strong>${card.attack} / ${card.health}</strong>` : ""}</div>`;
}

function renderDiscover() {
  return `<div class="overlay"><section class="discover"><small>三连奖励</small><h2>发现一个更高等级随从</h2><div>${game.pendingDiscover.map((item) => `<button data-action="discover" data-id="${item.id}"><img src="${item.imageUrl}" alt=""><b>${item.name}</b><span>${item.attack}/${item.health}</span><p>${item.text}</p></button>`).join("")}</div></section></div>`;
}

function renderBattle() {
  const battle = game.battle;
  const frames = battle.frames?.length ? battle.frames : [{ label: "战斗结果", player: battle.playerBoard, enemy: battle.enemyBoard }];
  battleFrame = Math.min(battleFrame, frames.length - 1);
  const frame = frames[battleFrame];
  const finished = battleFrame >= frames.length - 1;
  app.innerHTML = `<main class="battle-screen">${renderTopbar()}
    <section class="battle-stage">
      <header><div><small>第${game.round}回合 · ${battle.opponent.name}</small><h1>${frame.label}</h1></div><div class="playback"><button data-action="battle-prev" ${battleFrame === 0 ? "disabled" : ""}>‹</button><span>${battleFrame + 1}/${frames.length}</span><button data-action="battle-next" ${finished ? "disabled" : ""}>›</button><button data-action="battle-skip">跳到结果</button></div></header>
      <div class="combat-board enemy-board"><label>${battle.opponent.name}</label>${frame.enemy.map((item) => battleCard(item)).join("") || `<div class="defeated">全军覆没</div>`}</div>
      <div class="versus-line"><span></span><b>VS</b><span></span></div>
      <div class="combat-board player-board"><label>你的战队</label>${frame.player.map((item) => battleCard(item)).join("") || `<div class="defeated">全军覆没</div>`}</div>
      <footer><p>${finished ? battleResultText(battle) : "战斗正在逐步结算，可手动前进或跳过。"}</p><button data-action="continue" ${finished ? "" : "disabled"}>${!game.player.alive || game.round >= game.maxRounds ? "查看结果" : "返回酒馆"}</button></footer>
    </section></main>`;
}

function battleCard(card) {
  return `<article class="combat-card ${card.golden ? "golden" : ""} ${card.shield ? "shield" : ""}"><img src="${card.imageUrl}" alt=""><b>${card.name}</b><div><span>${card.attack}</span><span>${Math.max(0, card.health)}</span></div></article>`;
}

function battleResultText(battle) {
  if (battle.winner === "tie") return "双方战平，没有受到伤害。";
  return battle.winner === "player" ? `战斗胜利，对${battle.opponent.name}造成${battle.damage}点伤害。` : `战斗失败，受到${battle.damage}点伤害。`;
}

function renderGameOver() {
  const result = gameResult(game);
  app.innerHTML = `<main class="game-over"><span class="brand-mark">${result.rank === 1 ? "♛" : "✦"}</span><small>本局结束</small><h1>${result.title}</h1><p>${result.summary}</p>
    <div class="result-stats"><span><b>${game.round}</b>回合</span><span><b>${game.stats.wins}</b>胜利</span><span><b>${game.stats.triples}</b>三连</span><span><b>${game.stats.spells}</b>法术</span></div>
    <button data-action="restart">再来一局</button></main>`;
}

function render() {
  clearTimeout(battleTimer);
  if (!game) return renderStart();
  if (game.phase === "GAME_OVER") return renderGameOver();
  if (game.phase === "COMBAT" && game.battle) return renderBattle();
  renderShop();
}

function startBattlePlayback() {
  battleFrame = 0; render();
  const advance = () => {
    if (!game?.battle || battleFrame >= game.battle.frames.length - 1) return;
    battleFrame += 1; render(); battleTimer = setTimeout(advance, 650);
  };
  battleTimer = setTimeout(advance, 800);
}

function findCard(instanceId) {
  return [...(game?.player.shop || []), ...(game?.player.hand || []), ...(game?.player.board || [])].find((item) => item.instanceId === instanceId);
}

app.addEventListener("click", (event) => {
  if (Date.now() < suppressClickUntil) { event.preventDefault(); return; }
  const target = event.target.closest("[data-action], [data-hero], .game-card[data-zone=board]");
  if (!target) return;
  if (target.dataset.hero) { game = createGame(target.dataset.hero); selectedCard = null; saveGame(); render(); return; }
  const action = target.dataset.action;
  const id = target.dataset.id || target.closest("[data-card-id]")?.dataset.cardId;
  if (!action && target.matches(".game-card[data-zone=board]")) {
    if (game.pendingAction?.validIds.includes(id)) resolvePendingTarget(game, id);
    else if (selectedBoardId && selectedBoardId !== id) { reorderMinion(game, selectedBoardId, game.player.board.findIndex((item) => item.instanceId === id)); selectedBoardId = null; }
    else selectedBoardId = selectedBoardId === id ? null : id;
    saveGame(); render(); return;
  }
  const actions = {
    resume: () => {},
    buy: () => buyMinion(game, id), play: () => playCard(game, id), sell: () => sellMinion(game, id),
    activate: () => activateMinion(game, id), "hero-power": () => useHeroPower(game, id),
    upgrade: () => upgradeTavern(game), refresh: () => refreshShop(game), freeze: () => toggleFreeze(game),
    discover: () => chooseDiscover(game, id), "cancel-target": () => cancelPendingAction(game),
    "normal-play": () => resolvePendingTarget(game, null), inspect: () => { selectedCard = findCard(id); },
    combat: () => { if (beginCombat(game)) startBattlePlayback(); },
    "battle-prev": () => { battleFrame = Math.max(0, battleFrame - 1); },
    "battle-next": () => { battleFrame = Math.min(game.battle.frames.length - 1, battleFrame + 1); },
    "battle-skip": () => { battleFrame = game.battle.frames.length - 1; },
    continue: () => { advanceRound(game); battleFrame = 0; },
    restart: () => { game = null; localStorage.removeItem(SAVE_KEY); },
    "new-game": () => { if (confirm("确定放弃当前对局并重新选择英雄吗？")) { game = null; localStorage.removeItem(SAVE_KEY); } },
  };
  actions[action]?.();
  if (action !== "combat") { saveGame(); render(); }
});

app.addEventListener("dragstart", (event) => {
  const card = event.target.closest('.game-card[data-zone="board"]');
  if (!card) return;
  event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", card.dataset.cardId); card.classList.add("dragging");
});

app.addEventListener("dragend", (event) => event.target.closest(".game-card")?.classList.remove("dragging"));
app.addEventListener("dragover", (event) => { if (event.target.closest('.game-card[data-zone="board"]')) event.preventDefault(); });
app.addEventListener("drop", (event) => {
  const target = event.target.closest('.game-card[data-zone="board"]'); if (!target) return;
  event.preventDefault(); const sourceId = event.dataTransfer.getData("text/plain");
  reorderMinion(game, sourceId, game.player.board.findIndex((item) => item.instanceId === target.dataset.cardId)); saveGame(); render();
});

app.addEventListener("pointerdown", (event) => {
  const card = event.target.closest('.game-card[data-zone="board"]');
  if (!card || event.target.closest("button")) return;
  pointerDrag = { id: card.dataset.cardId, x: event.clientX, y: event.clientY, moved: false };
});

app.addEventListener("pointermove", (event) => {
  if (!pointerDrag) return;
  if (Math.hypot(event.clientX - pointerDrag.x, event.clientY - pointerDrag.y) > 18) pointerDrag.moved = true;
});

app.addEventListener("pointerup", (event) => {
  if (!pointerDrag) return;
  if (pointerDrag.moved) {
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.game-card[data-zone="board"]');
    if (target && target.dataset.cardId !== pointerDrag.id) {
      reorderMinion(game, pointerDrag.id, game.player.board.findIndex((item) => item.instanceId === target.dataset.cardId));
      suppressClickUntil = Date.now() + 350;
      saveGame(); render();
    }
  }
  pointerDrag = null;
});

render();
