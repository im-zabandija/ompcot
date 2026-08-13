---
name: ompcot-commit
description: Cierra una tarea en el repo Ompcot — corre los checks que correspondan a lo que se tocó, hace analizar el diff por un modelo más capaz antes de subir nada, arma el commit bilingüe (inglés + [ES]) del repo y deja la nota en BACKLOG.md. Usar cuando el usuario diga "cerrá la tarea", "commiteá esto", "subilo", "close task" o "commit".
---

# Cerrar una tarea en Ompcot

Cuatro fases en orden. No saltear ninguna. Si una falla, frenar ahí.

## Fase 1 — Checks según lo que se tocó

Mirá `git status --short` y corré **sólo** lo que aplique:

| Lo que tocaste | Comando |
|---|---|
| `public/**` o `extensions/**` (`.js` / `.ts`) | `bun run check` y `bun run test` |
| `extensions/**` | además `bun run build:extensions` |
| `src-tauri/**/*.rs` | `bun run check:rust` |
| Sólo `.md` | ninguno |

Nunca `cargo build` ni `tauri build`: política de `AGENTS.md`, no se usan
builds completos para verificar.

Todos tienen que dar exit 0. `bun run check` puede dejar warnings de
inline-style: esos no bloquean.

## Fase 2 — Análisis del diff por un modelo más capaz

Antes de commitear, mandá el diff a un subagente `reviewer-deep` (modelo más
potente que el que implementó) con esta consigna:

> Analizá este diff del repo Ompcot y decime, en criollo: ¿rompe algo de otra
> parte? ¿pisa trabajo de otra sesión? ¿toca archivos que no debería tocar?
> ¿tiene efectos colaterales no obvios? Respondé VERDE o ROJO y, si es ROJO,
> qué hay que arreglar antes de subir.

El diff sale de `git diff --staged`, o de `git diff` si no hay nada en stage.

Si vuelve **ROJO**: mostrale al usuario el problema en criollo y **no
commitees**. Esperá.

## Fase 3 — Commit bilingüe

Formato exacto del repo (`AGENTS.md`, sección `Commit messages`):

```
<type>(<scope>): <asunto en inglés, imperativo, ≤72 chars>

<cuerpo en inglés>

[ES]
<type>(<scope>): <asunto en español>

<cuerpo en español>
```

Reglas que no se negocian:

- La primera línea siempre en inglés.
- El separador es exactamente la línea `[ES]`, sola, con una línea en blanco
  antes y el asunto en español **inmediatamente** después.
- **Nunca** escribas una línea que sea exactamente `---`: `git format-patch` la
  toma como el límite entre mensaje y diff y `git am` descarta todo lo de
  abajo.
- No se traducen: rutas, identificadores, nombres de función, comandos, flags,
  versiones, SHAs, nombres de paquete/crate, ni strings de UI o de log.
- Las dos mitades tienen la misma estructura: mismos bullets, misma
  numeración, mismos saltos. Wrap a ≤76 columnas.
- Commit sin cuerpo: asunto en inglés, línea en blanco, `[ES]`, asunto en
  español, nada más.
- Agrupá por tema. Si hay tres temas distintos, son tres commits, no uno
  gigante.

## Fase 4 — Nota en el backlog

Mové el ítem correspondiente de `BACKLOG.md` a la sección
«🔄 En progreso / En revisión» y agregale una nota con este formato, que es el
que ya usan los ítems que están ahí:

```
      **Estado (AAAA-MM-DD):** qué se hizo y por qué, qué se descartó y por
      qué, qué tests lo cubren, y qué le falta chequear a ojo al usuario.
      Commit `<sha corto>`.
```

Si el ítem no existía en el backlog (fue un pedido de chat), agregalo ya
tildado en «✅ Hecho» bajo el encabezado de fecha correspondiente.
