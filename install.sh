#!/usr/bin/env bash
#
# Symlinks this repo's configs into place and decrypts secrets.enc.yaml
# (via sops+age) into ~/.config/dotfiles/secrets.env. Safe to re-run.

set -euo pipefail

DOTFILES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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

link configs/ghostty          "$HOME/.config/ghostty"
link configs/nvim             "$HOME/.config/nvim"

# opencode manages its own runtime state (node_modules, tui.json, ...)
# inside ~/.config/opencode, so only the actual config pieces are linked,
# not the whole directory.
link configs/opencode/opencode.json "$HOME/.config/opencode/opencode.json"
link configs/opencode/AGENTS.md     "$HOME/.config/opencode/AGENTS.md"
link configs/opencode/agent         "$HOME/.config/opencode/agent"
link configs/opencode/themes        "$HOME/.config/opencode/themes"

link configs/skhd             "$HOME/.config/skhd"
link configs/skhd/skhdrc      "$HOME/.skhdrc"
link configs/starship/starship.toml "$HOME/.config/starship.toml"
link configs/starship/.hushlogin    "$HOME/.hushlogin"
link configs/tmux             "$HOME/.config/tmux"
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
