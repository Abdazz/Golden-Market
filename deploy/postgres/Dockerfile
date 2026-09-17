# Image Postgres avec l'extension pgvector, requise par la recherche
# sémantique produits (voir docs/superpowers/specs/2026-09-17-recherche-semantique-produits-design.md).
#
# Reste sur postgres:16-alpine (musl) plutôt que de basculer vers l'image
# officielle pgvector/pgvector:pg16 (glibc) : changer la libc d'un volume de
# données déjà initialisé change la collation des index texte et exigerait
# un REINDEX DATABASE sur les environnements existants. Ici, seule
# l'extension est ajoutée par-dessus l'image existante - aucun changement de
# collation, aucune migration de volume nécessaire.
#
# Alpine 3.24 ne fournit pas de paquet pgvector compilé pour PostgreSQL 16
# (seul un paquet générique "postgresql-pgvector" existe, qui tire
# PostgreSQL 18 en dépendance et installe l'extension au mauvais endroit) -
# compilée ici depuis les sources officielles à la place. clang21/llvm21
# sont nécessaires uniquement parce que ce build de PostgreSQL 16.15 a été
# compilé avec le support JIT (LLVM bitcode) ; purement des dépendances de
# build, retirées ensuite via `apk del .build-deps`. Vérifié manuellement :
# `CREATE EXTENSION vector` et un calcul de distance cosinus fonctionnent
# dans l'image finale.
FROM postgres:16-alpine

RUN apk add --no-cache --virtual .build-deps \
      git build-base clang21 llvm21 postgresql16-dev \
  && git clone --branch v0.8.1 --depth 1 https://github.com/pgvector/pgvector.git /tmp/pgvector \
  && cd /tmp/pgvector \
  && make OPTFLAGS="" \
  && make install \
  && cd / \
  && rm -rf /tmp/pgvector \
  && apk del .build-deps
