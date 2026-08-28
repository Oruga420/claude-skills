---
name: suno-creator
description: Generate Suno AI-ready song output — Style prompt, Lyrics, Title, and production context — from a song concept and optional references. Based on AI-Gen-Architect.
origin: custom
invocation: /suno-creator
---

# Suno Creator

Generate song content optimized for direct paste into Suno AI's creation interface, backed by proper musical analysis.

## When to Use

When the user wants to create a song and needs Suno-ready output with musical context.

## Input

The user provides a **song concept** in natural language. This can include:
- Theme, mood, or story they want the song about
- Genre preferences (trap, reggaeton, pop, rock, etc.)
- **Reference songs or artists** for vibe direction (will be analyzed, NOT copied)
- Language preference (defaults to Spanish)
- Vocal gender preference (Male/Female)

## Process

### Step 1: Reference Research & Analysis (if references provided)
When the user gives reference songs/artists, **actively research each one online** before analyzing:

1. **Use WebSearch** to search for each reference song/artist. Search queries like:
   - `"{song name}" "{artist}" BPM key tempo`
   - `"{song name}" "{artist}" production breakdown analysis`
   - `"{artist}" style genre musical characteristics`
2. **Use WebFetch** to read relevant results (song databases, production breakdowns, music reviews)
3. **Extract real data** for each reference:
   - Actual BPM and key (from songbpm.com, tunebat.com, etc.)
   - Genre classification and subgenres
   - Production style (instruments, sound design, vocal treatment)
   - Song structure and arrangement
   - What makes it stand out sonically
4. **Synthesize**: How to combine elements from all references into the new song's direction

Present this as a **Reference Analysis** section with real data, not guesses.

### Step 2: Production Context
Define the musical foundation that will guide the song creation:
- **BPM**: Tempo recommendation
- **Key**: Musical key
- **Structure**: Timestamped arrangement (e.g., 0:00-0:15 Intro, 0:15-0:45 Verse 1, etc.)
- **Core elements**: Drums/percussion style, bass type, synths/instruments, vocal treatment

This context informs the Style and Lyrics — show it so the user understands the musical decisions.

### Step 3: Suno Output (the copy-paste fields)
Generate the three fields the user pastes directly into Suno:

#### Title
A catchy, memorable song title (NOT a real artist's song name).

#### Styles (Suno Style Prompt)
A concise style description for Suno's "Styles" text field. Rules:
- **Max 120 words** — Suno truncates long style prompts
- Start with a narrative musical direction: "Arranca con...", "Opens with...", "Starts with..."
- Describe the sonic journey: what instruments, what energy, transitions
- Include genre tags naturally: "trap oscuro", "reggaeton melodico", "indie pop", etc.
- **NEVER use real artist names** — use generic descriptors instead ("voces rasgadas tipo rock alternativo" not "voz tipo Kurt Cobain")
- Incorporate the BPM, key, and production decisions from Step 2 into the style description naturally
- End with the overall vibe/feeling

#### Lyrics
Full song lyrics with Suno structural tags. Rules:
- Use these tags: `[Verse 1]`, `[Verse 2]`, `[Pre-Chorus]`, `[Chorus]`, `[Bridge]`, `[Outro]`, `[Drop]`, `[Intro]`
- Keep total lyrics under 3000 characters (Suno limit)
- Write in the user's requested language (default: Spanish)
- Make the chorus memorable and repeatable
- Include ad-libs or vocal directions in parentheses where useful: `(woah)`, `(hey!)`, `(bass drop)`
- Match lyrical rhythm to the genre (short punchy lines for trap, flowing for ballads, etc.)
- Follow the timestamped structure from Step 2

## Output Template

```markdown
---

## Reference Analysis
{Only if the user provided reference songs/artists. Brief analysis of what to draw from each reference — sonic elements, energy, what works musically. 3-5 bullet points max.}

---

## Production Context
- **BPM**: {tempo}
- **Key**: {musical key}
- **Core Elements**: {drums, bass, synths, vocal treatment summary}
- **Structure**:
  - 0:00-0:15: {section} — {brief description}
  - 0:15-0:45: {section} — {brief description}
  - ...

---

## Title
{song title}

## Styles
{style prompt for Suno — paste directly into Styles field}

## Lyrics
{full lyrics with structural tags — paste directly into Lyrics field with Manual mode}
```

## Important Constraints

- **NO viral strategy or marketing angles** — not relevant for song creation
- **NO "viral angle" or "trend/challenge" suggestions**
- **NO platform strategy** (TikTok, Reels, etc.)
- **NO artist names** in the Styles field (Suno filters them) — only in Reference Analysis
- Reference Analysis and Production Context exist to BUILD BETTER songs, not as filler
- If no references are given, skip Reference Analysis and go straight to Production Context

## Example Interaction

**User**: hazme una cancion tipo "Friends" de Whipped Cream y "Laga Reh" de Young Stunners, trap agresivo sobre hermandad anime, en español

**Output**:

---

## Reference Analysis
- **"Friends" (Whipped Cream)**: Bass music pesado, drops industriales oscuros, bajo que domina el espectro. Tomar: el peso del bajo y los momentos de impacto.
- **"Laga Reh" (Young Stunners)**: Rap crudo, flow rápido sin pausas, agresividad constante. Tomar: la velocidad y energía en los versos, fraseo punzante.
- **Dirección**: Cruzar el impacto bass de la primera con la agresividad rap de la segunda, temática anime shonen.

---

## Production Context
- **BPM**: 110
- **Key**: Dm
- **Core Elements**: 808 distorsionado, percusión trap crujiente, hi-hats rápidos, sintes ácidos oscuros, rap percusivo agresivo
- **Structure**:
  - 0:00-0:15: Intro — Bajo 808 amenazante, atmósfera oscura
  - 0:15-0:35: Verse 1 — Rap rápido y agresivo
  - 0:35-0:45: Pre-Chorus — Build-up, tensión sube
  - 0:45-1:05: Chorus + Drop — EDM bass explosivo
  - 1:05-1:25: Verse 2 — Rap con variaciones de flow
  - 1:25-1:45: Chorus + Drop — Máxima energía
  - 1:45-2:00: Outro — 808 fade, ecos vocales

---

## Title
Besto Friendo

## Styles
Arranca con beat trap oscuro y bajo profundo. Flow rap rápido y agresivo. Estribillo explota en EDM bass pesado tipo festival. Trap oscuro, hip-hop alternativo, rap rápido agresivo, bajo 808 pesado, drop EDM bass, voces excéntricas rítmicas, vibra anime shonen, hermandad.

## Lyrics
[Verse 1]
Sangre en la arena, rival y mi hermano
Espadas cruzadas, rompiendo el océano
Como guerreros subiendo el ki
Si tocan a mi sangre, los mato por ti
Flow espadachín, la ruta es letal
Mi hermano de pacto, instinto animal

[Pre-Chorus]
Un solo latido, el mismo dolor
Si tú eres la fuerza, yo soy el motor

[Chorus]
¡My besto friendo!
Mi hermano de batalla
Si tú caes al piso, yo soy la muralla
¡Besto friendo! (bass drop)
¡Rompiendo la escala!

[Drop]
(Heavy bass and vocal chops)
¡Besto friendo!

[Verse 2]
Mano a mano, sin parar la pelea
Somos la ola, esquivando la brea
Sube de nivel, sin freno ni red
Espalda con espalda, crujiendo el papel

[Chorus]
¡My besto friendo!
Mi hermano de batalla
Si tú caes al piso, yo soy la muralla
¡Besto friendo!

[Outro]
(808 fade, ecos)
Hermano... hermano de batalla...
