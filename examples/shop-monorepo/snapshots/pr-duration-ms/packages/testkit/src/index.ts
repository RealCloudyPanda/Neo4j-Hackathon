// A tiny assertion helper so the fixture's tests type-check with no dependencies.
export function test(name: string, fn: () => void): void {
  fn();
  void name;
}

export function expect<T>(actual: T) {
  return {
    toBe(expected: T): void {
      if (actual !== expected) throw new Error(`expected ${String(expected)}, got ${String(actual)}`);
    },
  };
}
