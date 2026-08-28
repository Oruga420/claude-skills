# SKETCH-LANG — Lenguaje de anotacion para bocetos

Spec del lenguaje visual que convierte una foto de un boceto en un spec ejecutable.
Lo consume `/appbuilder` via `spec.json`. Sin em dashes en ningun output.

## Principio

Tres ejes **ortogonales**. Cada uno responde una pregunta distinta, asi que se
combinan sin colisionar:

| Eje | Pregunta que responde |
|---|---|
| Color | en que capa del repo aterriza |
| Glifo | que pasa en runtime |
| Contenedor | hasta donde llega el alcance |

Un mismo trazo puede llevar los tres: una caja punteada morada con un robot es
"un agente, que decide solo, con su propio set de skills y tools".

## Eje 1 — Color: en que capa aterriza

| Color | En el boceto significa | Se vuelve en el repo |
|---|---|---|
| Negro | logica determinista | `tools/` — funcion pura, con unit test |
| Morado | juicio, criterio, "depende" | `skills/` o `agents/` — subagente |
| Azul | superficie visible | `app/` — componente React |
| Verde | valor que cambia | variable al prompt, env var, o prop |
| Rojo | punto de decision | branch (el glifo dice quien decide) |
| Naranja | algo fuera de la app | MCP server o cliente de API |

Set de 6 boligrafos estandar. Cabe en una cartuchera.

**Regla del negro**: el negro es lo unico que se codea imperativo. Si no es negro,
no lo escribas a mano.

## Eje 2 — Glifo: que pasa en runtime

| Glifo | Como se dibuja | Significado |
|---|---|---|
| Carita redonda | circulo con dos puntos y arco | detente, espera respuesta humana |
| Cara cuadrada | cuadrado con dos puntos y linea recta | el agente decide solo |
| Flecha circular | circulo con punta de flecha | loop hasta cumplir el goal |
| Check en caja | cuadrito con una palomita | gate duro, criterio de aceptacion |
| Signo de pregunta | `?` | no lo decidi: propone opciones y pregunta |
| Llave | llave simple | secreto, va a `vercel env add`, nunca al commit |
| Doble barra | `//` | corre en paralelo |

Carita redonda contra cara cuadrada: la forma exterior es la senal, no la
expresion. Redonda es humano, cuadrada es maquina. Se distingue bajo compresion
mucho mejor que dos caras que solo difieren en la boca.

## Eje 3 — Contenedor: hasta donde llega el alcance

| Trazo | Significado |
|---|---|
| Caja solida | limite de componente UI |
| Caja punteada | limite de un agente (su skill mas sus tools) |
| Caja doble | fase de workflow (barrera: todo lo de adentro termina antes de seguir) |
| Tachado | fuera de alcance, ignoralo |
| Digitos en circulo | orden de construccion |

El tachado existe porque en un boceto a medio hacer cambiaste de opinion a la
mitad y el dibujo viejo sigue en el papel.

## Reglas de resolucion

Estas reglas evitan que una anotacion ambigua se ejecute a ciegas.

1. **Rojo sin glifo** = el agente decide y escribe la decision en `wiki/log.md`.
   Nunca se detiene, pero siempre queda registro.
2. **Confianza por anotacion**: el extractor asigna 0.0 a 1.0 a cada anotacion.
   Por debajo de 0.7 la anotacion se degrada a `?` y se pregunta. Un glifo mal
   leido nunca se ejecuta.
3. **Color ausente o ilegible** (lapiz, foto en blanco y negro): se asume azul si
   es una caja de layout, negro si es texto de proceso. Se registra el supuesto.
4. **Conflicto entre color y glifo**: gana el glifo. El glifo es control de flujo
   y es mas barato de dibujar bien que el color correcto.
5. **Todo lo que no esta anotado sigue siendo spec.** Una caja sin color es UI.
   El lenguaje agrega semantica, no la exige.

## Como fotografiar

- Manda la foto **como documento o archivo**, no como foto, si el canal comprime
  (Telegram lo hace). El detalle fino de los glifos se pierde con compresion.
- Luz difusa y plana. La luz calida de cuarto corre los colores hacia el rojo y
  es la causa mas probable de confundir morado con azul.
- El papel llenando el encuadre, sin sombra de la mano encima.

## Caption

El texto que acompana la foto define proyecto y destino:

```
work: dashboard de ocupacion
personal: tracker de habitos
```

`work:` va a `~/Desktop/<work_prefix><nombre>`, `personal:` a
`~/Desktop/<personal_prefix><nombre>`. Los dos prefijos salen del perfil que
lee el Paso 0.5 (ver `PROFILE.template.md`); si no hay perfil, se preguntan.

Si falta el prefijo en el caption, se pregunta antes de crear nada. El perfil
guarda los prefijos, nunca cual de los dos aplica hoy: eso se pregunta cada vez.

## Lamina de leyenda (para imprimir y tener junto al papel)

```
COLOR = en que capa aterriza
  negro    logica          -> tool (funcion pura + test)
  morado   juicio          -> skill / agente
  azul     lo visible      -> componente React
  verde    valor variable  -> va al prompt / env
  rojo     decision        -> branch
  naranja  fuera de la app -> MCP / API

GLIFO = que pasa en runtime
  (:)  carita redonda   espera al humano
  [:]  cara cuadrada    decide el agente
   O>  flecha circular  loop hasta el goal
  [v]  check en caja    gate verificable
   ?   pregunta         no decidido, propone y pregunta
  -o   llave            secreto -> env, nunca commit
  //   doble barra      en paralelo

CONTENEDOR = alcance
  ___  solida     componente UI
  - -  punteada   un agente y sus tools
  ===  doble      fase de workflow
  xxx  tachado    fuera de alcance
  (1)  numero     orden de construccion

Rojo solo = decide el agente y lo escribe en el log.
Dudoso = se vuelve pregunta, no suposicion.
```
