#!/usr/bin/env bash
# Chequeo de forks/upstreams de Ompcot. Sin argumentos, sólo lectura.
#
# OJO: este repo tiene un tag llamado `main` además de la rama, así que todas
# las comparaciones usan `refs/heads/main`. Con `main` pelado git tira
# "refname 'main' is ambiguous" y devuelve números equivocados.
set -uo pipefail

cd "$(git rev-parse --show-toplevel)" || exit 1

git fetch --all -q 2>/dev/null

echo "== Remotos =="
for r in $(git remote); do
  ref="refs/remotes/$r/main"
  if ! git rev-parse --verify -q "$ref" >/dev/null; then
    printf '%-10s (sin rama main)\n' "$r"
    continue
  fi
  nuestros=$(git rev-list --count "$ref..refs/heads/main")
  nuevos=$(git rev-list --count "refs/heads/main..$ref")
  ultimo=$(git log -1 --format='%ad %s' --date=short "$ref")
  printf '%-10s nuestros=+%-4s nuevos=%-5s ultimo: %s\n' "$r" "$nuestros" "$nuevos" "$ultimo"
done

# picot es el único linaje vivo. Su capa de extensión migró a Pi y no nos
# sirve; lo que compartimos es `public/`, así que filtramos por ahí.
if git rev-parse --verify -q refs/remotes/picot/main >/dev/null; then
  echo
  echo "== picot: commits nuevos que tocan public/ =="
  git log --oneline --no-merges refs/heads/main..refs/remotes/picot/main -- public/ | head -40
fi

echo
echo "== Runtime OMP local =="
omp --version 2>/dev/null || echo "omp no está en PATH"
