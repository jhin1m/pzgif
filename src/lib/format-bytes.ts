/**
 * Byte formatting for everything the user reads: file chips, size deltas,
 * estimates, the before/after plates.
 *
 * ── Decimal units, on purpose ───────────────────────────────────────────────
 * 1 MB = 1,000,000 bytes here, not 1,048,576. Every operating system file
 * browser a visitor could cross-check against reports decimal megabytes, and a
 * result that disagrees with Finder or Explorer by 5% reads as a rounding bug in
 * the tool. The difference matters because these numbers are the *evidence* for
 * the product's central claim; they have to survive being checked.
 *
 * ── Why the precision varies ────────────────────────────────────────────────
 * "2.4 MB" and "480 KB" are the wireframe's own numbers, and they follow a rule
 * worth keeping: enough significant figures to be useful, never enough to imply
 * precision the number does not have. Three digits below 10, none above.
 */

const UNITS = ["B", "KB", "MB", "GB"] as const;

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1000) return `${Math.round(bytes)} B`;

  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }
  // 9.87 MB keeps its decimal; 124 MB does not need one, and 124.3 MB implies a
  // measurement precision that the underlying blob size does not carry.
  const digits = value < 10 ? 1 : 0;
  return `${value.toFixed(digits)} ${UNITS[unit]}`;
}

/**
 * Which way the file went, at the precision the badge actually prints.
 *
 * The rounding lives here rather than at the call sites so the word and the
 * colour are decided by one number. A panel whose badge reads "no change" while
 * its icon warns about growth is the panel disagreeing with itself, and that is
 * only avoidable if both read the same rounded percentage.
 */
export type DeltaDirection = "smaller" | "larger" | "none" | "unknown";

export function deltaDirection(
  fromBytes: number,
  toBytes: number,
): DeltaDirection {
  if (fromBytes <= 0) return "unknown";
  const change = Math.round(((toBytes - fromBytes) / fromBytes) * 100);
  if (change === 0) return "none";
  return change < 0 ? "smaller" : "larger";
}

/**
 * The size-delta pill: "−80% smaller", or "+4% larger" when it grew.
 *
 * A compressor that made the file bigger has to say so plainly. It happens —
 * re-encoding an already-optimised GIF at a higher quality is a real user
 * action — and hiding it behind an unsigned percentage would make the one
 * measurement on the page that proves the tool works into the one that lies.
 */
export function formatDelta(fromBytes: number, toBytes: number): string {
  const direction = deltaDirection(fromBytes, toBytes);
  if (direction === "unknown") return "—";
  if (direction === "none") return "no change";
  const change = Math.round(((toBytes - fromBytes) / fromBytes) * 100);
  return change < 0 ? `−${Math.abs(change)}% smaller` : `+${change}% larger`;
}
