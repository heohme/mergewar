import { isClientError, jsonResponse, normalizeSubmission } from "../../../functions-shared/playtests.js";
import { upsertFeedback } from "../../../functions-shared/d1-playtests.js";

export async function onRequestPost({ request, env }) {
  try {
    if (!env.PLAYTESTS_DB) return jsonResponse({ error: "试玩数据库尚未绑定" }, 503);
    const { game, feedback } = normalizeSubmission(await request.json());
    const saved = await upsertFeedback(env.PLAYTESTS_DB, game, feedback);
    return jsonResponse({ ok: true, id: saved.id, duplicate: saved.duplicate }, saved.duplicate ? 200 : 201);
  } catch (error) {
    return jsonResponse({ error: isClientError(error) ? error.message : "服务器暂时不可用" }, isClientError(error) ? 400 : 500);
  }
}
