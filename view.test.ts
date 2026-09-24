import { describe, expect, test } from "bun:test";
import { change, clamp01, confidenceOpacity, filledCells, levelLabel, questionTitle, scoreFraction } from "./view";

test("clamp01 keeps values within 0..1", () => {
  expect(clamp01(-1)).toBe(0);
  expect(clamp01(2)).toBe(1);
  expect(clamp01(0.3)).toBe(0.3);
});

describe("filledCells", () => {
  test("scales a probability to the bar width", () => {
    expect(filledCells(0.5, 20)).toBe(10);
    expect(filledCells(0.67, 20)).toBe(13);
  });

  test("clamps out-of-range probabilities", () => {
    expect(filledCells(-0.2, 20)).toBe(0);
    expect(filledCells(1.4, 20)).toBe(20);
  });
});

describe("change", () => {
  test("is null without a previous reading", () => {
    expect(change(0.4, undefined)).toBeNull();
  });

  test("ignores changes below the threshold", () => {
    expect(change(0.505, 0.5)).toBeNull();
  });

  test("returns the signed difference", () => {
    expect(change(0.85, 0.04)).toBeCloseTo(0.81);
    expect(change(0.46, 1)).toBeCloseTo(-0.54);
  });
});

describe("scoreFraction", () => {
  test("maps a score onto 0..1 across the levels", () => {
    expect(scoreFraction(0, 4)).toBe(0);
    expect(scoreFraction(1.5, 4)).toBeCloseTo(0.5);
    expect(scoreFraction(3, 4)).toBe(1);
  });

  test("clamps and handles a scale with fewer than two levels", () => {
    expect(scoreFraction(5, 4)).toBe(1);
    expect(scoreFraction(1, 1)).toBe(0);
  });
});

describe("levelLabel", () => {
  test("keeps the text before the first colon", () => {
    expect(levelLabel("rude: insults, mockery, or a commanding tone")).toBe("rude");
    expect(levelLabel("粗鲁：有辱骂")).toBe("粗鲁");
  });

  test("returns the whole level when there is no colon", () => {
    expect(levelLabel("high")).toBe("high");
  });
});

describe("confidenceOpacity", () => {
  test("keeps answers without a confidence opaque", () => {
    expect(confidenceOpacity(undefined)).toBe(1);
  });

  test("fades low confidence toward 0.35", () => {
    expect(confidenceOpacity(1)).toBe(1);
    expect(confidenceOpacity(0)).toBeCloseTo(0.35);
    expect(confidenceOpacity(0.5)).toBeCloseTo(0.675);
  });
});

test("questionTitle turns ids into words", () => {
  expect(questionTitle("needs_reply")).toBe("needs reply");
  expect(questionTitle("emotion")).toBe("emotion");
});
