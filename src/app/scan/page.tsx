import type { Metadata } from "next";
import { CardScanner } from "@/components/CardScanner";

export const metadata: Metadata = {
  title: "Card Scanner (Beta) — RiftCompare",
  description: "Scan a Riftbound card with your camera to instantly find it and compare prices.",
  alternates: { canonical: "/scan" },
};

export default function ScanPage() {
  return <CardScanner />;
}
