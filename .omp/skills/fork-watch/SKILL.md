---
name: fork-watch
description: Chequea el estado de los forks y upstreams de Ompcot y decide si hay algo que traer. Usar cuando el usuario diga "chequeá los forks", "cómo están los repos de arriba", "¿picot sacó algo nuevo?", "mirá el upstream", "check forks", o al abrir una sesión de trabajo sobre el repo. Sólo lectura: nunca mergea ni cherry-pickea por su cuenta.
---

# Fork watch

Chequeo del linaje de Ompcot. Corre en menos de un minuto y termina en una
recomendación, no en un merge.

## El linaje, verificado el 2026-08-12

- `origin` → `im-zabandija/ompcot`. El nuestro.
- `picot` → `shixin-guo/picot`. **El único vivo.** Último commit 2026-08-02.
  Se bifurcó: migró de OMP a Pi, así que su `extensions/` ya no nos sirve.
  Su `public/` sí: es nuestro mismo linaje de vanilla JS.
- `upstream` → `kyle-kw/ompcot`. **Congelado** desde 2026-07-01, su último
  commit ya está en nuestra historia. Vigilarlo es vigilar un repo muerto.
- `zephyrq` → `zephyrq-z/ompcot`. Muerto desde 2026-06-29.

## Correr el chequeo

```bash
bash .omp/skills/fork-watch/scripts/fork-check.sh
```

Imprime, por remoto, cuántos commits tenemos nosotros de más y cuántos tiene
él de nuevos, la fecha del último commit remoto, la lista de commits nuevos de
`picot` que tocan `public/`, y la versión del runtime OMP instalado.

## Qué hacer con el resultado

1. **`picot` sin commits nuevos que toquen `public/`** → no hay nada que hacer.
   Decilo en una línea y seguí.
2. **Hay commits nuevos** → mirá el diff de los que suenen relevantes
   (`git show <sha> -- public/`) y clasificalos:
   - Arreglo de un bug que también tenemos → proponerlo con el sha y el
     archivo, sin aplicarlo todavía.
   - Feature que nos interesa → **anotarlo en `BACKLOG.md`** como candidato,
     en la sección que corresponda, con el sha entre backticks y una línea de
     por qué serviría. No implementarlo en la misma sesión.
   - Cosas de la capa Pi (`extensions/pi-chat-src/`, `pi-web`, credenciales de
     Pi) → ignorar, no es nuestro runtime.
3. **La versión del runtime OMP saltó** respecto de la última vez → revisar si
   algún comando o evento que usamos cambió, mirando `omp --help`.

## Reglas

- Nunca `git merge` ni `git cherry-pick` desde otro fork sin que el usuario lo
  pida explícitamente: los forks divergieron de arquitectura y un merge crudo
  rompe la extensión.
- Nunca agregues un remoto nuevo por tu cuenta.
- Si `git fetch` falla por auth, frená y avisá; no reportes "0 commits nuevos"
  con datos viejos.
