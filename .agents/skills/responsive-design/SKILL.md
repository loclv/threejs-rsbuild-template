---
name: responsive-web-development
description: Build, refactor, and review responsive Tailwind CSS interfaces across viewport sizes, input modes, and accessibility settings.
---

# Responsive web development with Tailwind CSS

Build accessible layouts that adapt continuously to their content and available space. Follow the project's Tailwind version, configuration, design tokens, and component conventions; do not migrate or add a framework unless requested.

## Workflow

1. Inspect the existing layout, Tailwind setup, breakpoints, and supported browsers. Identify content that must wrap, stack, scroll, or change interaction at narrower widths.
2. Start with semantic HTML and a usable narrow layout. Add responsive variants only where content needs a different layout. Test intermediate widths and both sides of each breakpoint.
3. Prefer fluid sizing, Grid, and Flexbox over fixed dimensions and device-specific rules. Check long labels, translations, empty and loading states, and large data.
4. Verify keyboard and touch interaction, zoom, reduced motion, clipping, and unintended page-level horizontal overflow. Report what was actually tested and any limitations.

## Tailwind conventions

- Use unprefixed utilities for the base layout and `sm:`, `md:`, and other configured variants as minimum-width enhancements. These are breakpoint names, not device categories. Use the project's configured values rather than assuming defaults; add breakpoints only when content requires them.
- Reuse theme spacing, sizing, typography, and color tokens. For Tailwind v4, follow the project's CSS-first `@theme` configuration; for earlier versions, follow its JavaScript configuration. Avoid changing global tokens to solve a single component problem.
- Keep class names statically detectable: map variants to complete class strings instead of constructing fragments such as `grid-cols-${count}`. Follow the project's source detection configuration when classes live outside normal source paths.
- Use arbitrary values or properties for genuine one-off needs, and extract repeated patterns into existing components or theme tokens when that improves clarity. Use custom CSS when utilities would obscure the solution or the project already does so.
- Use container query variants where supported by the installed Tailwind version and configuration when a reusable component depends on its parent's width. Use viewport variants for page-level layout. Check browser support and provide an appropriate base layout.
- Avoid conflicting utilities, unnecessary responsive overrides, and `!important` as a routine fix. Do not hide overflow to conceal a broken layout.

For example, adapt the classes to the project's tokens and content:

```html
<main class="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
  <div class="grid min-w-0 gap-6 md:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
    <section class="min-w-0">...</section>
    <aside class="min-w-0">...</aside>
  </div>
</main>
```

## Layout and content

- Use `min-w-0` for Grid or Flex children that need to shrink, and zero-minimum flexible grid tracks where intrinsic content would overflow. Let toolbars wrap with `flex-wrap`; avoid fixed heights for text-heavy content.
- Use bounded fluid sizes such as `clamp()` where gradual scaling helps. Avoid viewport-width-only body text, unnecessary `w-screen`, and fixed widths for major regions. Keep readable line lengths.
- Use responsive images with appropriate `srcset` and `sizes` when available. Reserve media space using dimensions or aspect ratio, select `object-cover` or `object-contain` intentionally, and provide appropriate alternative text.
- Keep tables semantic. If needed, put horizontal scrolling on a discoverable, keyboard-accessible wrapper, not the whole page. Allow long URLs and identifiers to wrap selectively.
- Account for sticky headers, fixed controls, safe-area insets, and mobile browser chrome. Use dynamic viewport units where appropriate with a fallback for the supported browser matrix. Never disable user zoom.

## Interaction and accessibility

- Preserve all navigation and actions at every width. Collapsed navigation needs an accessible button and expanded state; overlays need appropriate keyboard behavior and focus management.
- Do not rely on hover alone. Use input capability variants or queries when the distinction is pointer capability rather than viewport width. Make primary touch targets comfortably sized where practical.
- Keep visible focus indicators, sufficient contrast, semantic controls, persistent form labels, and nearby validation messages. Ensure sticky UI does not obscure focused elements.
- Respect user preferences using supported variants such as `motion-reduce:` and `motion-safe:`. Check reflow at 200% zoom and larger text, and honor the product's theme behavior.
- Prefer CSS for presentation changes; use JavaScript for behavior when necessary, and clean up any size observers.

## Verification

Check narrow, intermediate, and wide viewports, including just below and above relevant breakpoints. Verify no unintended horizontal page scrolling, clipped content, inaccessible controls, or covered focus; check images, forms, menus, dialogs, tables, and fixed elements. Test keyboard and touch where available, zoom, and reduced motion. Use browser tools and real devices when practical; add automated viewport or accessibility tests when they meaningfully cover the change. Do not claim unperformed checks.
