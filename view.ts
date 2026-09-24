// Pure display math shared by the terminal playground and the web page.

/** Clamp a number into the 0..1 range. */
export const clamp01 = (x: number): number => Math.min(Math.max(x, 0), 1);

/** Number of filled cells for probability p in a bar of the given width. */
export const filledCells = (p: number, width: number): number => Math.round(clamp01(p) * width);

/** Change since the previous reading, or null when there is none or it is below the threshold. */
export function change(now: number, before: number | undefined, threshold = 0.01): number | null {
  if (before === undefined) return null;
  const d = now - before;
  return Math.abs(d) < threshold ? null : d;
}

/** Where an interpolated score sits between the lowest and highest level, as 0..1. */
export const scoreFraction = (score: number, levels: number): number =>
  levels < 2 ? 0 : clamp01(score / (levels - 1));

/** Short label for a score level: the text before the first colon ("rude: insults" -> "rude"). */
export const levelLabel = (level: string): string => level.split(/[:：]/)[0]!.trim();

/** Card opacity: answers without a confidence stay opaque, low confidence fades toward 0.35. */
export const confidenceOpacity = (confidence: number | undefined): number =>
  confidence === undefined ? 1 : 0.35 + 0.65 * clamp01(confidence);

/** Display title for a question id ("needs_reply" -> "needs reply"). */
export const questionTitle = (id: string): string => id.replace(/[_-]+/g, " ");
