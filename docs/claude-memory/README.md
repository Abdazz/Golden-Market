# Mémoire Claude Code du projet

Claude Code garde la mémoire de chaque projet dans `~/.claude/projects/<dossier>/memory/`, hors du
dépôt. Pour la partager entre ordinateurs, ce dossier-là est remplacé par un **lien symbolique vers
`docs/claude-memory/`** : Claude Code écrit directement ici, et git fait la synchronisation (commit,
push, puis `git pull` sur l'autre ordinateur). Seul ce projet est concerné. `README.md` ne fait pas
partie de la mémoire.

## Mettre en place le lien (une fois par ordinateur)

Depuis la racine du dépôt (`medusa-golden-market/`), Claude Code fermé ou en dehors d'une session :

```bash
git pull
DIR="$HOME/.claude/projects/$(pwd | sed 's#[/_.]#-#g')"
mkdir -p "$DIR"
if [ -d "$DIR/memory" ] && [ ! -L "$DIR/memory" ]; then
  # Mémoire locale existante : la garder de côté, puis fusionner ses fichiers à la main
  # (ou demander à Claude Code de le faire) dans docs/claude-memory/ et MEMORY.md.
  mv "$DIR/memory" "$DIR/memory.bak-$(date +%Y%m%d)"
fi
ln -sfn "$(pwd)/docs/claude-memory" "$DIR/memory"
```

Le nom du dossier dépend du chemin du dépôt (chaque `/`, `_` ou `.` devient `-`).

## Au quotidien

- Début de session : `git pull` (mémoires écrites sur l'autre ordinateur).
- Fin de lot : commiter `docs/claude-memory/` avec le reste.
- Aucun secret ici (le dépôt est public) : mots de passe et jetons restent dans les `.env`.
