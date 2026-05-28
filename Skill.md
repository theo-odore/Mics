---
name: design-system-youtube-music
description: Creates implementation-ready design-system guidance with tokens, component behavior, and accessibility standards. Use when creating or updating UI rules, component specifications, or design-system documentation.
---

<!-- TYPEUI_SH_MANAGED_START -->

# YouTube Music

## Mission
Deliver implementation-ready design-system guidance for YouTube Music that can be applied consistently across e-commerce storefront interfaces.

## Brand
- Product/brand: YouTube Music
- URL: https://music.youtube.com/
- Audience: online shoppers and consumers
- Product surface: e-commerce storefront

## Style Foundations
- Visual style: structured, accessible, implementation-first
- Main font style: `font.family.primary=Roboto`, `font.family.stack=Roboto, Noto Naskh Arabic UI, Arial, sans-serif`, `font.size.base=16px`, `font.weight.base=400`, `font.lineHeight.base=19.2px`
- Typography scale: `font.size.xs=10px`, `font.size.sm=13.33px`, `font.size.md=14px`, `font.size.lg=16px`
- Color palette: `color.text.primary=#ffffff`, `color.text.secondary=#f1f1f1`, `color.text.tertiary=#909090`, `color.text.inverse=#9b9b9b`, `color.surface.base=#000000`, `color.surface.raised=#030303`
- Spacing scale: `space.1=2px`, `space.2=4px`, `space.3=16px`, `space.4=56px`, `space.5=160.66px`
- Radius/shadow/motion tokens: `radius.xs=3px`, `radius.sm=8px`, `radius.md=18px`, `radius.lg=50px` | `motion.duration.instant=200ms`, `motion.duration.fast=280ms`

## Accessibility
- Target: WCAG 2.2 AA
- Keyboard-first interactions required.
- Focus-visible rules required.
- Contrast constraints required.

## Writing Tone
concise, confident, implementation-focused

## Rules: Do
- Use semantic tokens, not raw hex values in component guidance.
- Every component must define required states: default, hover, focus-visible, active, disabled, loading, error.
- Responsive behavior and edge-case handling should be specified for every component family.
- Accessibility acceptance criteria must be testable in implementation.

## Rules: Don't
- Do not allow low-contrast text or hidden focus indicators.
- Do not introduce one-off spacing or typography exceptions.
- Do not use ambiguous labels or non-descriptive actions.

## Guideline Authoring Workflow
1. Restate design intent in one sentence.
2. Define foundations and tokens.
3. Define component anatomy, variants, and interactions.
4. Add accessibility acceptance criteria.
5. Add anti-patterns and migration notes.
6. End with QA checklist.

## Required Output Structure
- Context and goals
- Design tokens and foundations
- Component-level rules (anatomy, variants, states, responsive behavior)
- Accessibility requirements and testable acceptance criteria
- Content and tone standards with examples
- Anti-patterns and prohibited implementations
- QA checklist

## Component Rule Expectations
- Include keyboard, pointer, and touch behavior.
- Include spacing and typography token requirements.
- Include long-content, overflow, and empty-state handling.

## Quality Gates
- Every non-negotiable rule must use "must".
- Every recommendation should use "should".
- Every accessibility rule must be testable in implementation.
- Prefer system consistency over local visual exceptions.

<!-- TYPEUI_SH_MANAGED_END -->
