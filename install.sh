#!/usr/bin/env bash
#
# Symlinks this repo's configs into place and decrypts secrets.enc.yaml
# (via sops+age) into ~/.config/dotfiles/secrets.env. Safe to re-run.

set -euo pipefail

DOTFILES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

TARGET_HOME="$HOME"
PROFILE="server"
[ "$(uname -s)" != Darwin ] || PROFILE="desktop"
SKIP_SECRETS=false
while [ "$#" -gt 0 ]; do
	case "$1" in
		--profile|--target-home)
			[ "$#" -ge 2 ] || { echo "missing value for $1" >&2; exit 2; }
			if [ "$1" = --profile ]; then PROFILE="$2"; else TARGET_HOME="$2"; fi
			shift 2
			;;
		--skip-secrets) SKIP_SECRETS=true; shift ;;
		--help)
			echo "usage: $0 [--profile desktop|server] [--target-home /absolute/path] [--skip-secrets]"
			exit 0
			;;
		*) echo "unknown option: $1" >&2; exit 2 ;;
	esac
done
case "$PROFILE" in desktop|server) ;; *) echo "invalid profile: $PROFILE" >&2; exit 2 ;; esac
case "$TARGET_HOME" in /*) ;; *) echo "--target-home must be an absolute path" >&2; exit 2 ;; esac
[ "$TARGET_HOME" != / ] || { echo "refusing to install into /" >&2; exit 2; }
if [ "$TARGET_HOME" != "$HOME" ] && [ "$SKIP_SECRETS" = false ]; then
	echo "use --skip-secrets when installing into an alternate home" >&2
	exit 2
fi
PYTHON="$DOTFILES_DIR/scripts/python"
"$PYTHON" -c 'import sys; import importlib; importlib.import_module("tomllib" if sys.version_info >= (3, 11) else "tomli"); importlib.import_module("typing" if sys.version_info >= (3, 10) else "typing_extensions")'

link() {
	local src="$DOTFILES_DIR/$1" dst="$2"
	mkdir -p "$(dirname "$dst")"
	if [ -e "$dst" ] && [ ! -L "$dst" ]; then
		echo "skip $dst (exists, not a symlink) - remove it manually to link"
		return
	fi
	ln -sfn "$src" "$dst"
	echo "linked $dst -> $src"
}

link_managed() {
	local src="$1" dst="$2" backup
	mkdir -p "$(dirname "$dst")"
	if [ -L "$dst" ]; then
		rm "$dst"
	elif [ -e "$dst" ]; then
		backup="$dst.pre-dotfiles.$(date +%Y%m%d%H%M%S)"
		mv "$dst" "$backup"
		echo "backed up $dst -> $backup"
	fi
	ln -s "$src" "$dst"
	echo "linked $dst -> $src"
}

ensure_runtime_dir() {
	local dir="$1"
	if [ -L "$dir" ]; then
		rm "$dir"
	fi
	mkdir -p "$dir"
}

remove_managed_link() {
	local target="$1" expected_source="$2"
	if [ -L "$target" ] && [ "$(readlink "$target")" = "$expected_source" ]; then
		rm "$target"
		echo "removed redundant link $target"
	fi
}

if [ "$PROFILE" = desktop ]; then
	link configs/ghostty "$TARGET_HOME/.config/ghostty"
	link configs/pi/extensions/factorio-research-complete.aiff "$TARGET_HOME/Library/Sounds/factorio-research-complete.aiff"
fi
link configs/nvim             "$TARGET_HOME/.config/nvim"
remove_managed_link "$TARGET_HOME/.pi/agent/extensions/review-comments.ts" "$DOTFILES_DIR/configs/pi/extensions/review-comments.ts"
link configs/pi/extensions/code-comments.ts "$TARGET_HOME/.pi/agent/extensions/code-comments.ts"
link configs/pi/extensions/notify-on-settled.ts "$TARGET_HOME/.pi/agent/extensions/notify-on-settled.ts"

# opencode manages its own runtime state (node_modules, tui.json, ...)
# inside ~/.config/opencode, so only the actual config pieces are linked,
# not the whole directory.
link configs/opencode/themes        "$TARGET_HOME/.config/opencode/themes"

# Shared agent content is authored once. Identical formats are linked directly;
# native subagent definitions and Cursor's global rule are rendered on install.
GENERATED_AGENTS="$TARGET_HOME/.config/dotfiles/generated/agents"
link_managed "$DOTFILES_DIR/configs/agents/scripts/context7-mcp" "$TARGET_HOME/.config/dotfiles/bin/context7-mcp"
DOTFILES_CONTEXT7_COMMAND="$TARGET_HOME/.config/dotfiles/bin/context7-mcp" \
	"$DOTFILES_DIR/configs/agents/scripts/render" "$GENERATED_AGENTS"

link_managed "$DOTFILES_DIR/configs/agents/AGENTS.md" "$TARGET_HOME/.claude/CLAUDE.md"
link_managed "$DOTFILES_DIR/configs/agents/AGENTS.md" "$TARGET_HOME/.codex/AGENTS.md"
link_managed "$DOTFILES_DIR/configs/agents/AGENTS.md" "$TARGET_HOME/.config/opencode/AGENTS.md"

link_managed "$DOTFILES_DIR/configs/agents/skills" "$TARGET_HOME/.agents/skills"
link_managed "$DOTFILES_DIR/configs/agents/skills" "$TARGET_HOME/.claude/skills"
link_managed "$DOTFILES_DIR/configs/agents/skills" "$TARGET_HOME/.cursor/skills"
remove_managed_link "$TARGET_HOME/.config/opencode/skills" "$DOTFILES_DIR/configs/agents/skills"

ensure_runtime_dir "$TARGET_HOME/.claude/agents"
ensure_runtime_dir "$TARGET_HOME/.codex/agents"
ensure_runtime_dir "$TARGET_HOME/.cursor/agents"
ensure_runtime_dir "$TARGET_HOME/.cursor/rules"
ensure_runtime_dir "$TARGET_HOME/.config/opencode/agent"
ensure_runtime_dir "$TARGET_HOME/.pi/agent/agents"

remove_managed_link "$TARGET_HOME/.pi/agent/agents/researcher.md" "$GENERATED_AGENTS/pi/agents/researcher.md"
remove_managed_link "$TARGET_HOME/.claude/agents/researcher.md" "$GENERATED_AGENTS/claude/agents/researcher.md"
remove_managed_link "$TARGET_HOME/.codex/agents/researcher.toml" "$GENERATED_AGENTS/codex/agents/researcher.toml"
remove_managed_link "$TARGET_HOME/.cursor/agents/researcher.md" "$GENERATED_AGENTS/cursor/agents/researcher.md"
remove_managed_link "$TARGET_HOME/.config/opencode/agent/researcher.md" "$GENERATED_AGENTS/opencode/agent/researcher.md"

link_managed "$GENERATED_AGENTS/pi/agents/branch-reviewer.md" "$TARGET_HOME/.pi/agent/agents/branch-reviewer.md"
link_managed "$GENERATED_AGENTS/pi/agents/primary-source-researcher.md" "$TARGET_HOME/.pi/agent/agents/primary-source-researcher.md"
link_managed "$GENERATED_AGENTS/claude/agents/branch-reviewer.md" "$TARGET_HOME/.claude/agents/branch-reviewer.md"
link_managed "$GENERATED_AGENTS/claude/agents/primary-source-researcher.md" "$TARGET_HOME/.claude/agents/primary-source-researcher.md"
link_managed "$GENERATED_AGENTS/codex/agents/branch-reviewer.toml" "$TARGET_HOME/.codex/agents/branch-reviewer.toml"
link_managed "$GENERATED_AGENTS/codex/agents/primary-source-researcher.toml" "$TARGET_HOME/.codex/agents/primary-source-researcher.toml"
link_managed "$GENERATED_AGENTS/cursor/agents/branch-reviewer.md" "$TARGET_HOME/.cursor/agents/branch-reviewer.md"
link_managed "$GENERATED_AGENTS/cursor/agents/primary-source-researcher.md" "$TARGET_HOME/.cursor/agents/primary-source-researcher.md"
link_managed "$GENERATED_AGENTS/cursor/rules/global-agent-instructions.mdc" "$TARGET_HOME/.cursor/rules/global-agent-instructions.mdc"
link_managed "$GENERATED_AGENTS/cursor/mcp.json" "$TARGET_HOME/.cursor/mcp.json"
link_managed "$GENERATED_AGENTS/opencode/agent/branch-reviewer.md" "$TARGET_HOME/.config/opencode/agent/branch-reviewer.md"
link_managed "$GENERATED_AGENTS/opencode/agent/primary-source-researcher.md" "$TARGET_HOME/.config/opencode/agent/primary-source-researcher.md"
link_managed "$GENERATED_AGENTS/opencode/opencode.json" "$TARGET_HOME/.config/opencode/opencode.json"
link_managed "$DOTFILES_DIR/configs/opencode/agent/sidekick.md" "$TARGET_HOME/.config/opencode/agent/sidekick.md"

link_managed "$DOTFILES_DIR/configs/agents/harnesses/claude/settings.json" "$TARGET_HOME/.claude/settings.json"
"$PYTHON" "$DOTFILES_DIR/configs/agents/scripts/install-claude-mcp" \
	"$GENERATED_AGENTS/claude/mcp.json" \
	"$TARGET_HOME/.claude.json" \
	"$TARGET_HOME/.config/dotfiles/state/claude-mcp.json"
echo "merged managed MCP servers into $TARGET_HOME/.claude.json"
link_managed "$GENERATED_AGENTS/codex/config.toml" "$TARGET_HOME/.codex/config.toml"

if [ "$PROFILE" = desktop ]; then
	link configs/skhd "$TARGET_HOME/.config/skhd"
	link configs/skhd/skhdrc "$TARGET_HOME/.skhdrc"
	link configs/vscode/.vscodevimrc "$TARGET_HOME/.vscodevimrc"
	link configs/yabai "$TARGET_HOME/.config/yabai"
	link configs/yabai/yabairc "$TARGET_HOME/.yabairc"
fi
link configs/starship/starship.toml "$TARGET_HOME/.config/starship.toml"
link configs/starship/.hushlogin    "$TARGET_HOME/.hushlogin"
link configs/tmux             "$TARGET_HOME/.config/tmux"
link configs/zshrc            "$TARGET_HOME/.zshrc"
link configs/zshenv           "$TARGET_HOME/.zshenv"

# karabiner.edn isn't symlinked - goku reads it directly via
# GOKU_EDN_CONFIG_FILE, see README.

if [ "$SKIP_SECRETS" = true ]; then
	echo "secrets decryption skipped"
	exit 0
fi

echo
export SOPS_AGE_KEY_FILE="${SOPS_AGE_KEY_FILE:-$TARGET_HOME/.config/sops/age/dotfiles-key.txt}"
if ! command -v sops >/dev/null 2>&1; then
	echo "sops not installed - skipping secrets decryption (brew install sops age)"
elif [ ! -f "$SOPS_AGE_KEY_FILE" ]; then
	echo "no age key at $SOPS_AGE_KEY_FILE - restore it from your password manager, then re-run this script"
else
	mkdir -p "$TARGET_HOME/.config/dotfiles"
	sops -d --output-type dotenv "$DOTFILES_DIR/secrets.enc.yaml" >"$TARGET_HOME/.config/dotfiles/secrets.env"
	chmod 600 "$TARGET_HOME/.config/dotfiles/secrets.env"
	echo "decrypted secrets -> $TARGET_HOME/.config/dotfiles/secrets.env"
fi
