# Portfolio handoff — Grass Toucher project card

Add a new project card to the "I ship my own products, too" section of
tyleredic.com/projects, matching the existing card component (NBD Finder,
Hubba Hideout): preview image on top, name + type badge, italic tagline,
short description, tag pills, and a "Visit →" link.

## Card content

**Name:** Grass Toucher

**Type badge (top-right, style like "WEB APP · SOLO BUILD"):**
CHROME EXTENSION · SOLO BUILD

**Tagline (italic, in quotes):**
"Finally, a way to touch grass without going outside."

**Description:**
A meme Chrome extension: an oddly satisfying, physics-based lawn that lives
in your browser toolbar. Brush it, mow it exactly where you touch, and fight
back the spreading dandelions — while the toolbar icon grows shaggier the
longer you browse and a sarcastic narrator judges your screen time. Real-time
sky with accurate moon phases, fully generative sound, zero dependencies,
zero data collected — 30 KB, designed and built end to end.

**Tag pills (3):**
Chrome extension · Canvas physics · Generative audio

**Link ("Visit Grass Toucher →"):**
https://chromewebstore.google.com/detail/ejhmjbgghkjfhgcffinnmodkcfnlpjja

Note: the extension is currently in Chrome Web Store review (submitted
July 14, 2026). That URL is the permanent listing address and will go live
when review completes — fine to publish the card now, or hold until the
link resolves, whichever fits the workflow.

## Image assets

All in this folder, 1280×800 PNG — crop to the card's aspect ratio as needed:

- `screenshot-day.png` — sunny lawn with dandelions (most on-brand green)
- `screenshot-night.png` — moon, stars, fireflies (matches the darker art of
  the existing cards)
- `screenshot-mowed.png` — shows the core mowing mechanic
- `promo-tile-440x280.png` — has the wordmark baked in, if a titled image fits better

Suggested: day or night for the card image; alt text
"Grass Toucher — an interactive grass simulation in a Chrome extension popup."

## Facts (if needed anywhere)

- Shipped: July 2026, v1.0.0
- Stack: vanilla JavaScript, Canvas 2D, Web Audio (all sound synthesized at
  runtime), Chrome Manifest V3 — no frameworks, no build step, no backend
- Package size: 30 KB; permissions: storage, alarms, idle only; collects no data
- Privacy policy page (separate task, may already exist):
  https://tyleredic.com/grass-toucher-privacy
