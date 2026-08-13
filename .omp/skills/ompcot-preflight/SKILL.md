---
name: ompcot-preflight
description: Auditoría completa de Ompcot antes de publicar un release — corre los checks, la suite de tests y el smoke real de la app, y frena el release si algo sale en rojo. Usar cuando el usuario diga "auditoría antes de publicar", "chequeo a fondo", "¿está listo para el release?", "preflight", o antes de correr `bun run release`.
---

# Preflight de release

Siete puntos, en orden. **Si alguno sale en rojo se frena el release.** Esta
skill reporta, no arregla.

## 1. Repo limpio

```bash
git status --short
git rev-list --count refs/heads/main..origin/main
```

Nada sin commitear salvo lo que va en el release; el segundo comando tiene que
devolver `0`.

## 2. Tests

```bash
bun run test
```

0 fallos. Anotá el total de tests: no puede ser menor al del release anterior.

## 3. Lint y formato

```bash
bun run check
```

Exit 0. Los warnings de inline-style no bloquean.

## 4. Rust

```bash
bun run check:rust
```

Exit 0. Obligatorio si el release toca `src-tauri/`.

## 5. Bundle de la extensión

```bash
bun run build:extensions
```

Tiene que dejar `extensions/dist/embedded-server.mjs`.

## 6. Smoke real de la app

```bash
./run-dev.sh
```

En la app de verdad, en este orden:

1. Abrir un workspace.
2. Mandar un prompt y ver el streaming.
3. Abortar con Escape a mitad de turno.
4. Prender y apagar Plan mode: el badge aparece y desaparece.
5. Clickear Plan mode **durante** un turno: tiene que avisar, no quedarse mudo.
6. Probar un modelo desde el dropdown: devuelve latencia y stop reason.
7. Cambiar de modelo.
8. Cambiar de sesión: el badge de Plan mode se apaga solo.
9. Copiar un mensaje del asistente y pegarlo: conserva el markdown.
10. Achicar la ventana a ~700px con un turno largo en curso: ninguna burbuja se
    corta contra el borde derecho.

## 7. Versiones alineadas

```bash
grep -m1 '"version"' package.json src-tauri/tauri.conf.json
grep -m1 '^version' src-tauri/Cargo.toml
```

Los tres tienen que decir lo mismo.
