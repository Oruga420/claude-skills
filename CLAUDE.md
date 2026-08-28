# Claude Code Skills - Catalogo de Capabilities

## Proposito
Este directorio contiene 95 skills y 44 comandos slash para Claude Code.
Cada skill tiene capabilities especificas definidas en archivos YAML dentro de `capabilities/`.

## Como activar skills

Antes de usar cualquier skill, Claude DEBE:
1. Consultar el archivo YAML correspondiente en `capabilities/` para verificar que el skill tiene la capability necesaria
2. Seguir las reglas definidas en `rules.md`
3. Pedir confirmacion al usuario antes de activar el skill

## Archivos YAML de capabilities

Los siguientes archivos definen que puede hacer cada skill:

| Archivo | Categorias |
|---------|-----------|
| `capabilities/backend-y-databases.yaml` | API Design, Backend, PostgreSQL, ClickHouse, Docker, Migrations, Deployment |
| `capabilities/python-django.yaml` | Python Patterns, Python Testing, Django (Patterns, Security, TDD, Verification) |
| `capabilities/java-springboot.yaml` | Java Standards, JPA, Spring Boot (Patterns, Security, TDD, Verification) |
| `capabilities/golang.yaml` | Go Patterns, Go Testing |
| `capabilities/cpp.yaml` | C++ Standards, C++ Testing |
| `capabilities/swift-ios.yaml` | SwiftUI, Swift Concurrency, Actors, Protocol DI, Foundation Models, Liquid Glass |
| `capabilities/frontend.yaml` | TypeScript/JS Standards, React/Next.js, Presentaciones HTML |
| `capabilities/testing-y-calidad.yaml` | TDD, E2E, Verification Loop, Bug Hunter, Eval Harness, Plankton |
| `capabilities/seguridad.yaml` | Security Review, Security Scan, Steganography |
| `capabilities/ai-y-agentes.yaml` | Agentic Engineering, Autonomous Loops, Karpathy, Multi-agent Harnesses, Learning |
| `capabilities/contenido-y-negocios.yaml` | Content Engine, Articles, Suno, Investor Materials, Market Research |
| `capabilities/herramientas-claude.yaml` | NanoClaw, Session Insights, ECC Config, Skill Management, Utilities |

## Flujo de activacion

```
Usuario solicita tarea
    |
    v
Claude identifica skill relevante
    |
    v
Claude consulta YAML de capabilities
    |
    v
Claude verifica que la capability aplica
    |
    v
Claude PREGUNTA al usuario si desea activar el skill  <-- OBLIGATORIO
    |
    v
Usuario confirma --> Claude aplica el skill
Usuario rechaza --> Claude procede sin el skill
```

## Reglas importantes

Ver `rules.md` para las reglas completas de uso de skills.
La regla principal es: **NUNCA activar un skill sin confirmacion explicita del usuario.**
