import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { CONTACT_EMAIL } from "@/lib/site";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().min(1, "Please enter your name").max(120),
  email: z.string().email("Enter a valid email"),
  subject: z.string().max(160).optional(),
  message: z.string().min(5, "Your message is a little short").max(5000),
  // Honeypot — bots fill hidden fields; humans don't.
  website: z.string().optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { name, email, subject, message, website } = parsed.data;

  // Drop obvious spam (honeypot filled).
  if (website) return NextResponse.json({ ok: true });

  // 1) Always persist — feedback is never lost even if email fails.
  await prisma.contactMessage.create({
    data: { name, email, subject: subject || null, message },
  });

  // 2) Best-effort email forward via Formsubmit (no API key required).
  try {
    await fetch(`https://formsubmit.co/ajax/${CONTACT_EMAIL}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        name,
        email,
        subject: subject || "RiftCompare feedback",
        message,
        _subject: `RiftCompare feedback from ${name}`,
        _template: "table",
        _replyto: email,
      }),
    });
  } catch {
    // ignore — it's already saved in the database
  }

  return NextResponse.json({ ok: true });
}
