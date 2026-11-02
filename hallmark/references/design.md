# Design craft

## Brand and color

Start with the product's material, audience and desired action. State the recognizable detail that belongs to this project: editorial type, a product interaction, a real photograph, a useful visualization, an unusual but usable composition. Avoid default gradients, unrelated decorative blobs and interchangeable feature cards unless the brief supports them.

Use a coherent hue relationship and control lightness/chroma separately. Define surface, text, muted, border, accent, focus and semantic state roles; reuse the project's tokens. Test text on the actual surfaces, including overlays and hover. Color must not be the only error or selection signal. Themes provide candidates, not a contrast guarantee. See [WCAG contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) for the standard and its exceptions.

## Typography, space and composition

Choose type for the brand and reading task, confirm it is available and licensed, and provide a considered fallback. Pair display and body roles deliberately; let hierarchy come from size, weight, measure, rhythm and spacing rather than decoration everywhere. Keep reading comfortable across viewport sizes and zoom.

Use a spacing scale with optical adjustments where useful. Align related content; differentiate related groups from separate sections. Change composition with the content instead of repeating one card recipe. Let dense tools be dense where that serves the user, while preserving scan paths and touch usability. A hero should communicate the point and next action, not consume a screen by convention.

Test long labels, translated text, empty and loaded states. Use flexible grids (for example `minmax(0, 1fr)`), wrapping and sensible measure caps. Fix overflow at its cause; hiding it globally can hide a broken layout or focus ring. Keep important content available on mobile, even when its presentation changes.

## Interaction and motion

Every apparent control should have a real action or be visibly identified as a prototype. Design the states relevant to the component: rest, hover, focus, pressed, selected, loading, disabled, empty, success and error. Do not print success before the operation actually succeeds. Label inputs, associate errors with fields, and provide keyboard access and sensible focus restoration for menus and dialogs.

Use motion to communicate causality, hierarchy and continuity: responsive presses, state transitions and purposeful reveals. Prefer transform and opacity for large motion; avoid `transition: all`, long input delays and layout-changing animation without a concrete reason. Keep essential content visible without entrance animation. Respect `prefers-reduced-motion`, allow long-running motion to stop, and do not trade responsiveness for decoration.

Check visible focus, semantic headings, labels, contrast, zoom and usable targets. [WCAG target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) includes spacing and other exceptions; apply the actual criterion, not an invented universal pixel rule.

## Preserve and be truthful

Use real supplied material and verified product behavior. Mark placeholders so they cannot be mistaken for evidence. Do not invent factual proof, people, logos or claims of superiority. Preserve existing content, URLs, form fields, events and integration hooks unless their change is part of the request. During a redesign, record the affected behavior before changing it and verify it afterward.
