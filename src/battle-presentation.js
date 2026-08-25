export const BATTLE_FRAME_TIMINGS = Object.freeze({
  start: 950,
  attack: 1400,
  resolve: 820,
  reborn: 1100,
  state: 760,
});

export function battleFrameDelay(frame, speed = 1, reducedMotion = false) {
  const eventType = frame?.event?.type || "state";
  const baseDelay = BATTLE_FRAME_TIMINGS[eventType] || BATTLE_FRAME_TIMINGS.state;
  const accessibleDelay = reducedMotion ? Math.min(baseDelay, 480) : baseDelay;
  return Math.max(reducedMotion ? 140 : 220, Math.round(accessibleDelay / Math.max(1, speed)));
}

export function battleHeaderState(battle, player, currentRank, finished = false) {
  if (finished) return { health: player.health, armor: player.armor || 0, rank: currentRank };
  const legacyHealth = (player.health || 0) + (battle?.winner === "enemy" ? battle?.damage || 0 : 0);
  return {
    health: battle?.playerHealthBefore ?? legacyHealth,
    armor: battle?.playerArmorBefore ?? (player.armor || 0),
    rank: battle?.playerRankBefore ?? currentRank,
  };
}

export function newCombatantIds(frame, previousFrame, side) {
  if (!previousFrame || !["resolve", "reborn"].includes(frame?.event?.type)) return new Set();
  const previousIds = new Set((previousFrame[side] || []).map((item) => item.instanceId));
  return new Set((frame[side] || []).filter((item) => !previousIds.has(item.instanceId)).map((item) => item.instanceId));
}

export function attackVectorGeometry(sourceRect, targetRect, containerRect, arrowGap = 8) {
  if (!sourceRect || !targetRect || !containerRect) return null;
  const source = {
    x: sourceRect.left - containerRect.left + sourceRect.width / 2,
    y: sourceRect.top - containerRect.top + sourceRect.height / 2,
  };
  const target = {
    x: targetRect.left - containerRect.left + targetRect.width / 2,
    y: targetRect.top - containerRect.top + targetRect.height / 2,
  };
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const distance = Math.hypot(dx, dy) || 1;
  const ux = dx / distance;
  const uy = dy / distance;
  const sourceInset = Math.min(sourceRect.width, sourceRect.height) * .42;
  const targetInset = Math.min(targetRect.width, targetRect.height) * .42 + arrowGap;
  return {
    x1: source.x + ux * sourceInset,
    y1: source.y + uy * sourceInset,
    x2: target.x - ux * targetInset,
    y2: target.y - uy * targetInset,
  };
}

export function combatKeywordState(card, event = {}, side) {
  const keywords = new Set(card?.keywords || []);
  const isAttack = event.type === "attack";
  const attacking = isAttack && event.attackerSide === side && event.attackerId === card?.instanceId;
  const targeted = isAttack && event.targetSide === side && event.targetId === card?.instanceId;
  return {
    taunt: keywords.has("TAUNT"),
    windfury: keywords.has("WINDFURY"),
    reborn: keywords.has("REBORN"),
    tauntTriggered: targeted && keywords.has("TAUNT"),
    windfuryTriggered: attacking && keywords.has("WINDFURY"),
  };
}
