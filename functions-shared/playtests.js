const cleanText = (value, maxLength) => typeof value === "string" ? value.trim().slice(0, maxLength) : "";
const isRating = (value) => Number.isInteger(value) && value >= 1 && value <= 5;
const nonNegativeInteger = (value) => Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;

function requireObject(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("请求内容必须是对象");
  return input;
}

function normalizeBehaviorLog(input) {
  if (!Array.isArray(input)) return [];
  return input.slice(-300).flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const action = cleanText(entry.action, 40);
    if (!action) return [];
    return [{
      atMs: Math.min(24 * 60 * 60 * 1000, nonNegativeInteger(entry.atMs)),
      round: Math.min(10, nonNegativeInteger(entry.round)),
      phase: cleanText(entry.phase, 20),
      action,
      cardId: cleanText(entry.cardId, 80),
      success: entry.success !== false,
      gold: Math.min(20, nonNegativeInteger(entry.gold)),
      tier: Math.min(6, nonNegativeInteger(entry.tier)),
      boardSize: Math.min(7, nonNegativeInteger(entry.boardSize)),
      handSize: Math.min(10, nonNegativeInteger(entry.handSize)),
    }];
  });
}

const normalizeCardRefs = (input, limit) => Array.isArray(input) ? input.slice(0, limit).flatMap((card) => {
  if (!card || typeof card !== "object" || Array.isArray(card)) return [];
  return [{
    id: cleanText(card.id, 80),
    name: cleanText(card.name, 80),
    attack: nonNegativeInteger(card.attack),
    health: nonNegativeInteger(card.health),
    golden: Boolean(card.golden),
  }];
}) : [];

function normalizeBugSnapshot(input) {
  const snapshot = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  return {
    health: nonNegativeInteger(snapshot.health),
    armor: nonNegativeInteger(snapshot.armor),
    gold: Math.min(20, nonNegativeInteger(snapshot.gold)),
    goldLimit: Math.min(20, nonNegativeInteger(snapshot.goldLimit)),
    tier: Math.min(6, nonNegativeInteger(snapshot.tier)),
    rank: Math.min(8, nonNegativeInteger(snapshot.rank)),
    board: normalizeCardRefs(snapshot.board, 7),
    hand: normalizeCardRefs(snapshot.hand, 10),
    shop: normalizeCardRefs(snapshot.shop, 7),
    message: cleanText(snapshot.message, 300),
    battleFrame: nonNegativeInteger(snapshot.battleFrame),
    battleFrames: nonNegativeInteger(snapshot.battleFrames),
  };
}

export function normalizeGame(input) {
  const game = requireObject(input);
  const sessionId = cleanText(game.sessionId, 100);
  if (!sessionId) throw new Error("缺少本局编号");
  if (!Number.isInteger(game.rank) || game.rank < 1 || game.rank > 8) throw new Error("排名必须在1到8之间");
  if (!Number.isInteger(game.rounds) || game.rounds < 1 || game.rounds > 10) throw new Error("回合数必须在1到10之间");
  if (!Number.isFinite(game.durationMs) || game.durationMs < 0 || game.durationMs > 24 * 60 * 60 * 1000) throw new Error("本局时长无效");
  return {
    sessionId,
    clientVersion: cleanText(game.clientVersion, 40) || "unknown",
    heroId: cleanText(game.heroId, 80),
    heroName: cleanText(game.heroName, 80),
    rank: game.rank,
    rounds: game.rounds,
    durationMs: Math.round(game.durationMs),
    health: nonNegativeInteger(game.health),
    stats: {
      wins: nonNegativeInteger(game.stats?.wins),
      losses: nonNegativeInteger(game.stats?.losses),
      triples: nonNegativeInteger(game.stats?.triples),
      refreshes: nonNegativeInteger(game.stats?.refreshes),
      spells: nonNegativeInteger(game.stats?.spells),
    },
    behaviorLog: normalizeBehaviorLog(game.behaviorLog),
    finalBoard: Array.isArray(game.finalBoard) ? game.finalBoard.slice(0, 7).map((card) => ({
      id: cleanText(card?.id, 80),
      name: cleanText(card?.name, 80),
      tribe: cleanText(card?.tribe, 30),
      tier: nonNegativeInteger(card?.tier),
      attack: nonNegativeInteger(card?.attack),
      health: nonNegativeInteger(card?.health),
      golden: Boolean(card?.golden),
    })) : [],
  };
}

export function normalizeFeedback(input) {
  const feedback = requireObject(input);
  const rating = feedback.rating ?? feedback.funRating;
  if (!isRating(rating)) throw new Error("rating必须是1到5的整数");
  return {
    rating,
    suggestion: cleanText(feedback.suggestion ?? feedback.comment, 1000),
  };
}

export function normalizeCompletion(input) {
  const body = requireObject(input);
  return { schemaVersion: 3, game: normalizeGame(body.game) };
}

export function normalizeSubmission(input) {
  const body = requireObject(input);
  return { schemaVersion: 3, game: normalizeGame(body.game), feedback: normalizeFeedback(body.feedback) };
}

export function normalizeBugReport(input) {
  const body = requireObject(input);
  const report = requireObject(body.report ?? body);
  const sessionId = cleanText(report.sessionId, 100);
  const description = cleanText(report.description, 500);
  if (!sessionId) throw new Error("缺少本局编号");
  if (!description) throw new Error("请填写问题描述");
  if (!Number.isInteger(report.round) || report.round < 1 || report.round > 10) throw new Error("回合数必须在1到10之间");
  const includeLogs = report.includeLogs !== false;
  return {
    schemaVersion: 1,
    report: {
      sessionId,
      clientVersion: cleanText(report.clientVersion, 40) || "unknown",
      heroId: cleanText(report.heroId, 80),
      heroName: cleanText(report.heroName, 80),
      round: report.round,
      phase: cleanText(report.phase, 20),
      description,
      includeLogs,
      behaviorLog: includeLogs ? normalizeBehaviorLog(report.behaviorLog).slice(-100) : [],
      snapshot: normalizeBugSnapshot(report.snapshot),
      viewport: {
        width: Math.min(10000, nonNegativeInteger(report.viewport?.width)),
        height: Math.min(10000, nonNegativeInteger(report.viewport?.height)),
      },
    },
  };
}

export function summarizeSubmissions(entries) {
  const completed = entries.filter((entry) => entry?.game);
  const withFeedback = completed.filter((entry) => entry?.feedback);
  const average = (items, selector) => items.length ? Number((items.reduce((sum, entry) => sum + selector(entry), 0) / items.length).toFixed(2)) : 0;
  const distribution = (items, selector, values) => Object.fromEntries(values.map((value) => [value, items.filter((entry) => selector(entry) === value).length]));
  const heroes = {};
  completed.forEach((entry) => { heroes[entry.game.heroName || "未知"] = (heroes[entry.game.heroName || "未知"] || 0) + 1; });
  return {
    generatedAt: new Date().toISOString(),
    totalCompletedGames: completed.length,
    totalResponses: withFeedback.length,
    feedbackRate: completed.length ? Number((withFeedback.length / completed.length).toFixed(3)) : 0,
    averageDurationMinutes: Number((average(completed, (entry) => entry.game.durationMs) / 60000).toFixed(2)),
    averageRank: average(completed, (entry) => entry.game.rank),
    averageRating: average(withFeedback, (entry) => entry.feedback.rating ?? entry.feedback.funRating),
    averageActionsPerGame: average(completed, (entry) => entry.game.behaviorLog?.length || 0),
    actionCounts: completed.flatMap((entry) => entry.game.behaviorLog || []).reduce((counts, event) => ({ ...counts, [event.action]: (counts[event.action] || 0) + 1 }), {}),
    rankDistribution: distribution(completed, (entry) => String(entry.game.rank), ["1", "2", "3", "4", "5", "6", "7", "8"]),
    heroDistribution: heroes,
  };
}

export function isClientError(error) {
  return ["请求内容必须是对象", "请求内容过大", "JSON格式无效"].some((text) => error.message.includes(text)) || /必须|缺少|无效|请填写/.test(error.message);
}

export const jsonResponse = (body, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
