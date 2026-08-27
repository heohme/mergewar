import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import {
  isClientError, normalizeBugReport, normalizeCompletion, normalizeSubmission, summarizeSubmissions,
} from "../functions-shared/playtests.js";

const DEFAULT_ROOT = fileURLToPath(new URL("../", import.meta.url));
const MAX_BODY_BYTES = 128 * 1024;
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

async function readEntries(dataFile) {
  try {
    const content = await readFile(dataFile, "utf8");
    return content.split("\n").filter(Boolean).flatMap((line) => {
      try { return [JSON.parse(line)]; } catch { return []; }
    });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function saveRecord(dataFile, completion, feedback = null) {
  const entries = await readEntries(dataFile);
  let entry = entries.find((item) => item.game?.sessionId === completion.game.sessionId);
  const duplicate = Boolean(feedback ? entry?.feedback : entry);
  if (entry) {
    entry.schemaVersion = completion.schemaVersion;
    entry.game = completion.game;
    if (feedback && !entry.feedback) { entry.feedback = feedback; entry.feedbackSubmittedAt = new Date().toISOString(); }
    entry.updatedAt = new Date().toISOString();
  } else {
    entry = { id: randomUUID(), receivedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...completion };
    if (feedback) { entry.feedback = feedback; entry.feedbackSubmittedAt = new Date().toISOString(); }
    entries.push(entry);
  }
  await mkdir(resolve(dataFile, ".."), { recursive: true });
  await writeFile(dataFile, `${entries.map((item) => JSON.stringify(item)).join("\n")}\n`, "utf8");
  return { entry, duplicate };
}

async function saveBugReport(dataFile, report) {
  const entries = await readEntries(dataFile);
  const entry = { id: randomUUID(), type: "BUG_REPORT", receivedAt: new Date().toISOString(), report };
  entries.push(entry);
  await mkdir(resolve(dataFile, ".."), { recursive: true });
  await writeFile(dataFile, `${entries.map((item) => JSON.stringify(item)).join("\n")}\n`, "utf8");
  return entry;
}

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("请求内容过大");
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new Error("JSON格式无效"); }
}

async function serveStatic(rootDir, pathname, response) {
  const requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const safePath = normalize(requested);
  if (safePath.startsWith("..") || (!safePath.startsWith("src/") && !["index.html", "styles.css"].includes(safePath))) {
    sendJson(response, 404, { error: "未找到资源" }); return;
  }
  try {
    const content = await readFile(join(rootDir, safePath));
    response.writeHead(200, { "content-type": MIME_TYPES[extname(safePath)] || "application/octet-stream" });
    response.end(content);
  } catch (error) {
    if (error.code === "ENOENT") sendJson(response, 404, { error: "未找到资源" });
    else throw error;
  }
}

export function createMergeWarServer(options = {}) {
  const rootDir = resolve(options.rootDir || DEFAULT_ROOT);
  const dataFile = resolve(options.dataFile || process.env.MERGEWAR_DATA_FILE || join(rootDir, "data/playtests.jsonl"));
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      if (request.method === "GET" && url.pathname === "/api/health") return sendJson(response, 200, { ok: true });
      if (request.method === "POST" && url.pathname === "/api/playtests/complete") {
        const completion = normalizeCompletion(await readJson(request));
        const saved = await saveRecord(dataFile, completion);
        return sendJson(response, saved.duplicate ? 200 : 201, { ok: true, duplicate: saved.duplicate, id: saved.entry.id });
      }
      if (request.method === "POST" && ["/api/playtests", "/api/playtests/feedback"].includes(url.pathname)) {
        const submission = normalizeSubmission(await readJson(request));
        const saved = await saveRecord(dataFile, { schemaVersion: submission.schemaVersion, game: submission.game }, submission.feedback);
        return sendJson(response, saved.duplicate ? 200 : 201, { ok: true, duplicate: saved.duplicate, id: saved.entry.id });
      }
      if (request.method === "POST" && url.pathname === "/api/bug-reports") {
        const { report } = normalizeBugReport(await readJson(request));
        const saved = await saveBugReport(dataFile, report);
        return sendJson(response, 201, { ok: true, id: saved.id });
      }
      if (request.method === "GET" && url.pathname === "/api/playtests/summary") {
        return sendJson(response, 200, summarizeSubmissions(await readEntries(dataFile)));
      }
      if (request.method === "GET" && url.pathname === "/api/playtests/export") {
        return sendJson(response, 200, { submissions: await readEntries(dataFile) });
      }
      if (url.pathname.startsWith("/api/")) return sendJson(response, 404, { error: "接口不存在" });
      if (request.method !== "GET" && request.method !== "HEAD") return sendJson(response, 405, { error: "请求方法不支持" });
      return await serveStatic(rootDir, url.pathname, response);
    } catch (error) {
      return sendJson(response, isClientError(error) ? 400 : 500, { error: isClientError(error) ? error.message : "服务器暂时不可用" });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.MERGEWAR_PORT || 4173);
  const host = process.env.MERGEWAR_HOST || "127.0.0.1";
  const server = createMergeWarServer();
  server.listen(port, host, () => console.log(`MergeWar running at http://${host}:${port}`));
}
