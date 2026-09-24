// Browser side of the mind reader: sends the text to /api/read as you type and animates the answers.
// The Jev client and the API key stay on the server; its Answer import is type-only.

import type { Answer } from "../jev";
import { questions, type Question } from "../questions";
import { change, clamp01, confidenceOpacity, levelLabel, questionTitle, scoreFraction } from "../view";
import { translate, type Language } from "./language";
import { checkGoal, formatGoalValue, goals, recipientGoals, type GoalId, type Recipient } from "./goals";

const DEBOUNCE_MS = 300;

type ReadResponse =
  | { answers: Record<string, Answer>; ms: number; inputTokens: number | null; cost: string | null }
  | { error: string };

type Row = { row: HTMLElement; fill: HTMLElement; value: HTMLElement; delta: HTMLElement };
type Card = { root: HTMLElement; headline: HTMLElement; meta: HTMLElement; rows: Map<string, Row>; marker?: HTMLElement };
type Original = { text: string; answers: Record<string, Answer> };

const input = document.querySelector<HTMLTextAreaElement>("#text")!;
const status = document.querySelector<HTMLElement>("#status")!;
const grid = document.querySelector<HTMLElement>("#cards")!;
const languageSelect = document.querySelector<HTMLSelectElement>("#language")!;
const originalPanel = document.querySelector<HTMLElement>("#original-panel")!;
const originalInput = document.querySelector<HTMLTextAreaElement>("#original-text")!;
const pinButton = document.querySelector<HTMLButtonElement>("#pin-original")!;
const clearButton = document.querySelector<HTMLButtonElement>("#clear-original")!;
const recipientSelect = document.querySelector<HTMLSelectElement>("#recipient")!;
const goalOptions = document.querySelector<HTMLElement>("#goal-options")!;
const goalChecks = document.querySelector<HTMLElement>("#goal-checks")!;
const copyButton = document.querySelector<HTMLButtonElement>("#copy-text")!;
const copyFeedback = document.querySelector<HTMLElement>("#copy-feedback")!;
const retryButton = document.querySelector<HTMLButtonElement>("#retry")!;
let selectedGoals = new Set<GoalId>(recipientGoals.colleague);
let copyState: "ready" | "copied" | "failed" = "ready";
let language: Language = languageSelect.value === "en" ? "en" : "zh";
const t = (text: string) => translate(language, text);

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const signed = (d: number) => `${d > 0 ? "▲" : "▼"}${Math.abs(d).toFixed(2)}`;

function makeRow(label: string): Row {
  const row = el("div", "row");
  const track = el("span", "track");
  const fill = el("span", "fill");
  track.append(fill);
  const value = el("span", "value", "–");
  const delta = el("span", "delta");
  row.append(el("span", "label", label), track, value, delta);
  return { row, fill, value, delta };
}

// Language and comparison changes rebuild cards; new readings update them in place.
function makeCard(id: string, q: Question, parent: HTMLElement, version?: string): Card {
  const root = el("article", `card ${q.type}`);
  if (version) root.append(el("p", "version-label", t(version)));
  const header = el("header");
  header.append(el("h2", undefined, t(questionTitle(id))), el("span", "tag", t(q.type === "boolean" ? "yes / no" : q.type)));
  const headline = el("p", "headline", "–");
  const meta = el("p", "meta");
  root.append(header, headline, meta);

  const rows = new Map<string, Row>();
  let marker: HTMLElement | undefined;
  if (q.type === "choice") {
    for (const option of Object.keys(q.criteria)) rows.set(option, makeRow(t(option)));
  } else if (q.type === "score") {
    const ruler = el("div", "ruler");
    marker = el("span", "marker");
    ruler.append(marker);
    const ends = el("div", "ruler-ends");
    ends.append(el("span", undefined, t(levelLabel(q.criteria[0] ?? ""))), el("span", undefined, t(levelLabel(q.criteria.at(-1) ?? ""))));
    root.append(ruler, ends);
    q.criteria.forEach((level, i) => rows.set(String(i), makeRow(t(levelLabel(level)))));
  } else {
    rows.set("yes", makeRow(t("yes")));
  }
  const rowsBox = el("div", "rows");
  for (const { row } of rows.values()) rowsBox.append(row);
  root.append(rowsBox);
  parent.append(root);
  return { root, headline, meta, rows, marker };
}

function setRow(row: Row | undefined, p: number, before: number | undefined) {
  if (!row) return;
  row.fill.style.width = `${clamp01(p) * 100}%`;
  row.value.textContent = p.toFixed(2);
  const d = change(p, before);
  row.delta.textContent = d === null ? "" : signed(d);
  row.delta.className = d === null ? "delta" : `delta ${d > 0 ? "up" : "down"}`;
}

function update(q: Question, card: Card, a: Answer, prev: Answer | undefined) {
  card.root.style.opacity = String(confidenceOpacity("confidence" in a ? a.confidence : undefined));
  if (q.type === "choice" && a.type === "choice") {
    const before = prev?.type === "choice" ? prev.probabilities : undefined;
    card.headline.textContent = t(a.choice);
    card.meta.textContent = a.confidence === undefined ? "" : `${t("confidence")} ${a.confidence.toFixed(2)}`;
    for (const [option, row] of card.rows) {
      setRow(row, a.probabilities[option] ?? 0, before?.[option]);
      row.row.classList.toggle("top", option === a.choice);
    }
  } else if (q.type === "score" && a.type === "score") {
    const before = prev?.type === "score" ? prev : undefined;
    const levels = q.criteria.length;
    const nearest = q.criteria[Math.round(clamp01(a.score / (levels - 1)) * (levels - 1))] ?? "";
    card.headline.textContent = `${a.score.toFixed(2)} / ${levels - 1} · ${t(levelLabel(nearest))}`;
    const d = change(a.score, before?.score);
    card.meta.textContent = [a.confidence === undefined ? "" : `${t("confidence")} ${a.confidence.toFixed(2)}`, d === null ? "" : signed(d)]
      .filter(Boolean)
      .join(" · ");
    if (card.marker) card.marker.style.left = `${scoreFraction(a.score, levels) * 100}%`;
    for (const [level, row] of card.rows) {
      setRow(row, a.probabilities[level] ?? 0, before?.probabilities[level]);
      row.row.classList.toggle("top", level === String(Math.round(a.score)));
    }
  } else if (a.type === "boolean") {
    const before = prev?.type === "boolean" ? prev.probability : undefined;
    card.headline.textContent = t(a.probability >= 0.5 ? "leans yes" : "leans no");
    card.meta.textContent = t("probability of yes");
    setRow(card.rows.get("yes"), a.probability, before);
  }
}

let statusMessage = () => t("Waiting for input");

function setStatus(message: () => string, tone: "info" | "error" = "info") {
  statusMessage = message;
  status.textContent = message();
  status.dataset.tone = tone;
  retryButton.hidden = tone !== "error" || !input.value.trim();
}

const cards = new Map<string, Card>();
document.body.classList.add("idle");

let timer: ReturnType<typeof setTimeout> | undefined;
let inflight: AbortController | undefined;
let lastText = "";
let previous: Record<string, Answer> | undefined;
let comparison: Record<string, Answer> | undefined;
let analyzedText = "";
let original: Original | undefined;

function syncPinButton() {
  pinButton.disabled = !previous || !input.value.trim() || input.value.trim() !== analyzedText || Boolean(inflight);
  copyButton.disabled = !input.value.trim();
}

function renderCopyFeedback() {
  copyFeedback.textContent = copyState === "copied" ? t("Copied") : copyState === "failed"
    ? t("Copy unavailable. Select the text and press Cmd/Ctrl+C.") : "";
}

function renderGoalOptions() {
  goalOptions.replaceChildren();
  for (const goal of goals) {
    const label = el("label", "goal-option");
    const checkbox = el("input");
    checkbox.type = "checkbox";
    checkbox.value = goal.id;
    checkbox.checked = selectedGoals.has(goal.id);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        selectedGoals.add(goal.id);
        const opposite = goal.id === "urgent" ? "gentle" : goal.id === "gentle" ? "urgent" : undefined;
        if (opposite) {
          selectedGoals.delete(opposite);
          goalOptions.querySelector<HTMLInputElement>(`input[value="${opposite}"]`)!.checked = false;
        }
      } else selectedGoals.delete(goal.id);
      renderGoalChecks();
    });
    label.append(checkbox, el("span", undefined, t(goal.label)));
    goalOptions.append(label);
  }
}

function renderGoalChecks() {
  goalChecks.replaceChildren();
  if (!selectedGoals.size) {
    goalChecks.append(el("p", "goal-advice", t("Choose a goal to see focused feedback.")));
    return;
  }
  const hasText = Boolean(input.value.trim());
  const failed = status.dataset.tone === "error";
  const ready = hasText && input.value.trim() === analyzedText && !inflight && !failed;
  for (const goal of goals.filter((goal) => selectedGoals.has(goal.id))) {
    const answer = ready ? previous?.[goal.question] : undefined;
    const result = ready ? checkGoal(goal, answer) : "waiting";
    const card = el("article", "goal-check");
    card.dataset.tone = result;
    const title = result === "pass" ? "Looks aligned" : result === "review" ? "Consider adjusting"
      : result === "unknown" ? "Uncertain" : !hasText ? "Waiting for input" : failed ? "Analysis unavailable" : "Reading…";
    const advice = result === "review" ? goal.advice : result === "unknown" ? "The analysis is uncertain here. Use your judgment."
      : result === "pass" ? "The current wording appears to fit this goal." : "";
    card.append(el("h3", undefined, t(goal.label)), el("p", "goal-result", t(title)));
    if (ready) {
      const value = formatGoalValue(goal, answer);
      card.append(el("p", "goal-value", original
        ? `A ${formatGoalValue(goal, original.answers[goal.question])} → B ${value}` : value));
    }
    if (advice) card.append(el("p", "goal-advice", t(advice)));
    goalChecks.append(card);
  }
}

function renderComparison() {
  document.body.classList.toggle("comparing", Boolean(original));
  originalPanel.hidden = !original;
  originalInput.value = original?.text ?? "";
  originalInput.setAttribute("aria-label", t("A · Original"));
  document.querySelector("#original-label")!.textContent = t("A · Original");
  document.querySelector("#draft-label")!.textContent = t(original ? "B · Rewrite" : "Current text");
  pinButton.textContent = t(original ? "Use current as original" : "Pin as original");
  clearButton.textContent = t("End comparison");
  clearButton.hidden = !original;
  document.querySelector("#comparison-hint")!.textContent = t(original
    ? "Edit B to compare. ▲ / ▼ show increases / decreases from A, the pinned original."
    : "Enter a sentence, wait for the analysis, then pin it as the original and try a rewrite.");
  syncPinButton();

  grid.replaceChildren();
  cards.clear();
  for (const [id, q] of Object.entries(questions)) {
    let parent = grid;
    if (original) {
      parent = el("div", "card-pair");
      grid.append(parent);
      const originalCard = makeCard(id, q, parent, "A · Original");
      originalCard.root.classList.add("original-card");
      const answer = original.answers[id];
      if (answer) update(q, originalCard, answer, undefined);
    }
    const card = makeCard(id, q, parent, original ? "B · Rewrite" : undefined);
    cards.set(id, card);
    const answer = previous?.[id];
    if (answer) update(q, card, answer, (original?.answers ?? comparison)?.[id]);
  }
  renderGoalChecks();
}

function applyLanguage() {
  document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  document.title = t("Message Tone Checker");
  document.querySelector("h1")!.textContent = t("Message Tone Checker");
  document.querySelector(".lede")!.textContent = t(
    "Choose your audience and goals, check the tone, then compare, edit, and copy your message.",
  );
  document.querySelector("#language-label")!.textContent = t("Language");
  input.placeholder = t("Try: Please send me the report today. Let me know if you need more time.");
  input.setAttribute("aria-label", t("Message to check"));
  grid.setAttribute("aria-label", t("Analysis results"));
  status.textContent = statusMessage();
  for (const [selector, text] of [
    ["#recipient-label", "Who is this for?"], ["#recipient-hint", "Choosing an audience sets suggested goals. You can adjust them."],
    ["#goals-label", "Communication goals"], ["#goals-note", "Treat checks as suggestions. Drafts go to Vercel AI Gateway for analysis after typing pauses."],
    ["#copy-text", "Copy current text"], ["#retry", "Analyze again"], ["#details-label", "View full analysis"],
  ] as const) document.querySelector(selector)!.textContent = t(text);
  const recipients: Record<Recipient, string> = {
    colleague: "Colleague / collaborator", teacher: "Teacher / manager", client: "Client", friend: "Friend / family",
  };
  for (const option of recipientSelect.options) option.textContent = t(recipients[option.value as Recipient]);
  goalChecks.setAttribute("aria-label", t("Goal checks"));
  renderGoalOptions();
  renderCopyFeedback();
  renderComparison();
}

async function read() {
  const text = input.value.trim();
  if (text === lastText) return;
  lastText = text;
  inflight?.abort();
  inflight = undefined;
  document.body.classList.remove("busy");
  if (!text) {
    document.body.classList.add("idle");
    setStatus(() => t("Waiting for input"));
    syncPinButton();
    renderGoalChecks();
    return;
  }

  const controller = new AbortController();
  inflight = controller;
  syncPinButton();
  document.body.classList.add("busy");
  setStatus(() => t("Reading…"));
  renderGoalChecks();
  try {
    const res = await fetch("/api/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    const data = (await res.json()) as ReadResponse;
    if (controller !== inflight || text !== input.value.trim()) return;
    if ("error" in data) throw new Error(data.error);
    for (const [id, q] of Object.entries(questions)) {
      const card = cards.get(id);
      const answer = data.answers[id];
      if (card && answer) update(q, card, answer, (original?.answers ?? previous)?.[id]);
    }
    comparison = previous;
    previous = data.answers;
    analyzedText = text;
    document.body.classList.remove("idle");
    setStatus(() => `${data.ms} ${t("ms")} · ${data.inputTokens ?? "?"} ${t("input tokens")} · ${t("cost")} $${data.cost ?? "?"}`);
  } catch (err) {
    if (controller.signal.aborted || controller !== inflight) return;
    lastText = ""; // allow the same text to be retried
    const message = err instanceof Error ? err.message : String(err);
    setStatus(() => `${t("Analysis failed")}: ${message}`, "error");
  } finally {
    if (controller === inflight) {
      inflight = undefined;
      document.body.classList.remove("busy");
      syncPinButton();
      renderGoalChecks();
    }
  }
}

pinButton.addEventListener("click", () => {
  if (pinButton.disabled || !previous) return;
  original = { text: analyzedText, answers: previous };
  renderComparison();
  input.focus();
});

clearButton.addEventListener("click", () => {
  original = undefined;
  renderComparison();
});

recipientSelect.addEventListener("change", () => {
  selectedGoals = new Set(recipientGoals[recipientSelect.value as Recipient]);
  renderGoalOptions();
  renderGoalChecks();
});

copyButton.addEventListener("click", async () => {
  const text = input.value;
  try {
    await navigator.clipboard.writeText(text);
    if (input.value === text) copyState = "copied";
  } catch {
    copyState = "failed";
    input.focus();
    input.select();
  }
  renderCopyFeedback();
});

retryButton.addEventListener("click", () => {
  clearTimeout(timer);
  lastText = "";
  void read();
});

languageSelect.addEventListener("change", () => {
  language = languageSelect.value === "en" ? "en" : "zh";
  applyLanguage();
});
applyLanguage();

input.addEventListener("input", () => {
  clearTimeout(timer);
  copyState = "ready";
  renderCopyFeedback();
  retryButton.hidden = true;
  syncPinButton();
  renderGoalChecks();
  timer = setTimeout(read, DEBOUNCE_MS);
});
