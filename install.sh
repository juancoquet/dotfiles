#!/usr/bin/env bash
#
# Symlinks this repo's configs into place and decrypts secrets.enc.yaml
# (via sops+age) into ~/.config/dotfiles/secrets.env. Safe to re-run.

set -euo pipefail

DOTFILES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

for candidate in python3.13 python3.12 python3.11; do
	if command -v "$candidate" >/dev/null 2>&1; then
		PYTHON="$candidate"
		break
	fi
done

if [ -z "${PYTHON:-}" ]; then
	echo "Python 3.11 or newer is required to install agent configuration" >&2
	exit 1
fi

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

link configs/ghostty          "$HOME/.config/ghostty"
link configs/nvim             "$HOME/.config/nvim"

# opencode manages its own runtime state (node_modules, tui.json, ...)
# inside ~/.config/opencode, so only the actual config pieces are linked,
# not the whole directory.
link configs/opencode/themes        "$HOME/.config/opencode/themes"

# Shared agent content is authored once. Identical formats are linked directly;
# native subagent definitions and Cursor's global rule are rendered on install.
GENERATED_AGENTS="$HOME/.config/dotfiles/generated/agents"
link_managed "$DOTFILES_DIR/configs/agents/scripts/context7-mcp" "$HOME/.config/dotfiles/bin/context7-mcp"
"$DOTFILES_DIR/configs/agents/scripts/render" "$GENERATED_AGENTS"

link_managed "$DOTFILES_DIR/configs/agents/AGENTS.md" "$HOME/.claude/CLAUDE.md"
link_managed "$DOTFILES_DIR/configs/agents/AGENTS.md" "$HOME/.codex/AGENTS.md"
link_managed "$DOTFILES_DIR/configs/agents/AGENTS.md" "$HOME/.config/opencode/AGENTS.md"

link_managed "$DOTFILES_DIR/configs/agents/skills" "$HOME/.agents/skills"
link_managed "$DOTFILES_DIR/configs/agents/skills" "$HOME/.claude/skills"
link_managed "$DOTFILES_DIR/configs/agents/skills" "$HOME/.cursor/skills"
remove_managed_link "$HOME/.config/opencode/skills" "$DOTFILES_DIR/configs/agents/skills"

ensure_runtime_dir "$HOME/.claude/agents"
ensure_runtime_dir "$HOME/.codex/agents"
ensure_runtime_dir "$HOME/.cursor/agents"
ensure_runtime_dir "$HOME/.cursor/rules"
ensure_runtime_dir "$HOME/.config/opencode/agent"

link_managed "$GENERATED_AGENTS/claude/agents/branch-reviewer.md" "$HOME/.claude/agents/branch-reviewer.md"
link_managed "$GENERATED_AGENTS/codex/agents/branch-reviewer.toml" "$HOME/.codex/agents/branch-reviewer.toml"
link_managed "$GENERATED_AGENTS/cursor/agents/branch-reviewer.md" "$HOME/.cursor/agents/branch-reviewer.md"
link_managed "$GENERATED_AGENTS/cursor/rules/global-agent-instructions.mdc" "$HOME/.cursor/rules/global-agent-instructions.mdc"
link_managed "$GENERATED_AGENTS/cursor/mcp.json" "$HOME/.cursor/mcp.json"
link_managed "$GENERATED_AGENTS/opencode/agent/branch-reviewer.md" "$HOME/.config/opencode/agent/branch-reviewer.md"
link_managed "$GENERATED_AGENTS/opencode/opencode.json" "$HOME/.config/opencode/opencode.json"
link_managed "$DOTFILES_DIR/configs/opencode/agent/sidekick.md" "$HOME/.config/opencode/agent/sidekick.md"

link_managed "$DOTFILES_DIR/configs/agents/harnesses/claude/settings.json" "$HOME/.claude/settings.json"
"$PYTHON" "$DOTFILES_DIR/configs/agents/scripts/install-claude-mcp" \
	"$GENERATED_AGENTS/claude/mcp.json" \
	"$HOME/.claude.json" \
	"$HOME/.config/dotfiles/state/claude-mcp.json"
echo "merged managed MCP servers into $HOME/.claude.json"
link_managed "$GENERATED_AGENTS/codex/config.toml" "$HOME/.codex/config.toml"

link configs/skhd             "$HOME/.config/skhd"
link configs/skhd/skhdrc      "$HOME/.skhdrc"
link configs/starship/starship.toml "$HOME/.config/starship.toml"
link configs/starship/.hushlogin    "$HOME/.hushlogin"
link configs/tmux             "$HOME/.config/tmux"
link_managed "$DOTFILES_DIR/configs/pi/bin/piw" "$HOME/.local/bin/piw"
link_managed "$DOTFILES_DIR/configs/pi/bin/piw-picker" "$HOME/.local/bin/piw-picker"
link_managed "$DOTFILES_DIR/configs/pi/bin/piw-nvim" "$HOME/.local/bin/piw-nvim"
link_managed "$DOTFILES_DIR/configs/pi/extensions/pi-workspace-manager.ts" "$HOME/.pi/agent/extensions/pi-workspace-manager.ts"
link configs/vscode/.vscodevimrc "$HOME/.vscodevimrc"
link configs/yabai            "$HOME/.config/yabai"
link configs/yabai/yabairc    "$HOME/.yabairc"
link configs/zshrc            "$HOME/.zshrc"

# karabiner.edn isn't symlinked - goku reads it directly via
# GOKU_EDN_CONFIG_FILE, see README.

echo
export SOPS_AGE_KEY_FILE="${SOPS_AGE_KEY_FILE:-$HOME/.config/sops/age/dotfiles-key.txt}"
if ! command -v sops >/dev/null 2>&1; then
	echo "sops not installed - skipping secrets decryption (brew install sops age)"
elif [ ! -f "$SOPS_AGE_KEY_FILE" ]; then
	echo "no age key at $SOPS_AGE_KEY_FILE - restore it from your password manager, then re-run this script"
else
	mkdir -p "$HOME/.config/dotfiles"
	sops -d --output-type dotenv "$DOTFILES_DIR/secrets.enc.yaml" >"$HOME/.config/dotfiles/secrets.env"
	chmod 600 "$HOME/.config/dotfiles/secrets.env"
	echo "decrypted secrets -> $HOME/.config/dotfiles/secrets.env"
fi
