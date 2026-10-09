// The browser build's stand-in for lib/public-data/route.ts (next.config.js
// aliases it for client compilations only). lib/db.ts is reachable from a few
// client components through shared helpers (lib/cards.ts → PageSizeSelect),
// where @prisma/client resolves to its browser stub and no query ever runs. The
// real router imports node:fs, node:crypto and node:async_hooks, which webpack
// cannot bundle for the browser, so the client gets these no-ops instead.
export function routeQuery<T>(_model: string | undefined, _operation: string, args: unknown, query: (args: unknown) => Promise<T>): Promise<T> {
  return query(args);
}

export function routeRaw<T>(_fromFiles: () => T, fromNeon: () => Promise<T>): Promise<T> {
  return fromNeon();
}

export function publicRead<T>(): T {
  throw new Error("[public-data] publicRead is server-only");
}
