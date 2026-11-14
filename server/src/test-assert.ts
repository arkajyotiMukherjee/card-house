/** Assertions for the strip-types rule tests, without Node-only module types. */
function encode(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    typeof item === 'bigint' ? `${item}n` : item,
  );
}
export default {
  equal(actual: unknown, expected: unknown): void {
    if (!Object.is(actual, expected))
      throw new Error(`Expected ${encode(expected)}, got ${encode(actual)}`);
  },
  deepEqual(actual: unknown, expected: unknown): void {
    if (encode(actual) !== encode(expected))
      throw new Error(`Expected ${encode(expected)}, got ${encode(actual)}`);
  },
  ok(value: unknown): void {
    if (!value) throw new Error('Assertion failed');
  },
  throws(action: () => unknown): void {
    try {
      action();
    } catch {
      return;
    }
    throw new Error('Expected an error');
  },
};
