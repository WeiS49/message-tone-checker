// Terminal playground for Jev (TypeSafe AI) through Vercel AI Gateway.
//
//   bun play.ts                  interactive: type a sentence, press Enter (Ctrl+C to quit)
//   bun play.ts "some text"      evaluate one sentence and exit
//   bun play.ts --raw "text"     also print the raw JSON response
//
// Bun loads AI_GATEWAY_API_KEY from .env.local in the current folder. The key is never printed.

import { createInterface } from "node:readline";
import { questions } from "./questions";

const ENDPOINT = "https://ai-gateway.vercel.sh/v1/evaluate";
const MODEL = "typesafe-ai/jev";
const BAR_WIDTH = 20;
const RULER_WIDTH = 25;

type Answer =
  | { type: "choice"; choice: string; probabilities: Record<string, number>; confidence?: number }
  | { type: "score"; score: number; probabilities: Record<string, number>; confidence?: number }
  | { type: "boolean"; probability: number };

type EvaluateResponse = {
  answers: Record<string, Answer>;
  usage?: { inputTokens?: number; outputTokens?: number };
  providerMetadata?: { gateway?: { cost?: string } };
};

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: number) => (s: string) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = paint(1);
const dim = paint(2);
const red = paint(31);
const green = paint(32);
const cyan = paint(36);

const apiKey = process.env.AI_GATEWAY_API_KEY;
if (!apiKey) {
  console.error(red("AI_GATEWAY_API_KEY not found. Make sure .env.local is in the project folder and run this from there."));
  process.exit(1);
}

function explain(status: number, body: string): string {
  if (body.includes("customer_verification_required")) return "Vercel needs a credit card on file before AI Gateway serves requests (free credits included)";
  if (status === 401 || status === 403) return "invalid key or no permission";
  if (status === 402) return "not enough AI Gateway credits";
  if (status === 429) return "rate limited (the free tier has lower limits); wait a few seconds and retry";
  return "request failed";
}

async function evaluate(state: string) {
  const started = performance.now();
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, state, questions }),
  });
  const body = await res.text();
  const ms = Math.round(performance.now() - started);
  if (!res.ok) {
    let detail = body.slice(0, 500);
    try {
      const error = JSON.parse(body).error;
      if (error?.message) detail = error.message;
    } catch {}
    throw new Error(`${res.status} ${explain(res.status, body)}\n${detail}`);
  }
  return { data: JSON.parse(body) as EvaluateResponse, ms };
}

const pad = (s: string, width: number) => s + " ".repeat(Math.max(0, width - Bun.stringWidth(s)));
const num = (x: number) => x.toFixed(2);
const bar = (p: number) => {
  const filled = Math.round(Math.min(Math.max(p, 0), 1) * BAR_WIDTH);
  return "█".repeat(filled) + dim("░".repeat(BAR_WIDTH - filled));
};
// Change since the previous sentence, so small edits show their effect.
const delta = (now: number, before?: number) => {
  if (before === undefined || Math.abs(now - before) < 0.01) return "";
  return now > before ? green(` ▲${num(now - before)}`) : red(` ▼${num(before - now)}`);
};
const confidence = (x?: number) => (x === undefined ? "" : dim(`  confidence ${num(x)}`));

function render(answers: Record<string, Answer>, prev?: Record<string, Answer>) {
  for (const [id, q] of Object.entries(questions)) {
    const a = answers[id];
    const p = prev?.[id];
    if (!a) {
      console.log(`${bold(id)}  ${red("no answer returned")}\n`);
      continue;
    }
    if (q.type === "choice" && a.type === "choice") {
      const before = p?.type === "choice" ? p.probabilities : undefined;
      console.log(`${bold(id)} ${dim("choice")} → ${cyan(a.choice)}${confidence(a.confidence)}`);
      const options = Object.keys(q.criteria);
      const width = Math.max(...options.map((o) => Bun.stringWidth(o)));
      for (const option of options) {
        const prob = a.probabilities[option] ?? 0;
        const mark = option === a.choice ? "▸" : " ";
        console.log(`  ${mark} ${pad(option, width)}  ${bar(prob)}  ${num(prob)}${delta(prob, before?.[option])}`);
      }
    } else if (q.type === "score" && a.type === "score") {
      const before = p?.type === "score" ? p : undefined;
      const max = q.criteria.length - 1;
      console.log(
        `${bold(id)} ${dim("score")} → ${cyan(`${num(a.score)} / ${max}`)}${delta(a.score, before?.score)}${confidence(a.confidence)}`,
      );
      const labels = q.criteria.map((level, i) => `${i} ${level.split(/[:：]/)[0]}`);
      const width = Math.max(...labels.map((l) => Bun.stringWidth(l)));
      labels.forEach((label, i) => {
        const prob = a.probabilities[String(i)] ?? 0;
        console.log(`    ${pad(label, width)}  ${bar(prob)}  ${num(prob)}${delta(prob, before?.probabilities[String(i)])}`);
      });
      // Where the interpolated score sits between the lowest and highest level.
      const pos = Math.round((Math.min(Math.max(a.score, 0), max) / max) * (RULER_WIDTH - 1));
      console.log(`    ${dim("0")} ${"─".repeat(pos)}●${"─".repeat(RULER_WIDTH - 1 - pos)} ${dim(String(max))}`);
    } else if (a.type === "boolean") {
      const before = p?.type === "boolean" ? p.probability : undefined;
      console.log(`${bold(id)} ${dim("boolean")} → ${cyan(num(a.probability))}${delta(a.probability, before)}`);
      console.log(`    ${bar(a.probability)}  ${dim(a.probability >= 0.5 ? "leans yes" : "leans no")}`);
    } else {
      console.log(`${bold(id)}  ${red(`answer type doesn't match the question: ${JSON.stringify(a)}`)}`);
    }
    console.log();
  }
}

const args = process.argv.slice(2);
const raw = args.includes("--raw");
const sentence = args.filter((a) => a !== "--raw").join(" ").trim();
let previous: Record<string, Answer> | undefined;

async function run(state: string): Promise<boolean> {
  try {
    const { data, ms } = await evaluate(state);
    console.log();
    render(data.answers, previous);
    const cost = data.providerMetadata?.gateway?.cost ?? "?";
    console.log(dim(`${ms} ms · ${data.usage?.inputTokens ?? "?"} input tokens · cost $${cost}`));
    if (raw) console.log(JSON.stringify(data, null, 2));
    previous = data.answers;
    return true;
  } catch (err) {
    console.error(red(`Error: ${err instanceof Error ? err.message : String(err)}`));
    return false;
  }
}

if (sentence) {
  process.exit((await run(sentence)) ? 0 : 1);
}

console.log(bold("Jev terminal playground"));
console.log(dim("Type a sentence and press Enter. Press ↑ to recall the last one, tweak it, and press Enter again; ▲▼ show the change from the previous sentence. Ctrl+C quits."));
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
rl.on("SIGINT", () => rl.close());
rl.setPrompt("› ");
console.log();
rl.prompt();
for await (const line of rl) {
  if (line.trim()) await run(line.trim());
  console.log();
  rl.prompt();
}
process.exit(0);
