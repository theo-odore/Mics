# Mics — DESIGN.md

Purpose
- Provide a concise design system document for AI design agents and developers to generate consistent UI matching the Mics ambient player aesthetic.

Core Principles
- Premium, soft, and warm: avoid harsh neon or high-contrast saturations.
- Glassmorphism: blurred translucent cards with soft borders and elevated shadows.
- Dynamic ambient: background gradient and soft blobs adapt to album art color.
- Mobile-first: layout designed for 375px base and scales up.

Tokens
- Colors:
  - primary: #53e076 (accent used for play controls)
  - surface: #0d111b (base canvas)
  - surface-weak: rgba(255,255,255,0.05)
  - glass-border: rgba(255,255,255,0.08)
  - text-high: #ffffff
  - text-muted: rgba(255,255,255,0.65)

- Ambient:
  - ambient-rgb: dynamic; extracted from album art and normalized to soft range
  - ambient-alpha: intensity variable (0.12 soft / 0.27 medium / 0.45 vibrant)

- Spacing & Radius:
  - unit: 4px
  - sm: 8px
  - md: 16px
  - lg: 24px
  - radius-lg: 16px
  - radius-xl: 24px

Components
- Player Card
  - Background: translucent, backdrop-filter: blur(12px)
  - Border: 1px solid glass-border
  - Shadow: deep soft shadow for elevation
  - Cover art: rounded 12px, object-fit: cover

- Ambient Background
  - Two large blurred radial gradients derived from `ambient-rgb`.
  - Soft noise overlay to add tactile feel.

Guidelines for AI Agents
- Respect existing UI tokens; when generating variations pick one of the three ambient intensity levels.
- Mobile-first layout: build at 375px width then scale using min-width breakpoints.
- Use the cover image as the primary source for ambient color; normalize color values to avoid extremes.
- Save any generated design artifacts into `.design/<feature>/` with `DESIGN_BRIEF.md`, `TASKS.md`, and `DESIGN_REVIEW.md` when iterating.

Examples
- Tone request: "Build a soft premium player for a mellow acoustic album" → prefer low ambient-intensity and warm desaturated colors.

Credits
- UI implemented by the Mics team. Dynamic ambient approach: sampling + normalization for softness.
