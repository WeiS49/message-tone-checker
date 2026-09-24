// Terminal playground for Jev (TypeSafe AI) through Vercel AI Gateway.
//
//   bun play.ts                  interactive: type a sentence, press Enter (Ctrl+C to quit)
//   bun play.ts "some text"      evaluate one sentence and exit
//   bun play.ts --raw "text"     also print the raw JSON response
//
// Bun loads AI_GATEWAY_API_KEY from .env.local in the current folder. The key is never printed.

import { createInterface } from "node:readline";
import { evaluate, hasApiKey, type Answer } from "./jev";
import { questions } from "./questions";
import { change, filledCells, levelLabel, scoreFraction } from "./view";

const BAR_WIDTH = 20;
const RULER_WIDTH = 25;

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: number) => (s: string) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = paint(1);
const dim = paint(2);
const red = paint(31);
const green = paint(32);
const cyan = paint(36);

if (!hasApiKey()) {
  console.error(red("AI_GATEWAY_API_KEY not found. Make sure .env.local is in the project folder and run this from there."));
  process.exit(1);
}

const pad = (s: string, width: number) => s + " ".repeat(Math.max(0, width - Bun.stringWidth(s)));
const num = (x: number) => x.toFixed(2);
const bar = (p: number) => {
  const filled = filledCells(p, BAR_WIDTH);
  return "█".repeat(filled) + dim("░".repeat(BAR_WIDTH - filled));
};
// Change since the previous sentence, so small edits show their effect.
const delta = (now: number, before?: number) => {
  const d = change(now, before);
  if (d === null) return "";
  return d > 0 ? green(` ▲${num(d)}`) : red(` ▼${num(-d)}`);
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
      const labels = q.criteria.map((level, i) => `${i} ${levelLabel(level)}`);
      const width = Math.max(...labels.map((l) => Bun.stringWidth(l)));
      labels.forEach((label, i) => {
        const prob = a.probabilities[String(i)] ?? 0;
        console.log(`    ${pad(label, width)}  ${bar(prob)}  ${num(prob)}${delta(prob, before?.probabilities[String(i)])}`);
      });
      // Where the interpolated score sits between the lowest and highest level.
      const pos = Math.round(scoreFraction(a.score, q.criteria.length) * (RULER_WIDTH - 1));
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
    const reading = await evaluate(state, questions);
    console.log();
    render(reading.answers, previous);
    console.log(dim(`${reading.ms} ms · ${reading.inputTokens ?? "?"} input tokens · cost $${reading.cost ?? "?"}`));
    if (raw) console.log(JSON.stringify(reading.raw, null, 2));
    previous = reading.answers;
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
