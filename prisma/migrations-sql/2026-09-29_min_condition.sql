-- 2026-09-29: minimum condition for Best Basket and the deck price watch.
-- ADDITIVE ONLY: two nullable columns, no default, no change to existing rows
-- (a null DeckWatch.minCondition means "any condition", exactly what every
-- watch saved before this did). This repo applies schema with `prisma db push`
-- (scripts/build-db-push.sh on each production build); this file is the
-- reviewed DDL that push produces.

-- AlterTable
ALTER TABLE "DeckWatch" ADD COLUMN "minCondition" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "basketPrefs" JSONB;
