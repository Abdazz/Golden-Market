# Mémoire Claude Code du projet (copie)

Claude Code garde sa mémoire hors du dépôt, dans `~/.claude/projects/<dossier>/memory/` : elle ne
suit pas le projet d'un ordinateur à l'autre. Ce dossier en est une copie, mise à jour à chaque
modification de la mémoire. `README.md` ne fait pas partie de la mémoire.

## Installer sur un autre ordinateur

Depuis la racine du dépôt (`medusa-golden-market/`), avant d'ouvrir Claude Code :

```bash
DEST="$HOME/.claude/projects/$(pwd | sed 's#[/_.]#-#g')/memory"
mkdir -p "$DEST" && find docs/claude-memory -name '*.md' ! -name README.md -exec cp {} "$DEST/" \;
```

Le nom du dossier dépend du chemin du dépôt (chaque `/`, `_` ou `.` devient `-`). Si Claude Code
ne retrouve pas la mémoire, lui demander de lire `docs/claude-memory/MEMORY.md`.

## Mettre à jour la copie

Après chaque modification de la mémoire :

```bash
cp ~/.claude/projects/-home-abdazz-CODE-perso-golden-market-projects-medusa-golden-market/memory/*.md docs/claude-memory/
```

Aucun secret ici (le dépôt est public) : les mots de passe et jetons restent dans les `.env`, non
commités.
