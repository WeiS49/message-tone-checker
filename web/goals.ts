import type { Answer } from "../jev";

export type GoalId = "polite" | "request" | "reply" | "urgent" | "gentle" | "formal";
export type Recipient = "colleague" | "teacher" | "client" | "friend";

export const recipientGoals: Record<Recipient, GoalId[]> = {
  colleague: ["polite", "request", "reply"],
  teacher: ["polite", "reply", "formal"],
  client: ["polite", "request", "formal"],
  friend: ["polite", "gentle"],
};

type Goal = {
  id: GoalId;
  label: string;
  question: string;
  option?: string;
  threshold: number;
  maximum?: boolean;
  advice: string;
};

export const goals: Goal[] = [
  { id: "polite", label: "Sound polite", question: "politeness", threshold: 2,
    advice: "Try a courteous opening and acknowledge the other person's time." },
  { id: "request", label: "Make a request", question: "intent", option: "request", threshold: 0.65,
    advice: "Name the specific action you want the other person to take." },
  { id: "reply", label: "Invite a reply", question: "needs_reply", threshold: 0.7,
    advice: "Add a clear question or ask them to confirm." },
  { id: "urgent", label: "Make urgency clear", question: "urgency", threshold: 2,
    advice: "If it is time-sensitive, state when you need an answer or action." },
  { id: "gentle", label: "Keep urgency low", question: "urgency", threshold: 1, maximum: true,
    advice: "If timing is flexible, say so and soften words like today or immediately." },
  { id: "formal", label: "Use a formal tone", question: "formality", option: "formal", threshold: 0.65,
    advice: "Use complete sentences and replace slang with neutral wording." },
];

export function goalValue(goal: Goal, answer: Answer | undefined): number | undefined {
  if (!answer) return undefined;
  if (answer.type === "score") return answer.score;
  if (answer.type === "boolean") return answer.probability;
  return goal.option ? answer.probabilities[goal.option] : undefined;
}

export function checkGoal(goal: Goal, answer: Answer | undefined): "pass" | "review" | "unknown" {
  const value = goalValue(goal, answer);
  if (value === undefined || !Number.isFinite(value)) return "unknown";
  if (answer && "confidence" in answer && answer.confidence !== undefined && answer.confidence < 0.5) return "unknown";
  return (goal.maximum ? value <= goal.threshold : value >= goal.threshold) ? "pass" : "review";
}

export function formatGoalValue(goal: Goal, answer: Answer | undefined): string {
  const value = goalValue(goal, answer);
  if (value === undefined || !Number.isFinite(value)) return "–";
  return answer?.type === "score" ? `${value.toFixed(2)} / 3` : `${Math.round(value * 100)}%`;
}
