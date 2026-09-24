// Local server for the mind reader: serves the web page at / and runs Jev on text at POST /api/read.
// It binds to 127.0.0.1 only, so the API key it holds is never reachable from other machines.

import { evaluate, hasApiKey, JevError } from "./jev";
import { questions } from "./questions";
import index from "./web/index.html";

const MAX_CHARS = 2000;

function textFrom(body: unknown): string {
  if (typeof body !== "object" || body === null) return "";
  const text = (body as { text?: unknown }).text;
  return typeof text === "string" ? text.trim() : "";
}

async function read(req: Request): Promise<Response> {
  const text = textFrom(await req.json().catch(() => null));
  if (!text) return Response.json({ error: "text is required" }, { status: 400 });
  if (text.length > MAX_CHARS) {
    return Response.json({ error: `text is longer than ${MAX_CHARS} characters` }, { status: 413 });
  }
  try {
    const { answers, ms, inputTokens, cost } = await evaluate(text, questions, { signal: req.signal });
    return Response.json({ answers, ms, inputTokens, cost });
  } catch (err) {
    const status = err instanceof JevError ? err.status : 502;
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status });
  }
}

if (!hasApiKey()) console.warn("AI_GATEWAY_API_KEY not found: /api/read will fail until .env.local is in place.");

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.PORT ?? 3000),
  routes: {
    "/": index,
    "/api/read": { POST: read },
  },
  development: process.env.NODE_ENV !== "production",
});

console.log(`Jev mind reader: ${server.url}`);
