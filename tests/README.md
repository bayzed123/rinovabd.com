# Behaviour suites

These run the real Worker against a throwaway local database and check what a customer or the
shop owner would actually see. Until they were wired in, CI ran `tsc` and nothing else: checkout
pricing, the offer engine, stock, and the order lookup could all break and still ship.

```bash
pnpm test                      # everything (needs Chromium)
pnpm test:api                  # only the suites that need no browser
node tests/run.mjs security    # one suite
node tests/run.mjs --keep      # leave the Worker up afterwards to poke at it
```

The runner applies migrations, boots `wrangler dev --local`, runs each suite against it, and
exits non-zero if any check fails. Nothing needs to be running first.

## Writing a check

Assert what a person would notice, and make it fail if the behaviour is absent. Two habits are
worth keeping, because both caught real bugs that a looser check waved through:

- **Measure the thing, not a proxy.** The image viewer check reads the *first painted frame*, so
  an implementation with no animation cannot pass it. An earlier version only checked the
  settled position and passed while the feature was missing.
- **Prove a control is usable, not merely present.** `elementFromPoint` at a button's own centre
  catches a button that is on screen but painted underneath something else — which is exactly how
  the bag's checkout button and the image viewer's close button were broken.

## Fixtures

A fresh database has no coupons, no priced sizes and no orders. `fixtures.mjs` seeds what a
suite asserts on; call it at the top of the suite rather than relying on data another suite left
behind. Suites run in alphabetical order and share one database, so anything you depend on, seed
yourself.

## Configuration

| variable | default | meaning |
|---|---|---|
| `RINOVA_TEST_PORT` | `8899` | port for the test Worker |
| `RINOVA_TEST_ADMIN_USERNAME` | `Rinova` | dashboard login the suites use |
| `RINOVA_TEST_ADMIN_PASSWORD` | `AdminRinova` | its password |
| `RINOVA_TEST_CHROMIUM` | Playwright's own | path to a Chromium binary |
| `RINOVA_TEST_ARTIFACTS` | `tests/artifacts` | where screenshots are written |

`worker/.dev.vars` holds the dashboard login for local development and is gitignored. The runner
writes a throwaway one only when the file is missing, so it never overwrites yours.
