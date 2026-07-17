// Idempotent marketplace seed, run on every production deploy (see package.json
// build script, after `prisma db push`). It:
//   1. Flags the owner's account as a verified seller.
//   2. Ensures the owner has a SellerProfile with the $10 flat AU shipping interim
//      (dynamic carrier-rate shipping comes later — see docs/MARKETPLACE.md).
//   3. Ensures a test BUYER account exists for trying the (test-mode) buy flow.
// Safe to run repeatedly — it only updates/creates, never deletes.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // 1) Verified seller — the owner's account (by email or display name).
  const verified = await prisma.user.updateMany({
    where: { OR: [{ email: "mastermisclick@gmail.com" }, { displayName: "Specifix" }] },
    data: { isVerifiedSeller: true },
  });
  console.log(`Verified seller: flagged ${verified.count} account(s).`);

  // Mark the owner's shop as the official store (ranks first), creating the
  // SellerProfile if it doesn't exist yet, and — as an interim, AU-only measure —
  // charge a flat $10 AUD shipping on the owner's own listings.
  const owner = await prisma.user.findFirst({
    where: { OR: [{ email: "mastermisclick@gmail.com" }, { displayName: "Specifix" }] },
    select: { id: true, displayName: true },
  });
  if (owner) {
    const existingProfile = await prisma.sellerProfile.findUnique({ where: { userId: owner.id } });
    if (existingProfile) {
      await prisma.sellerProfile.update({
        where: { userId: owner.id },
        data: { isOfficial: true },
      });
      console.log("Official store: flagged the owner's shop.");
    } else {
      await prisma.sellerProfile.create({
        data: {
          userId: owner.id,
          shopName: owner.displayName || "Specifix",
          country: "AU",
          currency: "AUD",
          shippingFlatCents: 1000, // $10.00 flat AU shipping (interim — dynamic rates later)
          shippingNote: "Tracked shipping within Australia, $10 flat.",
          isOfficial: true,
        },
      });
      console.log("Seller profile: created for the owner (AU, $10 flat shipping).");
    }
  }

  // 2) Test buyer account (test@test.com / testing1234) with demo wallet funds so the
  //    marketplace buy flow can be tried end-to-end before real payments are live.
  const email = "test@test.com";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    await prisma.user.create({
      data: {
        email,
        displayName: "Test Buyer",
        passwordHash: await bcrypt.hash("testing1234", 10),
        emailVerified: new Date(),
        balanceCents: 100_000, // $1,000 demo wallet for testing
      },
    });
    console.log("Test buyer: created test@test.com with a $1,000 demo wallet.");
  } else {
    // Keep it usable: ensure it's verified + has demo funds, refresh the password.
    await prisma.user.update({
      where: { email },
      data: {
        passwordHash: await bcrypt.hash("testing1234", 10),
        emailVerified: existing.emailVerified ?? new Date(),
        balanceCents: existing.balanceCents < 10_000 ? 100_000 : existing.balanceCents,
      },
    });
    console.log("Test buyer: refreshed test@test.com.");
  }
}

main()
  .catch((e) => {
    console.error("marketplace-seed failed:", e);
    // Never fail the deploy build over the seed.
    process.exit(0);
  })
  .finally(() => prisma.$disconnect());
