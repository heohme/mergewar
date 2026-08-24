function gameBindings(id, game, now) {
  return [
    id, game.sessionId, 3, game.clientVersion, game.heroId, game.heroName,
    game.rank, game.rounds, game.durationMs, game.health,
    game.stats.wins, game.stats.losses, game.stats.triples, game.stats.refreshes, game.stats.spells,
    JSON.stringify(game.finalBoard), JSON.stringify(game.behaviorLog), now, now,
  ];
}

const GAME_UPSERT = `
  INSERT INTO playtests (
    id, session_id, schema_version, client_version, hero_id, hero_name,
    rank, rounds, duration_ms, health, wins, losses, triples, refreshes, spells,
    final_board, behavior_log, completed_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(session_id) DO UPDATE SET
    schema_version = excluded.schema_version,
    client_version = excluded.client_version,
    hero_id = excluded.hero_id,
    hero_name = excluded.hero_name,
    rank = excluded.rank,
    rounds = excluded.rounds,
    duration_ms = excluded.duration_ms,
    health = excluded.health,
    wins = excluded.wins,
    losses = excluded.losses,
    triples = excluded.triples,
    refreshes = excluded.refreshes,
    spells = excluded.spells,
    final_board = excluded.final_board,
    behavior_log = excluded.behavior_log,
    updated_at = excluded.updated_at
`;

export async function upsertCompletedGame(database, game) {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await database.prepare(GAME_UPSERT).bind(...gameBindings(id, game, now)).run();
  return database.prepare("SELECT id, feedback_submitted_at FROM playtests WHERE session_id = ?").bind(game.sessionId).first();
}

export async function upsertFeedback(database, game, feedback) {
  const row = await upsertCompletedGame(database, game);
  if (row.feedback_submitted_at) return { id: row.id, duplicate: true };
  const now = new Date().toISOString();
  const result = await database.prepare(`
    UPDATE playtests SET
      fun_rating = ?, comment = ?, feedback_submitted_at = ?, updated_at = ?
    WHERE session_id = ? AND feedback_submitted_at IS NULL
  `).bind(
    feedback.rating, feedback.suggestion, now, now, game.sessionId,
  ).run();
  return { id: row.id, duplicate: result.meta?.changes === 0 };
}
