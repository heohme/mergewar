import { HEROES, MAX_BOARD, TRIBES } from "./data.js";
import {
  advanceRound,
  beginCombat,
  buyMinion,
  canEndTurn,
  chooseDiscover,
  createGame,
  gameResult,
  moveMinion,
  playMinion,
  playerRank,
  refreshShop,
  sellMinion,
  standings,
  toggleFreeze,
  upgradeTavern,
  useHeroPower,
} from "./engine.js";

const app = document.querySelector("#app");
let game = null;

function tribeLabel(minion) {
  return `${TRIBES[minion.tribe]?.icon || "◇"} ${TRIBES[minion.tribe]?.name || "衍生物"}`;
}

function keywords(minion) {
  const labels = { TAUNT: "嘲讽", DIVINE_SHIELD: "圣盾", WINDFURY: "风怒", REBORN: "复生", VENOMOUS: "烈毒", ATTACK_IMMUNE: "攻击时免疫" };
  return (minion.keywords || []).map((key) => `<span class="keyword">${labels[key] || key}</span>`).join("");
}

function card(minion, zone) {
  const disabled = game?.phase !== "SHOP";
  const primary = zone === "shop"
    ? `<button data-action="buy" data-id="${minion.instanceId}" ${disabled || game.player.gold < 3 ? "disabled" : ""}>购买 · 3</button>`
    : zone === "hand"
      ? `<button data-action="play" data-id="${minion.instanceId}" ${disabled || game.player.board.length >= MAX_BOARD ? "disabled" : ""}>上场</button>`
      : `<div class="card-actions">
          <button class="icon-button" data-action="left" data-id="${minion.instanceId}" aria-label="左移">‹</button>
          ${game.hero.power === "GOLDEN_TOUCH" && !game.player.heroPowerUsed && !minion.golden ? `<button class="gold-button" data-action="hero-power" data-id="${minion.instanceId}">点金</button>` : ""}
          <button class="icon-button" data-action="right" data-id="${minion.instanceId}" aria-label="右移">›</button>
          <button class="sell-button" data-action="sell" data-id="${minion.instanceId}" ${disabled ? "disabled" : ""}>出售</button>
        </div>`;

  return `<article class="minion-card ${minion.golden ? "golden" : ""} ${zone}" data-tribe="${minion.tribe}">
    <div class="tier-badge">${minion.tier}</div>
    <div class="card-art"><img src="${minion.imageUrl}" alt="${minion.name}卡图" loading="lazy"><span>${TRIBES[minion.tribe]?.icon || "◇"}</span></div>
    <div class="card-name">${minion.golden ? "✦ " : ""}${minion.name}</div>
    <div class="tribe-label">${tribeLabel(minion)}</div>
    <div class="card-text">${minion.text || keywords(minion)}</div>
    <div class="stats"><span class="attack">${minion.attack}</span><span class="health">${minion.health}</span></div>
    <div class="primary-action">${primary}</div>
  </article>`;
}

function renderStart() {
  app.innerHTML = `<section class="start-screen">
    <div class="brand-mark">✦</div>
    <p class="eyebrow">10分钟 · 单机PVE · 可玩原型</p>
    <h1>酒馆战棋 · 单机实验</h1>
    <p class="lead">在十个回合内招募、三连并强化你的战队。活到最后，成为酒馆冠军。</p>
    <div class="hero-grid">
      ${HEROES.map((hero) => `<button class="hero-choice" data-hero="${hero.id}">
        <span class="hero-icon"><img src="${hero.imageUrl}" alt="${hero.name}"></span>
        <span class="hero-tag">${hero.tag}</span>
        <strong>${hero.name}</strong>
        <small>${hero.description}</small>
        <span class="choose-label">选择英雄</span>
      </button>`).join("")}
    </div>
    <p class="legal-note">内部研究原型 · 名称与图片来自当前 HearthstoneJSON 数据 · 不用于公开发行</p>
  </section>`;
}

function render() {
  if (!game) return renderStart();
  if (game.phase === "GAME_OVER") return renderGameOver();

  const opponent = game.currentOpponent;
  app.innerHTML = `<div class="game-shell">
    <header class="topbar">
      <div class="round-block"><span>回合</span><strong>${game.round}<i>/${game.maxRounds}</i></strong></div>
      <div class="hero-summary"><span class="avatar"><img src="${game.hero.imageUrl}" alt="${game.hero.name}"></span><div><strong>${game.hero.name}</strong><small>${game.hero.description}</small></div></div>
      <div class="resources">
        <span class="resource health">♥ ${game.player.health}</span>
        <span class="resource gold">● ${game.player.gold}</span>
        <span class="resource rank"># ${playerRank(game)}</span>
      </div>
    </header>

    <div class="main-grid">
      <aside class="leaderboard panel">
        <div class="panel-title"><span>酒馆排名</span><small>8人对局</small></div>
        ${standings(game).map((entry, index) => `<div class="rank-row ${entry.id === "player" ? "you" : ""} ${!entry.alive ? "dead" : ""}">
          <span class="rank-number">${index + 1}</span>
          <span class="rank-dot" style="--accent:${entry.accent || "#ffd166"}"></span>
          <div><strong>${entry.name}</strong><small>${entry.hero}</small></div>
          <span class="rank-health">${entry.alive ? `♥ ${entry.health}` : "淘汰"}</span>
        </div>`).join("")}
      </aside>

      <section class="play-area">
        <div class="opponent-strip panel">
          <div><span class="eyebrow">下一位对手</span><strong>${opponent.name}</strong><small>${opponent.hero} · ${opponent.tier}级酒馆</small></div>
          <div class="opponent-preview">${opponent.board.slice(0, 7).map((minion) => `<span title="${minion.name}">${TRIBES[minion.tribe]?.icon || "◇"}<i>${minion.attack}/${minion.health}</i></span>`).join("")}</div>
        </div>

        <section class="shop-section panel">
          <div class="section-heading">
            <div><span class="eyebrow">招募阶段</span><h2>${game.player.tier}级酒馆</h2></div>
            <div class="shop-controls">
              <button data-action="upgrade" ${game.player.tier >= 6 || game.player.gold < game.player.upgradeCost ? "disabled" : ""}>升级 · ${game.player.tier >= 6 ? "满级" : game.player.upgradeCost}</button>
              <button data-action="refresh" ${game.player.gold < (game.player.freeRefresh || game.player.freeRefreshes > 0 ? 0 : 1) ? "disabled" : ""}>刷新 · ${game.player.freeRefresh || game.player.freeRefreshes > 0 ? "免费" : 1}</button>
              <button class="${game.player.frozen ? "active" : ""}" data-action="freeze">${game.player.frozen ? "已冻结" : "冻结"}</button>
            </div>
          </div>
          <div class="card-row shop-row">${game.player.shop.map((minion) => card(minion, "shop")).join("") || `<div class="empty-state">酒馆已经被买空</div>`}</div>
        </section>

        <section class="board-section panel">
          <div class="section-heading compact"><div><span class="eyebrow">你的战队</span><h2>${game.player.board.length}/${MAX_BOARD}</h2></div><span class="hint">左侧随从率先攻击 · 可调整站位</span></div>
          <div class="card-row board-row">${game.player.board.map((minion) => card(minion, "board")).join("") || `<div class="empty-state board-empty">从手牌中打出随从</div>`}</div>
        </section>

        <section class="hand-section">
          <div class="hand-label">手牌 <span>${game.player.hand.length}/10</span></div>
          <div class="card-row hand-row">${game.player.hand.map((minion) => card(minion, "hand")).join("") || `<div class="empty-hand">购买的随从会进入这里</div>`}</div>
        </section>

        <div class="action-dock">
          <div class="message">${game.messages[0]}</div>
          <button class="combat-button" data-action="combat" ${canEndTurn(game) ? "" : "disabled"}>开始战斗 <span>→</span></button>
        </div>
      </section>
    </div>
    ${game.pendingDiscover ? renderDiscover() : ""}
    ${game.phase === "COMBAT" && game.battle ? renderBattle() : ""}
  </div>`;
}

function renderDiscover() {
  return `<div class="modal-backdrop"><section class="modal discover-modal">
    <span class="eyebrow">三连奖励</span><h2>发现一个更高等级的随从</h2>
    <div class="discover-grid">${game.pendingDiscover.map((minion) => `<button class="discover-choice" data-action="discover" data-id="${minion.id}">
      <img src="${minion.imageUrl}" alt="${minion.name}"><strong>${minion.name}</strong><small>${minion.attack}/${minion.health} · ${minion.tier}级</small><p>${minion.text}</p>
    </button>`).join("")}</div>
  </section></div>`;
}

function miniBattleCard(minion) {
  return `<div class="battle-card ${minion.golden ? "golden" : ""}"><img src="${minion.imageUrl}" alt=""><strong>${minion.name}</strong><i>${minion.attack}/${Math.max(0, minion.health)}</i></div>`;
}

function renderBattle() {
  const battle = game.battle;
  const won = battle.winner === "player";
  const title = battle.winner === "tie" ? "势均力敌" : won ? "战斗胜利" : "战斗失败";
  return `<div class="modal-backdrop battle-backdrop"><section class="modal battle-modal">
    <span class="eyebrow">第${game.round}回合战报</span><h2>${title}</h2>
    <p class="battle-summary">${battle.winner === "tie" ? "双方没有受到伤害" : `${won ? battle.opponent.name : "你"}受到${battle.damage}点伤害`}</p>
    <div class="battlefield">
      <div><h3>你的幸存者</h3><div class="battle-line">${battle.playerBoard.map(miniBattleCard).join("") || `<span class="defeated">全军覆没</span>`}</div></div>
      <div class="versus">VS</div>
      <div><h3>${battle.opponent.name}</h3><div class="battle-line">${battle.enemyBoard.map(miniBattleCard).join("") || `<span class="defeated">全军覆没</span>`}</div></div>
    </div>
    <details><summary>查看战斗记录 · ${battle.log.length}条</summary><ol class="combat-log">${battle.log.slice(-18).map((entry) => `<li>${entry.death ? `${entry.death}被击败` : entry.summon ? `召唤${entry.summon}` : `${entry.attacker}攻击${entry.target}`}</li>`).join("")}</ol></details>
    <button class="continue-button" data-action="continue">${!game.player.alive || game.round >= game.maxRounds ? "查看本局结果" : "返回酒馆"}</button>
  </section></div>`;
}

function renderGameOver() {
  const result = gameResult(game);
  app.innerHTML = `<section class="game-over">
    <span class="brand-mark">${result.rank === 1 ? "♛" : "✦"}</span>
    <p class="eyebrow">本局结束</p><h1>${result.title}</h1><p class="lead">${result.summary}</p>
    <div class="result-rank">第<strong>${result.rank}</strong>名</div>
    <div class="stats-grid">
      <div><strong>${game.round}</strong><span>回合</span></div>
      <div><strong>${game.stats.wins}</strong><span>胜利</span></div>
      <div><strong>${game.stats.triples}</strong><span>三连</span></div>
      <div><strong>${game.stats.refreshes}</strong><span>刷新</span></div>
    </div>
    <button class="restart-button" data-action="restart">再来一局</button>
  </section>`;
}

app.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action], [data-hero]");
  if (!target) return;
  if (target.dataset.hero) {
    game = createGame(target.dataset.hero);
    render();
    return;
  }

  const { action, id } = target.dataset;
  const actions = {
    buy: () => buyMinion(game, id),
    play: () => playMinion(game, id),
    sell: () => sellMinion(game, id),
    left: () => moveMinion(game, id, -1),
    right: () => moveMinion(game, id, 1),
    "hero-power": () => useHeroPower(game, id),
    upgrade: () => upgradeTavern(game),
    refresh: () => refreshShop(game),
    freeze: () => toggleFreeze(game),
    discover: () => chooseDiscover(game, id),
    combat: () => beginCombat(game),
    continue: () => advanceRound(game),
    restart: () => { game = null; },
  };
  actions[action]?.();
  render();
});

render();
