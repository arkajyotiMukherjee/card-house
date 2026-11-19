export const TABLE_RESULT_REVIEW_SECONDS = 10;
const RESULT_REVIEW_MICROS = BigInt(TABLE_RESULT_REVIEW_SECONDS) * 1_000_000n;

/** A funded table can still be between hands even with a finished result on screen. */
export function tableReviewEndsAt(
  finished: boolean,
  hasFunding: boolean,
  lastActivityMicros: bigint,
): bigint | undefined {
  return finished && !hasFunding
    ? lastActivityMicros + RESULT_REVIEW_MICROS
    : undefined;
}
