import { isClientError, jsonResponse, normalizeCompletion } from "../../../functions-shared/playtests.js";
import { upsertCompletedGame } from "../../../functions-shared/d1-playtests.js";

export async function onRequestPost({ request, env }) {
  try {
    if (!env.PLAYTESTS_DB) return jsonResponse({ error: "试玩数据库尚未绑定" }, 503);
    const { game } = normalizeCompletion(await request.json());
    const row = await upsertCompletedGame(env.PLAYTESTS_DB, game);
    return jsonResponse({ ok: true, id: row.id }, 201);
  } catch (error) {
    return jsonResponse({ error: isClientError(error) ? error.message : "服务器暂时不可用" }, isClientError(error) ? 400 : 500);
  }
}
