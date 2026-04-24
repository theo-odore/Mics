---
name: Obsidian Audio
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#3a3939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#bccbb9'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#869585'
  outline-variant: '#3d4a3d'
  surface-tint: '#53e076'
  primary: '#53e076'
  on-primary: '#003914'
  primary-container: '#1db954'
  on-primary-container: '#004118'
  inverse-primary: '#006e2d'
  secondary: '#c8c6c5'
  on-secondary: '#313030'
  secondary-container: '#4a4949'
  on-secondary-container: '#bab8b7'
  tertiary: '#c8c6c5'
  on-tertiary: '#303030'
  tertiary-container: '#a2a1a0'
  on-tertiary-container: '#383838'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#72fe8f'
  primary-fixed-dim: '#53e076'
  on-primary-fixed: '#002108'
  on-primary-fixed-variant: '#005320'
  secondary-fixed: '#e5e2e1'
  secondary-fixed-dim: '#c8c6c5'
  on-secondary-fixed: '#1c1b1b'
  on-secondary-fixed-variant: '#474646'
  tertiary-fixed: '#e4e2e1'
  tertiary-fixed-dim: '#c8c6c5'
  on-tertiary-fixed: '#1b1c1c'
  on-tertiary-fixed-variant: '#474746'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '800'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: '1.2'
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '500'
    lineHeight: '1.5'
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '400'
    lineHeight: '1.2'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
  gutter: 16px
  margin: 24px
---

## Brand & Style

This design system is anchored in **Minimalism** with a heavy focus on content immersion. The brand personality is professional, sleek, and premium, designed to disappear and let the album art and artist photography take center stage. 

The aesthetic prioritizes clarity and high-end "dark mode" utility. It avoids unnecessary decoration, opting instead for precise alignments, ample negative space, and a restricted color palette. The emotional response should be one of focused calm and sophisticated modernism, appealing to audiophiles and daily listeners who value a clutter-free environment.

## Colors

The palette is built on a foundation of absolute blacks and deep charcoals to maximize contrast with content. 

- **Primary:** The vibrant green (#1DB954) is used exclusively for calls to action, active states, and progress indicators.
- **Surface Tiers:** The background uses #0B0B0B, while elevated surfaces like cards or sidebar elements use #121212 and #282828.
- **Typography:** Pure white (#FFFFFF) is reserved for headers and primary information, while secondary metadata uses a muted gray (#B3B3B3) to maintain a clear visual hierarchy.

## Typography

The design system utilizes **Inter** for its neutral, highly legible character. The scale is built on a tight hierarchy:
- **Display Weights:** Heavy weights (Bold/ExtraBold) are used for artist names and playlist titles to provide a strong anchor for the page.
- **Functional Weights:** Medium and Regular weights are used for tracks and descriptions to ensure readability against dark backgrounds.
- **Letter Spacing:** Headlines utilize slight negative tracking for a more "designed" editorial feel, while labels use positive tracking for clarity at small sizes.

## Layout & Spacing

This design system employs a **fluid grid** model. The interface is divided into functional zones: a fixed-width sidebar, a sticky player bar at the bottom, and a flexible main content area that expands based on viewport width.

Spacing follows a strict 4px/8px baseline grid to maintain rhythmic consistency. Content blocks should be separated by `2xl` (48px) units, while internal card padding and list item gaps should utilize `md` (16px).

## Elevation & Depth

Depth is conveyed through **Tonal Layers** rather than heavy shadows. In a dark environment, light is used to imply height.

- **Level 0 (Base):** #0B0B0B for the main background.
- **Level 1 (Surface):** #121212 for the sidebar and player bar.
- **Level 2 (Floating/Hover):** #282828 for cards and hovered list items.
- **Overlays:** For modals or context menus, a subtle #000000 background blur (20px) is applied to the backdrop to maintain focus on the interactive element. Shadows are minimal, using a 10% opacity black with a large 30px spread for a soft, ambient lift.

## Shapes

The shape language is consistently **Rounded**, creating a soft counter-balance to the stark dark color palette. 

- **Containers:** Cards and album art containers use `rounded-lg` (1rem) for a modern, approachable feel.
- **Interactive Elements:** Buttons and chips use a full pill-shape (3rem) to clearly distinguish them from content.
- **Feedback:** Hover states should transition smoothly with a 200ms ease, subtly brightening the background color of the element.

## Components

### Buttons
- **Primary:** Pill-shaped, #1DB954 background, black text, bold weight.
- **Secondary:** Transparent with a thin 1px border (#B3B3B3) or solid #282828.
- **Ghost:** No background, white text; turns semi-transparent or slightly brighter on hover.

### Progress Bars
- **Refined Playback:** A 4px height track in #282828. The progress fill is white by default, changing to #1DB954 when hovered or interacted with. A small circular "knob" only appears during active dragging.

### Lists & Track Rows
- **Layout:** Horizontal layout with clear columns for Track #, Title/Artist, Album, and Duration.
- **Interaction:** The entire row highlights to #282828 on hover. The track number is replaced by a "Play" icon.

### Chips
- **Categories:** Small pill-shaped containers with a #282828 background and white text. Active states use the Primary Green background.

### Cards
- **Album/Playlist:** Square aspect ratio for imagery with `rounded-lg` corners. Text metadata is left-aligned below the image with no containing border.

### Input Fields
- **Search:** Rounded-pill shape, #282828 background, subtle 14px Inter typography, and a magnifying glass icon on the leading edge.