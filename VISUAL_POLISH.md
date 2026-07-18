# HomePlate — Visual Polish Plan
_July 2026 · research-backed (Airbnb, DoorDash, Etsy, Sweetgreen, Refactoring UI, Nielsen Norman Group). Ranked by visual impact per effort._

## Why it reads "basic" right now

Three tells, all fixable and all centralized:
1. **System font + emoji logo.** `system-ui` everywhere and a "🍽️ HomePlate" wordmark = "we haven't done branding yet." This is the single biggest thing separating you from a designed brand.
2. **A flat two-color palette.** One cream + one amber, with cold-ish gray text. No depth, no ramp.
3. **Default-Tailwind components.** Uniform spacing, thin cards, flat borders. Competent, but nobody would call it beautiful.

The upside: HomePlate's styling is centralized (a handful of CSS tokens + a font + shared card patterns), so **most of this is a few files, not a repaint of every screen.**

---

## The moves, ranked

### 1. Typography — the biggest lever · centralized
- **Add a display serif for headings** (Fraunces — variable, warm, "old-style with attitude"; or Cormorant Garamond for higher-contrast drama), paired with **Inter** for body. Serif-for-headings is *the* signal of premium food/hospitality (Sweetgreen, most chef-driven brands). Keep the serif to H1–H3 only; Inter carries everything ≤16px. [Grilli Type, It's Nice That / Sweetgreen]
- **Install a real modular scale** (16px base × ~1.33): 16 → 21 → 28 → 37 → 49, instead of flat 14/16/18. Big, confident headings.
- **Tune the details:** tight leading (~1.1) + slightly negative tracking on large headings; **uppercase, letter-spaced eyebrow labels** ("COTTAGE FOOD · SANTA CLARA"). That one move reads instantly "designed." [Refactoring UI, Pangram Pangram]
- **Kill the emoji; build a wordmark.** "HomePlate" set in Fraunces with tight tracking, one or two letters lightly redrawn, optional tiny plate mark. An emoji can't be trademarked and renders differently on every device. [ebaqdesign, Sweetgreen]

### 2. Color depth — centralized
- **Turn the single amber into a 9-step ramp** (100→900): pale honey for tints/badges, deep bronze for text-on-cream and hover. **Rebuild "cream" as a warm-tinted neutral ramp** carrying one amber/brown hue from lightest bg to darkest text — not cream sitting next to cold gray. [Refactoring UI]
- **Add supporting tones, not a second loud accent:** one deep **terracotta/clay** anchor for richness + CTA depth, and keep a reserved **natural green** for "verified/fresh." Amber is emotionally correct — warm hues measurably stimulate appetite. [Refactoring UI, appetite-color research]
- **Warm the shadows and neutrals** — never pure black text or pure gray; tint toward the brand's warm brown.

### 3. Food-forward imagery + cards · mostly a shared card component
- **Adopt the Airbnb card recipe:** ~12–16px radius, **1px hairline border + ONE soft shadow** (not multi-tier), ~24px padding, image-forward. Restraint reads as expensive. [Airbnb design spec]
- **Bigger, consistent images.** Lock one aspect ratio across every card (1:1 or 4:5), angled food shots (how people actually see food), edge-to-edge. Consistency is the biggest premium lever after type. [DoorDash, NN/g]
- **Confident price/rating.** Big rating number, clear price — give the numbers weight.
- Always **scrim text-over-image** (30–40% gradient) so overlays stay legible.

### 4. Spacing & rhythm — centralized
- **8pt non-linear scale** (4, 8, 12, 16, 24, 32, 48, 64…). **Group tight, separate generously** (internal ≤ external): 16px inside a card, ≥32px between. Start over-spaced, then trim. Whitespace *is* the premium signal. [Refactoring UI, NN/g]

### 5. Motion & finishing — light touch
- **Hover:** subtle card lift + gentle image zoom (+ optional delayed alternate-photo swap).
- **Skeleton loaders** that match the layout, not spinners — feels ~50% faster.
- **One easing curve** everywhere, smooth (luxury tone). Motion as a usability layer, never decoration. [Figma trends, NN/g]

---

## Three aesthetic directions to choose from
All use the same research; they differ in *feeling*:
- **A — Warm Editorial / Artisanal (recommended):** Fraunces serif headings, warm cream + amber + terracotta, food-forward. Feels like a beautiful cookbook / Sweetgreen. Best fit for "premium home food."
- **B — Clean Modern:** Inter-only (or a subtle serif), tighter neutral palette, crisp cards, lots of white. Feels like a polished tech product (Airbnb-lite). Safe, less distinctive.
- **C — Bold Appetite:** bigger imagery, deeper/saturated warm palette, punchier type. Feels energetic/craveable (DoorDash energy). Highest visual impact, furthest from "calm premium."

## Suggested order to implement (A)
1. Fonts + type scale + wordmark (globals + layout) — the transformation.
2. Color ramps (globals CSS tokens).
3. Card + button refinement (shared patterns).
4. Spacing pass + hero.
5. Motion + skeletons.
