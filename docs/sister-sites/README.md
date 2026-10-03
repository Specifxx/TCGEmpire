# Sister sites

How to build a price-comparison site for another trading card game from
RiftCompare, with OP Compare (opcompare.app, `Specifxx/OpCompare`, built
2026-10-03) as the worked example.

**Start with [PLAYBOOK.md](PLAYBOOK.md).**

**What this folder is, and is not.**

- **TCGEmpire itself was not changed by the OP Compare build.** All of OP
  Compare's code is in `Specifxx/OpCompare`. The session only read this repo;
  its branch `claude/tender-noether-2na98p` was pushed while equal to
  `origin/main` (`cda650c`), and `git diff origin/main` was empty at 13:15 UTC
  on 2026-10-03. This folder is the only addition, and it is documentation.
- **The playbook is guidance, not code that runs.** Nothing in this folder is
  imported by the site, run by a workflow, or checked by `npm test`,
  `npm run typecheck` or `npm run lint`
  ([details](store-discovery/README.md#effect-on-this-repos-checks)). The
  `store-discovery/` scripts run only when a person runs them by hand, and
  they only read public store pages.
- Facts are as of 2026-10-03: OP Compare at `d71528b`, TCGEmpire at
  `cda650c`. Re-check paths and numbers against the live repos before relying
  on them.

| File | What it is |
|---|---|
| [PLAYBOOK.md](PLAYBOOK.md) | The step-by-step playbook: questions to ask the owner first, what to copy and what to re-derive, the build in order with a check per stage, the per-game checklist and TCGCSV findings, credentials, pitfalls, and the hand-over checklist. |
| [OP-COMPARE-BUILD-LOG.md](OP-COMPARE-BUILD-LOG.md) | The timestamped record of the OP Compare build: every owner request, phases, commits, problems and fixes, metrics. The evidence behind the playbook. |
| [PROMPTS.md](PROMPTS.md) | Reusable prompts: the store-search, correctness-review and Premium-mapping agent prompts, the Claude in Chrome setup template, QA prompts, the launch post and its hyphen check. |
| [store-discovery/](store-discovery/README.md) | Dependency-free Node scripts (detect Shopify, probe collections, verify stores) plus a per-game config, for finding a new game's stores. |
