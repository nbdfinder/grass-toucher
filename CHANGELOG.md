# Changelog

## 1.2.1 — 2026-08-04

- Newly-spawned dandelion seeds now take 2–7 minutes (was as little as 5
  seconds) before they start growing. A mowed lawn was appearing to
  "regrow instantly" — really, several already-puffed survivors were
  finishing their independent blow cycle within the first minute and
  their children had almost no dormancy, so new sprouts showed up right
  behind the mower. This was never mowing spawning anything (cutting
  still always just kills, no spread) — the fix is entirely in how long a
  new seed waits before it's visible.

## 1.2.0 — 2026-08-04

- Grass now takes 10 minutes to regrow from a buzz cut while the popup is
  open (was ~4), and 1 hour while closed (was ~42 min) — dandelion growth
  stays locked at exactly 2x that rate, so it scales along with it.
- Simplified the "neglected lawn" dandelion logic: removed the real-time
  absence-tracking ramp entirely. Instead, a fresh install now starts with
  the lawn already fully populated (24 dandelions at a believable mix of
  ages/stages) — after that, population is left to the ordinary
  grow/spread/get-mowed cycle.

## 1.1.1 — 2026-08-03

- Moved the ☕ button out of the bottom-right corner (top-right, next to the
  sound toggle instead) — it was sitting on top of mowable grass.

## 1.1.0 — 2026-07-29

- Neglected lawns now fill with dandelions the way a real one would: absence
  is tracked separately from the (much slower) per-plant lifecycle sim, so a
  lawn left alone for 90+ minutes is a full infestation by the time you
  reopen it, not just taller grass. Ramps in starting around 15 minutes away.
- Added a small ☕ link in the popup (bottom-right, subtle) and in the store
  listing, for anyone who wants to buy me a coffee.
- Removed a duplicated opening line in the store description.

## 1.0.0 — 2026-07-15

- Initial release.
