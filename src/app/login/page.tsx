import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getCurrentUser } from "@/lib/auth";

function safe(next?: string): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/forum";
}

export default async function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  const user = await getCurrentUser();
  if (user) redirect(safe(searchParams.next));
  return <AuthForm mode="login" />;
}
