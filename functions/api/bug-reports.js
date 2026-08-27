import { isClientError, jsonResponse, normalizeBugReport } from "../../functions-shared/playtests.js";
import { insertBugReport } from "../../functions-shared/d1-playtests.js";

export async function onRequestPost({ request, env }) {
  try {
    if (!env.PLAYTESTS_DB) return jsonResponse({ error: "试玩数据库尚未绑定" }, 503);
    const { report } = normalizeBugReport(await request.json());
    const saved = await insertBugReport(env.PLAYTESTS_DB, report);
    return jsonResponse({ ok: true, id: saved.id }, 201);
  } catch (error) {
    return jsonResponse({ error: isClientError(error) ? error.message : "服务器暂时不可用" }, isClientError(error) ? 400 : 500);
  }
}
