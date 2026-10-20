import { InlineSignupPrompt } from "./InlineSignupPrompt";
import { FREE_WATCHLIST_LIMIT } from "@/lib/free-limits";

// The card page's free-account prompt: signed-out visitors only, in the page,
// never a popup (InlineSignupPrompt). Added when new accounts had halved after
// the sign-up popup went (owner: no one has signed up for Premium recently).
export function CardSignupPrompt({ cardName, className }: { cardName: string; className?: string }) {
  return (
    <InlineSignupPrompt
      surface="inline_card"
      title={`Get an email when ${cardName} gets cheaper`}
      body={`A free account watches up to ${FREE_WATCHLIST_LIMIT} cards and emails you when one drops in price at a store we track. One tap with Google or Discord.`}
      className={className}
    />
  );
}
