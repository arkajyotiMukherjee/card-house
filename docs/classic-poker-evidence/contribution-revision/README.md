# Remaining-stack amounts and legible betting captions

The betting composer now displays **chips added now**, rather than the raise-to street total. In the reproduced case, the player has posted a 5-chip small blind and has 395 left. The value and slider maximum show 395. Confirm spends those 395; the server retains the correct 400-chip contribution including the blind already in the pot.

The preview uses all denomination groups instead of discarding smaller chips: 395 is three black 100s, three green 25s and two blue 10s. Tall stacks remain bounded as a visual illustration for very large amounts.

“Add chips” and “Bet chips” use a brighter 17px block font, with a taller amount panel separating the caption and number. Leave Table now has the same gold outline as other brown actions. Slider handles no longer overlap endpoint text.

## Screenshots

- [Desktop: 395 remaining, Add chips 395, 395 All-in endpoint, matching preview and gold Leave Table border](14-no-limit-slider-desktop.png).
- [Phone: the same player acting with 395](mobile-acting/14-no-limit-slider-mobile.png).

## Verification

- [Desktop acting with an independent phone opponent](edge-proof.json).
- [Phone acting with an independent desktop opponent](mobile-acting/edge-proof.json).
- Both running-app proofs open the real Raise composer, reach the full stack, inspect the displayed value/caption/preview, confirm through the UI, and assert the authoritative stack reaches zero with 400 committed including the posted blind. They continue through called all-in runout, Oklahoma discards, top-up feedback/resumption, a fold win and safe exit.
- Client regressions cover small/big blind offsets, a fresh-street bet, preview denomination sums and the server intent retaining raise-to semantics. All 528 client tests pass (one optional live test skipped).
- [Tests](tests.txt), [typecheck](typecheck.txt), [lint](lint.txt), [build](build.txt), [desktop browser log](browser.txt), [phone browser log](mobile-browser.txt).

Local Vite/SpacetimeDB only. Phone checks use Chromium touch emulation, not physical iPhone Safari. No PR, merge or hosted deployment.
