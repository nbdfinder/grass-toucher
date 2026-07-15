# Grass Toucher — Chrome Web Store listing kit

Everything below maps to a field in the Chrome Web Store developer console.
Copy-paste as you go.

---

## Store listing tab

**Name** (from manifest)

> Grass Toucher

**Summary** (from manifest description, shows under the name in search)

> Finally, a way to touch grass without going outside. An oddly satisfying
> pocket lawn that grows shaggier the longer you browse.

**Category:** Fun
**Language:** English

**Description** (the long field — paste exactly, emoji included):

```
Finally, a way to touch grass without going outside.

Let's be honest with each other: you were not going to go outside today. The outside has weather, insects, and other people. But everyone keeps telling you to touch grass, and technically, nobody ever specified which grass.

Grass Toucher puts a small, quietly judgmental lawn in your browser toolbar. It is soft. It is green. It is always there for you, unlike the sun.

WHAT YOU'LL BE DOING INSTEAD OF GOING OUTSIDE

🌱 Brush the grass. Run your cursor through it and watch the blades part, bend, and spring back with a satisfying little rustle. We both know "oddly satisfying" is basically your entire personality now.

✂️ Mow the lawn. Hold and drag to cut the grass exactly where you touch — high for a tasteful trim, low for a buzz cut, or carve your initials into it, because absolutely no one can stop you. It grows back. It always grows back.

🌼 Fight the dandelions. Leave one alone long enough and it goes to seed, and suddenly there are more. Mow them down before they spread — or click a puff and blow the seeds everywhere yourself, you agent of chaos.

⏱️ Be witnessed. Your toolbar icon grows shaggier the longer you browse: fresh cut, getting long, shaggy, full jungle. Anyone glancing at your screen can now diagnose your habits from across the room. Mow the lawn and all is forgiven.

🌙 Watch time pass. The sun rises and sets over your lawn on your actual local schedule — which, let's face it, may be the only sunrise you catch this week. At night there are stars, fireflies, and the moon in its genuine current phase. Sometimes a bee stops by. The bee has places to be. Be more like the bee.

💾 Live with your choices. Your lawn is persistent. The grass keeps growing while you work, and the dandelions keep scheming. Ignore them all afternoon and you'll reopen to an invasion that is, legally speaking, your fault.

Every time you mow, a little message congratulates you. It is not sincere. It knows exactly how long you've been online today.

PRIVACY

No account. No sign-up. Nothing ever leaves your machine. We have no idea who you are, and frankly, we'd like to keep it that way.

Now go touch some grass. Either kind.
```

**Graphic assets:**

| Store field | File in this folder |
|---|---|
| Store icon (128×128) | `../icons/icon128.png` |
| Screenshots (1280×800, up to 5) | `screenshot-day.png`, `screenshot-mowed.png`, `screenshot-sunset.png`, `screenshot-night.png`, `screenshot-dawn.png` |
| Small promo tile (440×280) | `promo-tile-440x280.png` |
| Marquee (1400×560, optional) | skip for now |

Suggested screenshot order: day → mowed → night → sunset → dawn
(lead with the prettiest, show the mechanic second).

---

## Privacy tab

**Single purpose description:**

> Grass Toucher provides an interactive grass-simulation toy in the browser
> toolbar popup. Its icon reflects time spent actively browsing since the
> lawn was last "mowed."

**Permission justifications:**

- `storage` — Saves the state of the lawn (blade heights, dandelion
  lifecycle), the mow counter, and the sound on/off preference locally on
  the user's device. Nothing is transmitted anywhere.
- `alarms` — A once-per-minute alarm counts active browsing minutes so the
  toolbar icon can grow "shaggier" over time.
- `idle` — Detects when the user is away from the computer so idle time
  does not count toward the icon's growth.

**Remote code:** No, this extension does not use remote code.
(Everything ships in the package; no CDNs, no eval, no external requests.)

**Data usage:** check NONE of the data-type boxes — the extension collects
no user data. Then certify the three disclosure statements (no sale of
data, no unrelated use, no creditworthiness use) — all true here.

**Privacy policy URL:** likely optional since no data is collected. If the
form requires one, publish the text below at e.g.
`https://tyleredic.com/grass-toucher-privacy` and paste that URL.

```
Grass Toucher — Privacy Policy

Grass Toucher does not collect, store, transmit, or sell any user data.

The extension keeps a small amount of information on your own device using
Chrome's local storage: the state of your virtual lawn, a count of minutes
you've been actively browsing (used only to draw the toolbar icon), and your
sound on/off preference. This information never leaves your computer, is not
transmitted anywhere, and is deleted if you uninstall the extension.

The extension makes no network requests, uses no analytics, requires no
account, and contains no third-party code or services.

Questions: tyleredic@gmail.com
```

---

## Distribution tab

- **Visibility:** Public
- **Regions:** All regions
- **Pricing:** Free
