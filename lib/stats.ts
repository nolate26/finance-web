/** Returns the arithmetic mean of a numeric array. Returns NaN on empty input. */
export function mean(values: number[]): number {
  if (values.length === 0) return NaN;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Returns the population standard deviation of a numeric array. Returns 0 on single-element input. */
export function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Given a series of values, computes the mean and ±1 SD band.
 * Filters out nulls before computing.
 */
export function computeBands(values: (number | null)[]): {
  avg: number;
  upper: number;
  lower: number;
} {
  const clean = values.filter((v): v is number => v !== null && isFinite(v));
  if (clean.length === 0) return { avg: 0, upper: 0, lower: 0 };
  const m = mean(clean);
  const sd = stddev(clean);
  return { avg: m, upper: m + sd, lower: m - sd };
}
