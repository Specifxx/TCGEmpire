import { onePer, onePerText, perBox, PULL_TIERS, SETS_WITH_ULTIMATE, type SetTally } from "@/lib/pull-rates";

// The community pull-rate table (lib/pull-rates.ts): members' packs beside Riot's own figure, one row per
// tier. Server-rendered (no client code): an unpublished set shows Riot's column only.
export function PullRateTable({ code, tally, officialOnly = false }: { code: string; tally: SetTally | undefined; officialOnly?: boolean }) {
  const published = !!tally?.published;
  const tiers = PULL_TIERS.filter((t) => t.key !== "ultimate" || SETS_WITH_ULTIMATE.includes(code));
  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-white/10">
      <table className="w-full min-w-[20rem] text-left text-sm">
        <thead className="bg-ink-900 text-[11px] uppercase tracking-wide text-slate-400">
          <tr>
            <th scope="col" className="px-3 py-2">Pull</th>
            {!officialOnly && <th scope="col" className="px-3 py-2">Members&apos; packs</th>}
            {!officialOnly && <th scope="col" className="hidden px-3 py-2 sm:table-cell">Per box</th>}
            <th scope="col" className="px-3 py-2">Riot says</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {tiers.map((t) => {
            const hits = tally?.tiers[t.key] ?? 0;
            const n = published ? onePer(tally!.packs, hits) : null;
            return (
              <tr key={t.key}>
                <th scope="row" className="px-3 py-2 font-semibold text-slate-100">{t.label}</th>
                {!officialOnly && <td className="px-3 py-2 text-white num">
                  {published ? (
                    <>
                      {onePerText(n)}
                      <span className="block text-[11px] text-slate-500">{hits} pulled</span>
                    </>
                  ) : (
                    <span className="text-slate-500" title="Not enough packs logged yet">–</span>
                  )}
                </td>}
                {!officialOnly && <td className="hidden px-3 py-2 text-slate-300 num sm:table-cell">{published ? perBox(tally!.packs, hits).toFixed(1) : "–"}</td>}
                <td className="px-3 py-2 text-slate-300 num">{t.official ? onePerText(t.official) : "not published"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
