# Guia de Uso - Claude Code Skills desde el Escritorio

## Que es este repositorio?

Este repositorio contiene **92 skills** y **44 comandos slash** para Claude Code. Cada skill es un archivo `SKILL.md` que le da a Claude conocimiento especializado sobre un tema (patrones Django, testing en Go, seguridad, etc.).

---

## Como instalar skills en Claude Code

### Opcion 1: Instalar a nivel de usuario (disponible en todos tus proyectos)

```bash
# Copiar un skill especifico a tu directorio de usuario
cp ~/Desktop/claude-code-skills/security-review/SKILL.md ~/.claude/skills/security-review.md

# O copiar varios skills
mkdir -p ~/.claude/skills
cp ~/Desktop/claude-code-skills/python-patterns/SKILL.md ~/.claude/skills/python-patterns.md
cp ~/Desktop/claude-code-skills/tdd-workflow/SKILL.md ~/.claude/skills/tdd-workflow.md
```

### Opcion 2: Instalar a nivel de proyecto (solo para un proyecto especifico)

```bash
# Desde la raiz de tu proyecto
mkdir -p .claude/skills
cp ~/Desktop/claude-code-skills/django-patterns/SKILL.md .claude/skills/django-patterns.md
```

### Opcion 3: Usar el instalador interactivo

```bash
# El skill "configure-ecc" es un instalador guiado
# Copia su contenido a tu CLAUDE.md y Claude te guiara
cat ~/Desktop/claude-code-skills/configure-ecc/SKILL.md
```

---

## Como usar los skills una vez instalados

### Skills pasivos (la mayoria)
Se activan automaticamente cuando Claude detecta que el contexto es relevante. Por ejemplo, si tienes `django-patterns` instalado y estas trabajando en un proyecto Django, Claude aplicara esos patrones.

### Skills con trigger (comandos slash)
Algunos skills tienen un comando especifico:

| Comando | Skill | Descripcion |
|---------|-------|-------------|
| `/karpathy` | karpathy | Inicia loop autonomo de investigacion |
| `/suno-creator` | suno-creator | Genera output para Suno AI |
| `/tdd` | tdd-workflow | Inicia flujo TDD |
| `/plan` | ultraplan/plan | Planificacion profunda |
| `/verify` | verification-loop | Loop de verificacion |
| `/claw` | nanoclaw-repl | REPL de NanoClaw |
| `/learn` | continuous-learning | Extraer patrones de sesion |
| `/code-review` | coding-standards | Revision de codigo |
| `/e2e` | e2e-testing | Tests end-to-end |

### Comandos slash (carpeta commands/)
Los 44 archivos en `commands/` son comandos slash independientes. Para instalarlos:

```bash
mkdir -p ~/.claude/commands
cp ~/Desktop/claude-code-skills/commands/*.md ~/.claude/commands/
```

Luego puedes usar `/plan`, `/tdd`, `/verify`, `/code-review`, etc. directamente en Claude Code.

---

## Estructura de cada skill

```
nombre-skill/
├── SKILL.md              # Archivo principal (siempre presente)
├── config.json           # Configuracion opcional
├── agents/               # Definiciones de agentes (skills multi-agente)
│   └── nombre-agent.md
├── program_templates/    # Plantillas de dominio
└── sub-skills/           # Sub-skills anidados
```

### Frontmatter de SKILL.md

```yaml
---
name: nombre-del-skill
description: "Descripcion corta"
origin: ECC                    # Ecosistema Everything Claude Code
version: 2.1.0                 # Version semantica
trigger: "/comando"            # Comando slash opcional
tools: Read, Write, Edit, Bash # Herramientas requeridas
---
```

---

## Categorias de skills disponibles

### Desarrollo Backend
- `api-design` - Diseno de APIs REST
- `backend-patterns` - Patrones Node.js/Express
- `postgres-patterns` - Optimizacion PostgreSQL
- `clickhouse-io` - ClickHouse analytics
- `database-migrations` - Migraciones de BD
- `docker-patterns` - Docker y Docker Compose

### Python / Django
- `python-patterns` - Patrones idiomaticos Python
- `python-testing` - Testing con pytest
- `django-patterns` - Arquitectura Django + DRF
- `django-security` - Seguridad Django
- `django-tdd` - TDD en Django
- `django-verification` - Verificacion pre-release

### Java / Spring Boot
- `java-coding-standards` - Estandares Java
- `jpa-patterns` - JPA/Hibernate
- `springboot-patterns` - Arquitectura Spring Boot
- `springboot-security` - Seguridad Spring
- `springboot-tdd` - TDD Spring Boot
- `springboot-verification` - Verificacion Spring

### Go
- `golang-patterns` - Patrones idiomaticos Go
- `golang-testing` - Testing en Go

### C++
- `cpp-coding-standards` - Estandares C++
- `cpp-testing` - Testing C++ con GoogleTest

### Swift / iOS
- `swiftui-patterns` - Patrones SwiftUI
- `swift-concurrency-6-2` - Concurrencia Swift 6.2
- `swift-actor-persistence` - Persistencia con actores
- `swift-protocol-di-testing` - DI con protocolos
- `foundation-models-on-device` - LLM on-device iOS 26
- `liquid-glass-design` - Liquid Glass iOS 26

### Frontend
- `coding-standards` - TypeScript/React standards
- `frontend-patterns` - React/Next.js
- `frontend-slides` - Presentaciones HTML

### Testing y Calidad
- `tdd-workflow` - Flujo TDD general
- `e2e-testing` - Playwright E2E
- `verification-loop` - Loop de verificacion
- `bughunter` - Caza de bugs
- `eval-harness` - Framework de evaluacion
- `plankton-code-quality` - Calidad en tiempo de escritura

### Seguridad
- `security-review` - Revision de seguridad
- `security-scan` - Scan de configuracion
- `st3gg` - Toolkit de esteganografia

### AI y Agentes
- `agentic-engineering` - Ingenieria agentica
- `ai-first-engineering` - Modelo AI-first
- `autonomous-loops` - Loops autonomos
- `continuous-agent-loop` - Loop continuo de agentes
- `karpathy` - Loop de investigacion autonomo
- `long-running-harness` - Harness multi-agente
- `ralphinho-rfc-pipeline` - Pipeline RFC multi-agente
- `cost-aware-llm-pipeline` - Optimizacion de costos LLM
- `agent-harness-construction` - Construccion de harnesses
- `enterprise-agent-ops` - Operaciones de agentes enterprise

### Contenido y Negocios
- `content-engine` - Contenido para redes sociales
- `article-writing` - Articulos y blog posts
- `suno-creator` - Generacion de canciones
- `investor-materials` - Materiales para inversores
- `investor-outreach` - Outreach a inversores
- `market-research` - Investigacion de mercado

### Deployment y Ops
- `deployment-patterns` - CI/CD y deployment
- `strategic-compact` - Compactacion de contexto
- `session-insights` - Analisis de sesiones
- `onboard` - Onboarding de empleados

---

## Tips de uso

1. **No instales todo**: Selecciona solo los skills relevantes a tu stack. Demasiados skills pueden saturar el contexto de Claude.

2. **Combina skills complementarios**: Por ejemplo, `django-patterns` + `django-tdd` + `django-security` para un proyecto Django completo.

3. **Usa los YAML de capabilities**: Consulta los archivos en `capabilities/` para saber exactamente que puede hacer cada skill antes de activarlo.

4. **Lee rules.md**: Antes de usar cualquier skill, revisa las reglas de uso establecidas.

5. **Actualiza regularmente**: Haz `git pull` en este directorio para obtener nuevos skills y actualizaciones.

```bash
cd ~/Desktop/claude-code-skills && git pull
```
