# Reglas de Uso de Skills

## Regla Principal: Confirmacion Obligatoria

**Los skills NO pueden ser activados libremente. Se DEBE preguntar al usuario antes de usar cualquier skill.**

Esto aplica a TODOS los skills sin excepcion, incluyendo:
- Skills pasivos que normalmente se activan por contexto
- Skills con trigger/comando slash
- Comandos de la carpeta `commands/`
- Sub-skills y agentes dentro de skills complejos

---

## Reglas Especificas

### 1. Antes de activar un skill
- Identificar el skill relevante para la tarea
- Consultar el archivo YAML correspondiente en `capabilities/`
- Informar al usuario que skill se quiere usar y por que
- Esperar confirmacion explicita ("si", "dale", "ok", "adelante")
- Si el usuario dice "no", respetar la decision y proceder sin el skill

### 2. Formato de solicitud de permiso
Cuando Claude identifique que un skill es relevante, debe preguntar asi:

```
Para esta tarea, el skill [NOMBRE] seria util porque puede:
- [capability 1 relevante]
- [capability 2 relevante]

Quieres que lo active?
```

### 3. No acumular skills sin permiso
- No activar multiples skills a la vez sin preguntar por cada uno
- Si se necesitan varios skills, listarlos todos y pedir confirmacion conjunta
- Ejemplo: "Para este proyecto Django necesitaria activar: django-patterns, django-security, y django-tdd. Los activo todos?"

### 4. Skills de seguridad
Los skills de categoria "Seguridad" (`security-review`, `security-scan`) tienen prioridad alta pero igualmente requieren confirmacion:
- Claude puede RECOMENDAR su uso activamente cuando detecte riesgo
- Pero no puede ejecutarlos sin permiso
- Ejemplo: "Detecto que estas manejando inputs de usuario sin validacion. Recomiendo activar security-review. Procedo?"

### 5. Skills destructivos o de alto impacto
Los siguientes skills requieren doble confirmacion por su impacto:
- `karpathy` - Ejecuta loops autonomos que consumen recursos
- `continuous-agent-loop` - Loop continuo de agentes
- `long-running-harness` - Harness multi-agente de larga duracion
- `ralphinho-rfc-pipeline` - Pipeline multi-agente complejo
- `sesh-acid-pipeline` - Pipeline de generacion de leads

Para estos: explicar el impacto potencial (tiempo, recursos, acciones) antes de solicitar permiso.

### 6. Comandos slash (carpeta commands/)
Los 43 comandos en `commands/` tambien requieren confirmacion:
- Si el usuario escribe directamente `/plan` o `/tdd`, se entiende como confirmacion implicita
- Si Claude sugiere usar un comando, debe pedir permiso primero

### 7. No mezclar skills incompatibles
- No activar `autonomous-loops` (deprecado) junto con `continuous-agent-loop`
- No activar skills de un framework sobre codigo de otro (ej: `django-patterns` en proyecto Spring Boot)
- Si hay conflicto, informar al usuario y dejar que decida

### 8. Desactivacion
- El usuario puede pedir desactivar un skill en cualquier momento
- Claude debe respetar inmediatamente sin preguntar "estas seguro?"
- No reactivar un skill desactivado sin nueva confirmacion explicita

### 9. Transparencia
- Siempre informar que skill esta activo en la sesion actual
- Si un skill influye en una recomendacion, mencionarlo
- No aplicar patrones de un skill silenciosamente

### 10. Registro de uso
- Si el usuario pregunta que skills se han usado, Claude debe poder listarlos
- Incluir cuando se activo y para que tarea

---

## Excepciones

La unica excepcion a la regla de confirmacion es cuando el usuario explicitamente ha dicho:
- "Usa todos los skills que necesites"
- "No me preguntes, solo hazlo"
- O una instruccion equivalente que otorgue permiso general

Incluso en este caso, los skills de alto impacto (regla 5) siguen requiriendo confirmacion individual.

---

## Resumen

| Situacion | Accion requerida |
|-----------|-----------------|
| Skill pasivo relevante detectado | Preguntar antes de activar |
| Usuario escribe comando slash | Confirmacion implicita, proceder |
| Claude sugiere comando slash | Preguntar antes de ejecutar |
| Skill de seguridad necesario | Recomendar activamente, pero preguntar |
| Skill de alto impacto | Explicar impacto + doble confirmacion |
| Multiple skills necesarios | Listar todos y pedir confirmacion conjunta |
| Usuario pide desactivar | Desactivar inmediatamente |
