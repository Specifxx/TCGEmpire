// Race-safe sequential numbers for anything that needs an official, human-facing
// identifier (marketplace order numbers, support tickets). Backed by the `Counter`
// table (see prisma/schema.prisma) rather than a Postgres SEQUENCE, because this
// repo pushes schema additively via `prisma db push` with no raw-DDL migration
// channel to create one.
//
// Each key's row is seeded lazily on first use via `upsert`, then incremented with
// a single `$queryRaw` UPDATE ... RETURNING inside the caller's transaction — that
// statement is atomic in Postgres, so two concurrent requests can never be handed
// the same number.
import { prisma } from "./db";

// Starting values leave obvious headroom below the first real number, and keep
// order numbers and ticket numbers visually distinct at a glance.
const SEED: Record<string, number> = {
  orders: 100_000,
  support: 10_000,
};

// A minimal structural type covering just what this function calls — deliberately
// NOT `PrismaClient | Prisma.TransactionClient`: lib/db.ts's `prisma` is a
// `$extends()`-wrapped client (for the egress guard), whose real type doesn't
// match the plain generated types, including inside a `$transaction` callback.
// Both the top-level client and any transaction client passed in satisfy this
// shape structurally.
type Client = {
  counter: {
    upsert(args: { where: { key: string }; create: { key: string; value: number }; update: Record<string, never> }): Promise<unknown>;
  };
  $queryRaw<T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T>;
};

// Returns the NEXT value for `key` (i.e. already incremented) — display it as
// `RC-${n}`. Pass the transaction client when calling this inside a `$transaction`
// so the number is only committed if the surrounding write succeeds.
export async function nextNumber(key: keyof typeof SEED, client: Client = prisma): Promise<number> {
  // Idempotent seed — a plain `create` would throw on the (extremely likely) case
  // that another request already seeded this key first.
  await client.counter.upsert({
    where: { key },
    create: { key, value: SEED[key] },
    update: {},
  });
  const rows = await client.$queryRaw<{ value: number }[]>`
    UPDATE "Counter" SET value = value + 1 WHERE key = ${key} RETURNING value
  `;
  return rows[0]!.value;
}

// Display helper — keeps the "RC-" prefix in one place.
export function formatOrderNumber(n: number | null | undefined): string | null {
  return n == null ? null : `RC-${n}`;
}
