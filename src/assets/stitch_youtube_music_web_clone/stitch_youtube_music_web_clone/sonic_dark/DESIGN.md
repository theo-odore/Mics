---
name: Sonic Dark
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
  on-surface-variant: '#ebbbb4'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#b18780'
  outline-variant: '#603e39'
  surface-tint: '#ffb4a8'
  primary: '#ffb4a8'
  on-primary: '#690100'
  primary-container: '#ff5540'
  on-primary-container: '#5c0000'
  inverse-primary: '#c00100'
  secondary: '#c6c6c7'
  on-secondary: '#2f3131'
  secondary-container: '#454747'
  on-secondary-container: '#b4b5b5'
  tertiary: '#acc7ff'
  on-tertiary: '#002f67'
  tertiary-container: '#488fff'
  on-tertiary-container: '#00285b'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdad4'
  primary-fixed-dim: '#ffb4a8'
  on-primary-fixed: '#410000'
  on-primary-fixed-variant: '#930100'
  secondary-fixed: '#e2e2e2'
  secondary-fixed-dim: '#c6c6c7'
  on-secondary-fixed: '#1a1c1c'
  on-secondary-fixed-variant: '#454747'
  tertiary-fixed: '#d7e2ff'
  tertiary-fixed-dim: '#acc7ff'
  on-tertiary-fixed: '#001a40'
  on-tertiary-fixed-variant: '#004491'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
  bg-base: '#0f0f0f'
  bg-elevated: '#1f1f1f'
  bg-overlay: '#282828'
  bg-input: '#121212'
  bg-nav: '#030303'
  bg-player: '#212121'
  text-primary: '#ffffff'
  text-secondary: '#aaaaaa'
  text-tertiary: '#717171'
typography:
  display-lg:
    fontFamily: Roboto Flex
    fontSize: 44px
    fontWeight: '900'
    lineHeight: 52px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Roboto Flex
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  headline-lg-mobile:
    fontFamily: Roboto Flex
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: Roboto Flex
    fontSize: 20px
    fontWeight: '500'
    lineHeight: 28px
  body-lg:
    fontFamily: Roboto Flex
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Roboto Flex
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-lg:
    fontFamily: Roboto Flex
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: 0.1px
  label-md:
    fontFamily: Roboto Flex
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  nav-height: 56px
  sidebar-width: 240px
  player-height: 72px
  gutter: 24px
  stack-sm: 8px
  stack-md: 16px
---

## Brand & Style
The design system is a high-fidelity recreation of a premium music streaming experience. It is engineered for deep immersion, focusing on a "dark-room" aesthetic that allows album art and artist imagery to serve as the primary visual interest. The brand personality is professional, sleek, and high-contrast, prioritizing rapid content discovery and playback control.

The style is **Corporate / Modern** with a strict dark-mode-only implementation. It utilizes a layered tonal architecture to define hierarchy rather than traditional shadows, ensuring the interface remains crisp on OLED and high-resolution displays.

## Colors
The palette is built on a "True Black" foundation to maximize contrast and focus. 

- **Primary Brand:** The iconic red is reserved for high-action items (Play buttons, Live indicators, Subscriptions).
- **Surface Hierarchy:** Depth is created through value shifts. The `bg-nav` is the darkest, grounding the application, while the `bg-player` and `bg-overlay` are lighter to indicate they sit closer to the user.
- **Typography Tiers:** White is used for active states and primary headers; hex `#aaaaaa` is the standard for secondary metadata (artist names, view counts); and hex `#717171` is used for non-interactive timestamps or disabled states.

## Typography
This design system utilizes **Roboto Flex** for its exceptional legibility and systematic feel. The type scale is compact to accommodate data-heavy lists and grids.

- **Headlines:** Use Bold (700) or Black (900) weights for playlist titles and artist names to create strong vertical rhythm.
- **Body:** The base size is 14px (`body-md`), providing a balance between information density and readability.
- **Metadata:** Use `label-md` for secondary details, often paired with the secondary text color.

## Layout & Spacing
The layout follows a fixed structural model with fluid content areas.

- **Global Framework:** A persistent 56px Top Nav and 240px Sidebar create the primary navigation shell. The 72px Player Bar is pinned to the bottom, occupying the highest z-index.
- **Grid:** Content uses a fluid grid with a 24px gutter. On desktop, content is typically organized in 6-column rows for albums.
- **Responsive Reflow:** On mobile, the Sidebar collapses into a bottom navigation bar, and the Player Bar remains fixed above the navigation.

## Elevation & Depth
Depth is achieved through **Tonal Layers** rather than shadows. 

- **Level 0 (Base):** `#0f0f0f` used for the main canvas.
- **Level 1 (Surface):** `#1f1f1f` used for cards and hovered list items.
- **Level 2 (Overlay):** `#282828` used for dropdown menus and modals.
- **Backdrop Blur:** Use a 20px blur with a 60% opacity fill for the Player Bar background to allow album colors to subtly bleed through.

## Shapes
The shape language is precise and functional, using varying radii to distinguish between content types:

- **4px (Small):** Context menus and small tooltips.
- **8px (Medium):** Album art, thumbnails, and standard buttons.
- **12px (Large):** Modals, featured banners, and search containers.
- **Pill:** Search bars, chips, and "Play All" buttons.
- **Circles:** Artist profile images must always be 100% rounded.

## Components
- **Buttons:** Primary buttons are pill-shaped. Action buttons (Play) use White background with black text for maximum prominence. Secondary buttons use an outline or transparent background with white text.
- **Chips:** Used for genre and mood filters. Fixed 32px height, pill-shaped, with a `#ffffff1a` (10% white) border.
- **Inputs:** The search input is a `bg-input` surface with a pill shape. It should transition to `bg-overlay` on focus.
- **Lists:** Horizontal list items use a 0.2s ease transition on hover, changing the background to `bg-elevated`.
- **Cards:** Album cards consist of a 1:1 aspect ratio image with a 8px radius. Titles are `body-md` (Primary White), and subtitles are `label-md` (Secondary Text).
- **Player Bar:** Always visible. Features a progress bar that spans the full width of the viewport at the very top of the 72px container.