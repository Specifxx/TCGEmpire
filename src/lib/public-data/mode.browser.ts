// The browser build's stand-in for lib/public-data/mode.ts (see route.browser.ts).
export type PublicDataMode = "db" | "fallback" | "files";
export const publicDataMode = (): PublicDataMode => "db";
export const withLiveData = <T>(fn: () => T): T => fn();
export const inLiveScope = () => false;
export const neonMarkedDown = () => false;
export const markNeonDown = () => undefined;
export const isNeonUnavailable = () => false;
