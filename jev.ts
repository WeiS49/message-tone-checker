// Minimal server-side client for Jev (TypeSafe AI) through Vercel AI Gateway's evaluation API.
// Never import this from browser code: it reads the API key from the environment.

import type { Question } from "./questions";

const ENDPOINT = "https://ai-gateway.vercel.sh/v1/evaluate";
const MODEL = "typesafe-ai/jev";

export type Answer =
  | { type: "choice"; choice: string; probabilities: Record<string, number>; confidence?: number }
  | { type: "score"; score: number; probabilities: Record<string, number>; confidence?: number }
  | { type: "boolean"; probability: number };

export type Reading = {
  answers: Record<string, Answer>;
  ms: number;
  inputTokens: number | null;
  cost: string | null;
  raw: unknown;
};

export class JevError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "JevError";
  }
}

export const hasApiKey = (): boolean => Boolean(process.env.AI_GATEWAY_API_KEY);

/** Plain-language reason for a failed gateway response. */
export function explainFailure(status: number, body: string): string {
  if (body.includes("customer_verification_required")) {
    return "Vercel needs a credit card on file before AI Gateway serves requests (free credits included)";
  }
  if (status === 401 || status === 403) return "invalid key or no permission";
  if (status === 402) return "not enough AI Gateway credits";
  if (status === 429) return "rate limited (the free tier has lower limits); wait a few seconds and retry";
  return "request failed";
}

/** The gateway's own message when the body is `{ error: { message } }`, otherwise the raw body, truncated. */
export function errorDetail(body: string): string {
  try {
    const message = JSON.parse(body)?.error?.message;
    if (typeof message === "string" && message) return message;
  } catch {
    // Not JSON; fall through to the raw body.
  }
  return body.slice(0, 500);
}

export async function evaluate(
  state: string,
  questions: Record<string, Question>,
  options: { signal?: AbortSignal } = {},
): Promise<Reading> {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) {
    throw new JevError(500, "AI_GATEWAY_API_KEY not found. Put it in .env.local and run from the project folder.");
  }
  const started = performance.now();
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, state, questions }),
    signal: options.signal,
  });
  const body = await res.text();
  const ms = Math.round(performance.now() - started);
  if (!res.ok) {
    throw new JevError(res.status, `${res.status} ${explainFailure(res.status, body)}: ${errorDetail(body)}`);
  }
  const data = JSON.parse(body);
  return {
    answers: data.answers,
    ms,
    inputTokens: data.usage?.inputTokens ?? null,
    cost: data.providerMetadata?.gateway?.cost ?? null,
    raw: data,
  };
}
