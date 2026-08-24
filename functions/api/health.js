import { jsonResponse } from "../../functions-shared/playtests.js";

export function onRequestGet() {
  return jsonResponse({ ok: true, storage: "cloudflare-d1" });
}
