import { describe, expect, test } from "bun:test";
import { errorDetail, explainFailure } from "./jev";

describe("explainFailure", () => {
  test("recognizes the card verification block", () => {
    const body = JSON.stringify({ error: { type: "customer_verification_required", message: "add a card" } });
    expect(explainFailure(403, body)).toContain("credit card");
  });

  test("maps common statuses to plain reasons", () => {
    expect(explainFailure(401, "")).toBe("invalid key or no permission");
    expect(explainFailure(402, "")).toBe("not enough AI Gateway credits");
    expect(explainFailure(429, "")).toContain("rate limited");
    expect(explainFailure(500, "")).toBe("request failed");
  });
});

describe("errorDetail", () => {
  test("uses the gateway's own error message", () => {
    expect(errorDetail(JSON.stringify({ error: { message: "Bad question" } }))).toBe("Bad question");
  });

  test("falls back to the raw body, truncated", () => {
    expect(errorDetail("upstream exploded")).toBe("upstream exploded");
    expect(errorDetail("x".repeat(800))).toHaveLength(500);
  });
});
