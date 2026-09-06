# Why `claude/*` branches don't get a Vercel deployment

## The problem

Every automated change landed as the **same commit on two refs** — pushed to its
`claude/<name>` working branch, then to `main`. Vercel deployed both: a Preview
for the branch and Production for `main`. Two full builds of byte-identical
source, every time.

Preview was the *more* expensive of the two. `package.json`'s build command runs
an extra step when `VERCEL_ENV === "preview"`:

```
IMPORT_ONLY_COUNTRY=SG EBAY_REFRESH=false tsx scripts/import-prices.ts
```

— a live scrape of every tracked Singapore store, to populate the preview
database. Useful when a human is actually going to open the preview URL. Pure
waste when the branch exists only to be merged seconds later.

## The fix

`vercel.json`:

```json
"git": { "deploymentEnabled": { "claude/*": false, "claude/**": false } }
```

`deploymentEnabled` takes [minimatch](https://github.com/isaacs/minimatch)
patterns, so this disables automatic deployments for every automation branch.
Both patterns are listed because minimatch's `*` does not cross a `/`: `claude/*`
covers `claude/my-branch`, `claude/**` also covers a nested
`claude/feature/thing`. Both are `false`, and Vercel's "at least one `true` wins"
rule only applies when rules disagree, so listing both is safe.

**No deployment is created at all** — this is not a build that starts and exits
early, so it costs nothing rather than a little. That is why this is preferred
over `ignoreCommand`, which would also have worked but has an invertible
exit-code contract (exit 0 = skip) that, written backwards, disables
**production** builds.

`main` is untouched and still deploys Production on every push.

## What this gives up

**Preview URLs for `claude/*` branches, including from a pull request.** If you
ever want to eyeball one of these branches on a real deploy before merging,
remove the rule, push, and re-add it — or open the PR from a branch not named
`claude/*`.

**It also removed a gate, which is why `seo-preview-gate.yml` changed.** That
workflow ran the live-crawl SEO instruments (`template-seo-check.ts`, which
blocks on a missing canonical / OpenGraph / structured data, and
`content-quality.ts`, report-only) against the Vercel preview, and it was
conditioned on `deployment.environment == 'Preview'`. No preview, no gate — the
check would have disappeared silently, which is the worst way to lose one.

It now runs on **Production deployments as well**. The run count is unchanged
(one per commit either way), so this costs no extra Actions minutes; what changes
is that a failure now means "production regressed" rather than "this preview
would have regressed". That is a fair description of what the check was actually
worth here anyway: nothing enforced the preview gate before a push to `main`, so
it was never blocking.

## If you want the pre-merge gate back

Stop pushing the same commit to two refs — land work on `main` through a PR from
a non-`claude/*` branch, and the Preview build, its preview URL and the
pre-merge SEO gate all come back, at the cost of the second build this document
exists to remove.
