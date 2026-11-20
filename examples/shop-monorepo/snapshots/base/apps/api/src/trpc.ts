// Minimal tRPC-shaped stub: enough structure for a realistic router, no dependency.
type Resolver<I, O> = (opts: { input: I }) => O;

export const t = {
  procedure: {
    input<I>(_parse: (raw: unknown) => I) {
      return {
        query<O>(resolve: Resolver<I, O>) {
          return { resolve };
        },
      };
    },
  },
};

export function router<T extends Record<string, unknown>>(routes: T): T {
  return routes;
}
