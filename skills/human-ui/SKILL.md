---
name: human-ui
description: Design rules for UI and web pages that don't look AI-generated. Load BEFORE building or restyling any landing page, marketing site, dashboard, app screen, component, or HTML/CSS/Tailwind/React/Vue/Svelte UI. Also use when asked to make a site "look less AI", "less generic", "less vibe-coded", or to review a UI for AI tells.
---

<!-- slop-lint-disable-file: this guide quotes the tells on purpose -->

# Human UI

AI-built pages are clean, competent, and interchangeable. Each default below is reasonable alone; stacked together, they read as "nobody made a decision here." The fix is **deliberate choices**: one accent, real content, layouts that follow the content.

## Before you build

Decide and write down (in a comment or the PR) before writing markup:
1. **One accent color** and the neutral scale. Everything else is neutral.
2. **One or two typefaces.** Why these.
3. **What real assets exist**: product screenshots, photos, logos, real quotes, real numbers with sources. If none exist, leave visible TODO slots for the human, not fabricated stand-ins.
4. **The layout of each section from its content.** Three items with different weights are not three equal cards.

## Tells to avoid

| Tell | What it looks like | Do instead |
|---|---|---|
| **Gradient headline** | `bg-clip-text text-transparent bg-gradient-to-r from-purple-… to-blue-…`, often animated | Headline in one flat color. Save contrast for clickable things. |
| **Purple/indigo gradients** | Purple→blue on H1s, buttons, backgrounds | Your one accent, flat. Gradient only with a reason. |
| **Neon on dark** | Dark bg with 4+ high-chroma accents, none dominant | Dark mode is fine. One accent, used sparingly. |
| **Aurora glow** | Big blurred `rounded-full` blobs, radial glows behind the hero, neon `box-shadow: 0 0 40px` | Remove. If depth is needed, use a real image or plain elevation. |
| **Eyebrow labels** | Tiny `uppercase tracking-widest text-xs` label (or pill chip) above every headline | Drop it. If the word matters, put it in the headline. |
| **Italic serif hero** | Oversized italic Playfair Display / Instrument Serif hero | Only if it's the brand. Default to a good sans; max two families. |
| **Cards in cards** | Every group wrapped in a card, cards inside cards | Use whitespace and type hierarchy to group. Cards for things that are actually objects (a product, a post). |
| **Identical card grids** | 3×2 grid of same-size white cards: icon chip, bold label, grey paragraph | Vary layout section to section. Lead with the most important item; let sizes differ. |
| **Rainbow side tabs** | Colored `border-l-4` on every card, different color each | None, or one neutral accent across the system. |
| **Status dots everywhere** | Little colored (often pulsing) dots on things that have no live status | Dots only for real live state. Otherwise a text label. |
| **Emoji as icons** | 🚀 ⚡ ✨ in nav, feature lists, headings | A consistent icon set, or no icons. |
| **Decorative numbering** | "01 / 02 / 03" on steps already in order, under "Three steps" | Verb-led step labels: "Upload", "Preview", "Publish". |
| **No real images** | Colored squares with initials instead of founder photos; text where a screenshot belongs | At least one real image on every page that matters: product screenshot, photo, face. No asset → page isn't done; leave a clear slot. |
| **Fake social proof** | Unsourced stats bar ("10k+ users", "99.9% uptime"); testimonials signed "Sarah K." with initial avatars | Only numbers you can source. Testimonials need full name, role, face, or cut them. |
| **Em dashes in UI copy** | "Get started — it's free" on buttons, dashes between prices | Plain words, hyphen, colon, or two short sentences. |
| **Generic copy** | "Unlock the power of…", "Seamlessly…", "Elevate your workflow", "Built for the future" | Say what the product does, for whom, with one concrete detail. Apply the `human-writing` skill to all copy. |

## More tells (Impeccable, Hallmark, Utsubo, design-slop study)

**Type**
- Inter / Geist / Roboto for everything, no pairing. → A deliberate display face plus a body face.
- Flat hierarchy: headings and body too close in size/weight. Crushed (negative) letter-spacing on display text. All-caps paragraphs.
- One accent-colored word in the hero headline ("Ship **faster**"). → One color; emphasize with weight or size.
- Pill badge directly above the H1 ("✨ New: AI agents"). → Drop it.

**Surfaces**
- Glassmorphism everywhere (`backdrop-blur` on every card). → Only where blur shows real content behind.
- "Ghost card": hairline border *and* a wide soft shadow. → One or the other.
- Extreme corner radius (32px+) squeezing content.
- Decorative grid-line or repeating-stripe backgrounds; floating orbs/3D blobs; plastic AI illustrations or shape-only "scene" SVGs. → Real imagery or nothing.
- Pure `#000` / `#fff` surfaces with no tint; or the reverse, a default cream/beige palette. → Tint neutrals toward your accent, on purpose.
- Hard offset neobrutalist shadows as a default.

**Layout**
- Full-viewport (`min-h-screen`), fully centered hero with one short line and a big CTA. Centered *everything*. → Size to content; left-align most sections.
- Icon tile (rounded square with an icon) stacked above every feature heading. → Vary placement or drop icons.
- Monotonous spacing: every section `py-24`, every gap identical. → Rhythm follows content weight.
- Hero metric layout: giant "10M+" with tiny label and a row of supporting stats.
- Generic "AI nav" (logo left, links center, CTA right, sticky) and "AI footer" (four link columns, social row, tiny copyright), plus an email sign-up at the bottom of every page. → Build the nav/footer this product needs.
- Re-drawn UI chrome: fake browser windows with traffic-light dots, fake phones, fake IDEs around screenshots. → Real screenshot, minimal frame.

**Motion**
- Every section fades in on scroll. Bounce/elastic easing on buttons. Auto-scrolling logo marquee. Decorative blinking cursor. Pulsing badges. Lottie/Three.js for something static. → One orchestrated entrance; motion tied to state changes.

**Details that betray no review**
- Mixed icon sets (Lucide + Heroicons + emoji). → One set.
- `z-index: 9999`, `width: 100vw`, inline colors bypassing tokens.
- Generic `alt="image"`; default/missing OG image; the same meta description on every page.
- Placeholder people and companies (Jane Doe, Acme), invented metrics ("10x faster").
- Buttons or nav labels wrapping to two lines; text touching the viewport edge; low-contrast gray text; skipped heading levels.

**Copy and navigation that claim more than the product does** (found reviewing a real app)
- Stacked two-beat slogans: "Facts stay. Framing changes." "Read widely. Think freely." "More context. Less noise." filling every empty slot. → One tagline, in the hero. Everything else is plain description ("9 publishers, grouped into events") or deleted.
- Copy that promises what the product disclaims elsewhere ("Shared facts" beside a note that checks "don't establish accuracy"). → Marketing copy must not outrun the honest copy.
- Personalization that doesn't exist: an avatar with no account, "For you" with a sparkle icon that's just "All", "Your top stories", "My briefing". → Name things for what they are.
- Many entry points to the same dialog ("How it works", "About", "Our approach", the avatar, a filter icon, all opening one modal). → One or two links that say where they go.
- Labels typed in ALL CAPS in the source. → Sentence case in the markup, `text-transform: uppercase` in CSS.
- One font size for almost everything (e.g. 11px on 60% of rules, including body text). → A small type scale as tokens; body text at a reading size.
- Color tokens declared, then bypassed with dozens of near-identical raw hex greys and selectors redefined three times. → A handful of tokens used everywhere; delete the patch layers.
- Stock photos standing in for missing news or product images. → Text-only variant or a designed placeholder; never decoration posing as content.

## Positive defaults

- Content-first: write the real copy first, then design around its actual length and shape.
- Asymmetry is allowed. Sections can differ in width, alignment, density.
- Typography carries hierarchy: size, weight, spacing. Not boxes and color.
- Specific beats pretty: a real screenshot with a real number beats an abstract illustration.
- Keep stock component-library defaults only where you chose them; restyle the obvious ones (default radius, default shadow, default hero).

## Check

After writing UI files, run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/slop-lint.mjs" <file-or-dir> --min=med
```

Then look at the rendered page (screenshot if a browser tool is available) and ask: *if the logo were removed, could this be any other AI startup's site?* If yes, change the decisions above, not just the class names.
