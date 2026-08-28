---
name: awesome-design-md
description: 58 real-world DESIGN.md files (Vercel, Stripe, Linear, Apple, Spotify, etc.) for AI-driven UI generation. Use when building frontend pages, landing pages, or components that should match a specific brand's design language. Pairs with frontend-design and theme-factory skills.
origin: VoltAgent/awesome-design-md (adapted for ECC)
---

# Awesome DESIGN.md — Brand Design Systems for AI Agents

A curated library of 58 DESIGN.md files extracted from real production websites. Each file contains the complete design system specification: colors, typography, spacing, components, shadows, animations, and layout patterns.

Drop a DESIGN.md into your project root and tell Claude "build me a page that looks like this" for pixel-perfect, brand-consistent UI.

## When to Activate

- User asks to build a page/component "in the style of" a known brand (Vercel, Stripe, Linear, etc.)
- User wants a specific design language for their frontend
- User references a brand's visual identity as inspiration
- Pairing with `/frontend-design` or `/theme-factory` skills for styled output
- Building landing pages, dashboards, or marketing sites that need a polished, non-generic look

## How to Use

### 1. Pick a Brand

Available DESIGN.md files (58 brands):

**AI & LLM Platforms**
- claude, cohere, elevenlabs, minimax, mistral.ai, ollama, opencode.ai, replicate, runwayml, together.ai, voltagent, x.ai

**Developer Tools & IDEs**
- cursor, expo, lovable, raycast, superhuman, vercel, warp

**Backend, Database & DevOps**
- clickhouse, hashicorp, mongodb, posthog, sanity, sentry, supabase

**Design & Collaboration**
- figma, framer, miro, notion, webflow

**Fintech & Payments**
- coinbase, kraken, revolut, stripe, wise

**SaaS & Productivity**
- airtable, cal, clay, composio, intercom, linear.app, mintlify, resend, zapier

**Content & Social**
- pinterest, spotify

**Consumer & Lifestyle**
- airbnb, apple, uber

**Automotive & Industrial**
- bmw, ferrari, lamborghini, nvidia, renault, spacex, tesla

**Enterprise**
- ibm, semrush (stub only)

### 2. Load the Design System

Read the brand's DESIGN.md from this skill's `design-md/` directory:

```
Read design-md/{brand}.md
```

For example: `design-md/vercel.md`, `design-md/stripe.md`, `design-md/linear.app.md`

### 3. Apply to Your Build

Once you've read the DESIGN.md, use it as the design specification for all frontend output in the current task. The DESIGN.md contains:

| Section | What It Defines |
|---------|----------------|
| Visual Theme & Atmosphere | Overall look, feel, and design philosophy |
| Color Palette & Roles | Primary, accent, neutral, semantic colors with hex values |
| Typography | Font families, sizes, weights, letter-spacing, line-height |
| Spacing & Layout | Grid system, padding, margins, breakpoints |
| Shadows & Depth | Elevation levels, shadow values, border techniques |
| Components | Buttons, cards, inputs, badges, navigation patterns |
| Animations & Motion | Transitions, easing curves, micro-interactions |
| Iconography & Media | Icon style, image treatment, aspect ratios |

### 4. Combine with Other Skills

**Best combos:**

| Combo | Effect |
|-------|--------|
| `awesome-design-md` + `frontend-design` | Brand-accurate, production-grade UI |
| `awesome-design-md` + `theme-factory` | Generate a reusable theme from the DESIGN.md |
| `awesome-design-md` + `frontend-slides` | Presentations styled like a specific brand |
| `awesome-design-md` + `artifacts-builder` | Claude.ai artifacts with brand design language |

## Rules

1. **Read the full DESIGN.md** before generating any code — don't cherry-pick sections
2. **Use exact hex values** from the palette, not approximations
3. **Use the specified fonts** — load from Google Fonts or CDN as specified in the DESIGN.md
4. **Match the spacing system** — don't mix the brand's 8px grid with arbitrary padding
5. **Respect dark/light mode** if the DESIGN.md defines both themes
6. **Never mix brands** — pick one DESIGN.md per project unless explicitly asked to blend
7. **Pair with frontend-design skill** for the creative execution framework

## Adding New Brands

To add a new brand:
1. Create `design-md/{brand-name}.md`
2. Include all 8 sections (visual theme, colors, typography, spacing, shadows, components, animations, media)
3. Extract values from the real website using browser DevTools
4. Update the brand list in this SKILL.md

Source: [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md) — DESIGN.md files extracted from public websites. These are not official design systems. Colors, fonts, and spacing are approximations for AI agent use.
