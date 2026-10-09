// The one decision point between Neon and the public data files, called from
// lib/db.ts's query extension for every operation on every model. See
// lib/public-data/mode.ts for what each PUBLIC_DATA_MODE does.
import { isPublicModel, type ModelName } from "./models";
import { runPublicQuery } from "./engine";
import { publicDataSource } from "./store";
import { inLiveScope, isNeonUnavailable, markNeonDown, neonMarkedDown, publicDataMode } from "./mode";

const READS = new Set(["findMany", "findFirst", "findUnique", "count", "aggregate", "groupBy"]);

const logged = new Set<string>();
function logOnce(key: string, message: string) {
  if (logged.has(key) || logged.size > 500) return;
  logged.add(key);
  console.warn(message);
}

/** Answer from the files, or return NOT_SERVED when the files cannot answer exactly. */
const NOT_SERVED = Symbol("not-served");
function fromFiles(model: ModelName, operation: string, args: unknown): unknown {
  try {
    return runPublicQuery(publicDataSource(), model, operation, args as Record<string, unknown> | undefined);
  } catch (err) {
    const e = err as { publicDataUnsupported?: boolean; publicDataUnavailable?: boolean; message?: string };
    if (e.publicDataUnsupported) {
      logOnce(`${model}.${operation}:${e.message}`, `[public-data:unsupported] ${model}.${operation} → Neon. ${e.message}`);
      return NOT_SERVED;
    }
    if (e.publicDataUnavailable) {
      logOnce(`unavailable:${e.message}`, `[public-data:unavailable] ${e.message} → Neon.`);
      return NOT_SERVED;
    }
    throw err;
  }
}

export async function routeQuery<T>(
  model: string | undefined,
  operation: string,
  args: unknown,
  query: (args: unknown) => Promise<T>,
): Promise<T> {
  const mode = publicDataMode();
  if (mode === "db" || !model || !isPublicModel(model) || !READS.has(operation)) return query(args);

  const neonFirst = mode === "fallback" ? !neonMarkedDown() : inLiveScope();
  if (!neonFirst) {
    const served = fromFiles(model, operation, args);
    if (served !== NOT_SERVED) return served as T;
    return query(args);
  }
  try {
    return await query(args);
  } catch (err) {
    if (!isNeonUnavailable(err)) throw err;
    markNeonDown();
    logOnce(`down:${Math.floor(Date.now() / 60_000)}`, `[public-data:fallback] Neon unavailable (${(err as Error).message?.slice(0, 160)}); serving public reads from files.`);
    const served = fromFiles(model, operation, args);
    if (served === NOT_SERVED) throw err;
    return served as T;
  }
}

/**
 * A read the engine cannot intercept (a `$queryRaw` over public tables), given
 * both ways: `fromFilesImpl` computes it from the files with publicRead(), and
 * `fromNeon` is the original SQL. Routed exactly like a Prisma read: in "files"
 * mode the files answer and Neon is asked only if they cannot; in "fallback"
 * mode (and in a live scope) Neon answers unless it is unavailable.
 */
export async function routeRaw<T>(fromFilesImpl: () => T, fromNeon: () => Promise<T>): Promise<T> {
  const mode = publicDataMode();
  if (mode === "db") return fromNeon();
  const viaFiles = (): T | typeof NOT_SERVED => {
    try {
      return fromFilesImpl();
    } catch (err) {
      const e = err as { publicDataUnsupported?: boolean; publicDataUnavailable?: boolean; message?: string };
      if (e.publicDataUnsupported || e.publicDataUnavailable) {
        logOnce(`raw:${e.message}`, `[public-data:unsupported] raw read → Neon. ${e.message}`);
        return NOT_SERVED;
      }
      throw err;
    }
  };
  const neonFirst = mode === "fallback" ? !neonMarkedDown() : inLiveScope();
  if (!neonFirst) {
    const served = viaFiles();
    return served === NOT_SERVED ? fromNeon() : served;
  }
  try {
    return await fromNeon();
  } catch (err) {
    if (!isNeonUnavailable(err)) throw err;
    markNeonDown();
    const served = viaFiles();
    if (served === NOT_SERVED) throw err;
    return served;
  }
}

/** A synchronous read against the files, for routeRaw implementations. Throws when it cannot answer. */
export function publicRead<T>(model: ModelName, operation: string, args?: Record<string, unknown>): T {
  return runPublicQuery(publicDataSource(), model, operation, args) as T;
}
