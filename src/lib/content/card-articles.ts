// Published articles that actually mention a card, its champion or its set —
// matched on titles, tags and body text, never inferred.
import { getArticles, type Article } from "../articles";

export interface CardArticleQuery {
  cardName: string;
  champion: string | null;
  setName: string;
}

export interface MentioningArticle {
  slug: string;
  category: Article["category"];
  title: string;
  reason: string;
}

const has = (hay: string, needle: string) => needle.length >= 3 && hay.toLowerCase().includes(needle.toLowerCase());

export function articlesMentioning(q: CardArticleQuery, limit = 3, articles = getArticles()): MentioningArticle[] {
  const scored = articles
    .map((a) => {
      const head = `${a.title} ${a.tags.join(" ")}`;
      let score = 0;
      let reason = "";
      if (has(head, q.cardName) || has(a.body, q.cardName)) {
        score += has(head, q.cardName) ? 6 : 4;
        reason = `Mentions ${q.cardName}`;
      }
      if (q.champion && (has(head, q.champion) || has(a.body, q.champion))) {
        score += has(head, q.champion) ? 3 : 1;
        reason ||= has(head, q.champion) ? `About ${q.champion}` : `Mentions ${q.champion}`;
      }
      if (has(head, q.setName)) {
        score += 1;
        reason ||= `Covers ${q.setName}`;
      }
      return { a, score, reason };
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score || (x.a.date < y.a.date ? 1 : -1));
  return scored.slice(0, limit).map(({ a, reason }) => ({ slug: a.slug, category: a.category, title: a.title, reason }));
}
