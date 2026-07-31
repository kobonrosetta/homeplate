# ForkFork — Design DNA

**Read this before touching any UI.** It is the single source of truth for how
ForkFork looks and moves. Every change — human- or AI-made — inherits these
rules; when a prompt and this file disagree, this file wins. The goal: a warm,
editorial, food-first marketplace that reads *art-directed*, never
template-generated.

## Direction

**Warm editorial.** Think a well-set cookbook, not a SaaS dashboard: cream
paper, warm ink, one confident amber, expressive serif headlines, photography
doing the emotional work. Friendly and personal ("your neighbor cooks"), never
corporate or clinical.

## Tokens (defined in `app/globals.css`, mapped in `tailwind.config.ts`)

Palette is **60 / 30 / 10** — extend by tint/shade, never by new hue:

| Role (~share) | Token | Light | Notes |
|---|---|---|---|
| Dominant ~60% | `bg` | warm cream `250 246 239` | the paper |
| Support ~30% | `card` / `line` / `ink`+`muted`+`faint` | warm off-white / hairline / warm near-blacks | structure + text |
| Accent ~10% | `brand` | amber `176 84 20` | CTAs, links, focus moments |
| Reserved | `clay` | terracotta | available for future accents; unused until deliberately introduced |

**Sanctioned exceptions (semantic color only):** emerald for the
County-verified trust badge and success states; red for destructive/error;
amber-tint for warnings. These are *status* colors — never decoration.
Everything else: no new hues.

## Typography

- **Display:** Fraunces — applied globally to `h1/h2/h3` (see `globals.css`),
  tight leading, −0.02em tracking. Small UPPERCASE eyebrow labels escape to
  Inter via `h*.uppercase`.
- **Body:** Inter, 15–16px minimum, weight for hierarchy (never extra
  families).
- Big expressive Fraunces numerals/letters are a house move (step numbers,
  monograms) — use them where a generic icon would otherwise go.

## Surfaces — the card ladder

Separate content in this order, stopping at the first rung that works:

1. **Whitespace** (8px grid: all spacing is a multiple of 8, half-step 4)
2. **Background shift** — `bg-card` on the cream page IS the shift (~3–5%
   lightness) + `shadow-soft`
3. **`shadow-lift`** on hover for interactive cards

**Never a flat gray outline around a content card** (`border border-line` on
display cards is the #1 "AI-built" tell). Borders belong to: form
inputs/selects, selectable option cards (selection affordance), dashed
empty-state boxes, and hairline *dividers* (`divide-y`, `border-t`) inside a
surface. Radius: `rounded-xl` default, `rounded-2xl` for photo-led cards —
pick one per component, don't mix.

## Imagery & iconography

- **Food photography is the hero** — photo-led cards, `object-cover`, warm
  treatment. Never stock-photo filler.
- **No emoji as UI.** Where a photo is missing or a space needs a mark, use
  `components/fork-mark.tsx` (the favicon geometry, `currentColor`) in
  `text-faint` or `text-brand`. Text glyphs like ✓ · × are fine.
- Lucide-style icon grids ("three boxes with icons") are banned — use Fraunces
  numerals, photography, or plain type instead.

## Motion

**One orchestrated moment per page:** the `.rise` keyframe (globals.css) on
first-load content, staggered by inline `animationDelay` (~60ms × index,
capped ≈ 480ms) — fill-mode `backwards` so the element is released afterward
(hover transforms and opacity utilities keep working). Plus the card hover
lift (`hover:shadow-lift` + translate). **Nothing else animates.**
`prefers-reduced-motion` disables the entrance.

## Copy voice

Warm, direct, human. Contractions welcome. Say "your kitchen," not "the
vendor." Numbers and specifics over adjectives ("174 county permits," not
"many"). Never corporate filler ("leverage," "seamless," "empower").

## Prohibitions (the AI-slop tells — hard bans)

- Purple/indigo anything; gradients as decoration (the body's 5% warm radial
  wash is the sanctioned exception); glassmorphism; glow shadows; floating
  orbs
- Inter/Roboto/Arial as display type
- Flat gray borders on content cards; colored left-border cards
- Pill badge floating above a hero H1; numbered-circle 1-2-3 step rows;
  icon-topped feature-card triplets; stat banner rows
- Dark-mode-as-aesthetic (our dark theme exists only as a warm system-pref
  mirror)
- Emoji as icons; ALL-CAPS section headers in Fraunces (eyebrows are Inter)
- New hues outside the tokens; pure `#fff`/`#000`

## The squint test

Before shipping UI: shrink the page to a thumbnail. If every section reads as
the same gray-bordered box, it fails. Each page should have one clear focal
moment (usually photography or a Fraunces headline).
