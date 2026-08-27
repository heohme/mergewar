import assert from "node:assert/strict";
import { normalizeBugReport, normalizeCompletion, normalizeSubmission, summarizeSubmissions } from "../functions-shared/playtests.js";

const sample = {
  game: {
    sessionId: "session-test-1",
    clientVersion: "test",
    heroId: "hero-1",
    heroName: "测试英雄",
    rank: 3,
    rounds: 9,
    durationMs: 9 * 60 * 1000,
    health: 4,
    stats: { wins: 5, losses: 4, triples: 2, refreshes: 8, spells: 3 },
    behaviorLog: [
      { atMs: 1200, round: 1, phase: "SHOP", action: "buy", cardId: "card-1", success: true, gold: 0, tier: 1, boardSize: 0, handSize: 1 },
      { atMs: 1800, round: 1, phase: "SHOP", action: "play", cardId: "card-1", success: true, gold: 0, tier: 1, boardSize: 1, handSize: 0 },
    ],
    finalBoard: [{ id: "card-1", name: "测试随从", tribe: "DRAGON", tier: 4, attack: 12, health: 10, golden: false }],
  },
  feedback: {
    rating: 4,
    suggestion: "战斗结果还可以更清楚。",
  },
};

const normalized = normalizeSubmission(sample);
assert.equal(normalized.schemaVersion, 3);
assert.equal(normalized.game.sessionId, "session-test-1");
assert.equal(normalized.game.finalBoard.length, 1);
assert.equal(normalized.feedback.rating, 4);
assert.equal(normalized.feedback.suggestion, "战斗结果还可以更清楚。");
assert.equal(normalized.game.behaviorLog.length, 2);
assert.equal(normalized.game.behaviorLog[0].action, "buy");

assert.throws(() => normalizeSubmission({ ...sample, game: { ...sample.game, rank: 9 } }), /排名/);
assert.throws(() => normalizeSubmission({ ...sample, feedback: { ...sample.feedback, rating: 0 } }), /rating/);
assert.equal(normalizeSubmission({ ...sample, feedback: { rating: 5 } }).feedback.suggestion, "", "建议应为可选项");
assert.deepEqual(normalizeSubmission({ ...sample, feedback: { funRating: 3, comment: "旧版页面" } }).feedback, { rating: 3, suggestion: "旧版页面" }, "应兼容仍在浏览器中的旧版反馈页面");
const completion = normalizeCompletion({ game: sample.game });
assert.equal(completion.game.sessionId, "session-test-1");
assert.equal(completion.feedback, undefined);

const bugReport = normalizeBugReport({ report: {
  sessionId: "session-test-1", clientVersion: "test", heroId: "hero-1", heroName: "测试英雄",
  round: 4, phase: "SHOP", description: "拖动鲜血宝石后没有生效", includeLogs: true,
  behaviorLog: sample.game.behaviorLog,
  snapshot: { health: 23, gold: 4, goldLimit: 6, tier: 3, rank: 2, board: sample.game.finalBoard, message: "施放了鲜血宝石。" },
  viewport: { width: 616, height: 414 },
} });
assert.equal(bugReport.schemaVersion, 1);
assert.equal(bugReport.report.description, "拖动鲜血宝石后没有生效");
assert.equal(bugReport.report.behaviorLog.length, 2);
assert.equal(bugReport.report.snapshot.board[0].name, "测试随从");
assert.deepEqual(bugReport.report.viewport, { width: 616, height: 414 });
assert.equal(normalizeBugReport({ report: { ...bugReport.report, includeLogs: false } }).report.behaviorLog.length, 0, "取消日志选项后不应上传行为日志");
assert.throws(() => normalizeBugReport({ report: { ...bugReport.report, description: "" } }), /请填写问题描述/);

const second = normalizeSubmission({
  ...sample,
  game: { ...sample.game, sessionId: "session-test-2", heroName: "另一英雄", rank: 7, durationMs: 11 * 60 * 1000 },
  feedback: { ...sample.feedback, rating: 2, suggestion: "" },
});
const summary = summarizeSubmissions([normalized, second]);
assert.equal(summary.totalCompletedGames, 2);
assert.equal(summary.totalResponses, 2);
assert.equal(summary.feedbackRate, 1);
assert.equal(summary.averageDurationMinutes, 10);
assert.equal(summary.averageRank, 5);
assert.equal(summary.averageRating, 3);
assert.equal(summary.averageActionsPerGame, 2);
assert.deepEqual(summary.actionCounts, { buy: 2, play: 2 });
assert.equal(summary.rankDistribution[3], 1);
assert.equal(summary.rankDistribution[7], 1);

const skippedFeedback = normalizeCompletion({ game: { ...sample.game, sessionId: "session-test-3", rank: 8 } });
const mixedSummary = summarizeSubmissions([normalized, second, skippedFeedback]);
assert.equal(mixedSummary.totalCompletedGames, 3);
assert.equal(mixedSummary.totalResponses, 2);
assert.equal(mixedSummary.feedbackRate, 0.667);

console.log("server tests passed: feedback validation and aggregate metrics");
