import Link from "next/link";
import { COMMUNITY_RESOURCES, CATEGORY_ORDER } from "@/lib/content/community";
import { CommunityLink } from "@/components/CommunityLink";

// Homepage teaser for /community — one representative resource per category
// (in CATEGORY_ORDER), same "further reading" spot as LatestPosts' blog/guides
// rows just underneath. Renders nothing if the directory is ever emptied out.
export function CommunityTeaser() {
  const highlights = CATEGORY_ORDER.map((c) => COMMUNITY_RESOURCES.find((r) => r.category === c)).filter(
    (r): r is NonNullable<typeof r> => r != null,
  );
  if (highlights.length === 0) return null;

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-white">From the wider community</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            News, wikis, deck builders, tier lists and video from the sites Riftbound players actually use.
          </p>
        </div>
        <Link href="/community" className="btn-ghost hidden text-xs sm:inline-flex">
          See all community links →
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {highlights.map((r) => (
          <CommunityLink key={r.url} resource={r} />
        ))}
      </div>

      <Link href="/community" className="btn-ghost mt-3 inline-flex text-xs sm:hidden">
        See all community links →
      </Link>
    </section>
  );
}
