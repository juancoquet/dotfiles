# dotfiles

## general tools
- [raycast](https://www.raycast.com/)
- [lunar](https://lunar.fyi/)
- [zen browser](https://zen-browser.app/download/)
- [ghostty](https://ghostty.org/download)
- [alt-tab](https://alt-tab-macos.netlify.app/)
- [shottr](https://shottr.cc/)
- [jetbrains mono nerd font](https://github.com/ryanoasis/nerd-fonts/releases/download/v3.3.0/JetBrainsMono.zip)
- [iosevka nerd font](https://github.com/ryanoasis/nerd-fonts/releases/download/v3.3.0/IosevkaTerm.zip)

## clone + install

```
git clone https://github.com/juancoquet/dotfiles.git ~/dotfiles
cd ~/dotfiles
./install.sh
```

`install.sh` symlinks every config in `configs/` into place and, if `sops`
is installed and your age key is present, decrypts `secrets.enc.yaml` into
`~/.config/dotfiles/secrets.env`. It's safe to re-run at any time. It will
refuse to overwrite a file at the destination that isn't already a symlink
(back that up / remove it yourself first). Agent config is the exception:
the first migration backs up existing files with a `.pre-dotfiles.<timestamp>`
suffix before linking the managed replacements.

## secrets

Real API keys (Context7, Brave Search, ...) are stored encrypted in
`secrets.enc.yaml` using [sops](https://github.com/getsops/sops) +
[age](https://github.com/FiloSottile/age), so the file is safe to commit
to this public repo.

- install the tools: `brew install sops age`
- restore your age private key to `~/.config/sops/age/dotfiles-key.txt`
  (back this up in a password manager - if you lose it, the secrets in
  this repo become permanently unrecoverable)
- run `./install.sh` to decrypt secrets into `~/.config/dotfiles/secrets.env`,
  which `configs/zshrc` sources automatically

To add or change a secret:

```
SOPS_AGE_KEY_FILE=~/.config/sops/age/dotfiles-key.txt sops secrets.enc.yaml
```

This opens the decrypted file in `$EDITOR` and re-encrypts on save. Recipients
are configured in `.sops.yaml`.

## bundled media

Files under `image-wallet/`, `sounds/`, and `wallpapers/` are third-party media
retained for personal use. Copyright remains with their original creators;
these files are not licensed for reuse or redistribution by this repository.

### keyboard

- install [karabiner](https://karabiner-elements.pqrs.org/).
- install [goku](https://github.com/yqrashawn/GokuRakuJoudo).

```
brew install yqrashawn/goku/goku
```

- make a profile in karabiner named `Default`
- run `GOKU_EDN_CONFIG_FILE='~/dotfiles/configs/karabiner.edn' goku`

### window management (yabai)

- install yabai + skhd

```
brew install yabai skhd jq
```

- enable services

```
yabai --start-service
skhd --start-service
```

- disable sip (required for scripting addition and move-to-space rules)
  - shut down, hold power until “options” appears, open recovery
  - in recovery: utilities -> terminal, then run `csrutil disable`
  - reboot normally
  - to re-enable later, repeat and run `csrutil enable`

- set nvram boot arg (required on apple silicon for scripting addition)

```
sudo nvram boot-args=-arm64e_preview_abi
```

  - reboot after setting this

- install scripting addition for space/window control (required for move-to-space rules)
  - add sudoers entry so yabai can load the scripting addition without a password:

```
echo “$(whoami) ALL=(root) NOPASSWD: sha256:$(shasum -a 256 $(which yabai) | cut -d “ “ -f 1) $(which yabai) --load-sa” | sudo tee /private/etc/sudoers.d/yabai
```

  - note: re-run this after every yabai update (the hash changes)

- `./install.sh` symlinks `configs/yabai` -> `~/.config/yabai` and
  `~/.yabairc`, and `configs/skhd` -> `~/.config/skhd` and `~/.skhdrc`

- disable space reordering in macos
  - system settings -> desktop & dock -> disable "automatically rearrange spaces based on most recent use"

- ensure there are 10 spaces
  - yabai can create spaces with `yabai -m space --create` (requires sip disabled)
  - if sip stays enabled, create 10 spaces manually and keep that setting disabled

### terminal

- install ohmyzsh:

> [!NOTE]
> if installing on ubuntu, first `zsh` itself must be installed with `(sudo) apt install zsh`

```bash
sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
```

- install starship:

```
brew install starship
```

- install plugins

```bash
git clone --depth 1 https://github.com/zsh-users/zsh-autosuggestions "${ZSH_CUSTOM:-~/.oh-my-zsh/custom}"/plugins/zsh-autosuggestions
git clone https://github.com/zsh-users/zsh-syntax-highlighting.git "${ZSH_CUSTOM:-~/.oh-my-zsh/custom}"/plugins/zsh-syntax-highlighting
git clone https://github.com/zshzoo/cd-ls ${ZDOTDIR:-~}/.zplugins/cd-ls
# macos
brew install pls-rs/pls/pls
# linux
sudo apt install build-essential
curl https://sh.rustup.rs -sSf | sh
cargo install --git https://github.com/pls-rs/pls
```

- `./install.sh` symlinks `configs/zshrc` -> `~/.zshrc` and
  `configs/ghostty` -> `~/.config/ghostty`
- disable last login dialogue: handled by `./install.sh` (symlinks
  `configs/starship/.hushlogin` -> `~/.hushlogin`)

### nvim
- install `node`

```
brew install node
```

- `./install.sh` symlinks `configs/nvim` -> `~/.config/nvim`

### obsidian

- install the [Vimrc Support](https://github.com/esm7/obsidian-vimrc-support) community plugin
- symlink the vimrc into your vault root (per-vault, so not handled by `install.sh`):

```
ln -s ~/dotfiles/configs/obsidian/vimrc /path/to/vault/.obsidian.vimrc
```

### opencode

```
brew install opencode
```

- `./install.sh` installs the individual config pieces
  (generated `opencode.json`, global instructions, agents, skills, and `themes/`) into
  `~/.config/opencode/` - not the whole directory, since opencode installs
  its own runtime state (`node_modules`, `tui.json`, ...) there too
- MCP server API keys are read from the secrets file - see [secrets](#secrets)

### agent harnesses

Shared configuration for Claude Code, Codex, Cursor, and opencode lives under
`configs/agents/`:

- `AGENTS.md` is the canonical global instruction file.
- `skills/` contains portable Agent Skills and is linked as a whole into each
  harness's native global skill location. opencode reads the canonical skills
  through its built-in compatibility paths.
- `agents/branch-reviewer/` contains the canonical branch-reviewer additions;
  its review procedure comes from `skills/review/SKILL.md`.
- `harnesses/` contains settings that are genuinely native to one harness.
- `mcp/servers.json` defines the shared Context7 and Linear MCP servers once.
  Harness-specific MCPs stay in the relevant native source under `harnesses/`,
  or in `configs/opencode/opencode.json` for opencode.
- `trackers/gh-issues/` contains the opt-in GitHub Issues priming package and
  setup instructions for repositories that use GitHub Issues. This dotfiles
  repository enables it through its project-local harness hooks; installation
  does not activate it globally for unrelated repositories.

`install.sh` renders native branch-reviewer, MCP, Cursor rule, Codex, and
opencode files into `~/.config/dotfiles/generated/agents/`, then links those
files into the harness directories. Claude's MCP entries are structurally
merged into `~/.claude.json` because that file also contains Claude-owned
runtime state. Generated destinations are not authoritative and should not be
edited directly; shared and harness-specific configuration belongs in this
repository. OAuth credentials, approvals, plugin state, and unrelated Claude
configuration remain harness-owned and survive installer reruns.

Context7 runs through a dotfiles-owned local launcher. The launcher reads
`CONTEXT7_API_KEY` from the process environment or from
`~/.config/dotfiles/secrets.env`, allowing GUI-launched harnesses to authenticate
without putting the key in generated configuration or process arguments.

Linear uses each harness's OAuth store. Authenticate once after first install:

```bash
claude mcp login linear
codex mcp login linear
cursor-agent mcp login linear
opencode mcp auth linear
```

List the installed servers with `claude mcp list`, `codex mcp list`,
`cursor-agent mcp list`, and `opencode mcp list`.

Validate canonical content and every generated target with:

```bash
configs/agents/scripts/check
```

The check validates every native JSON and TOML target, verifies the Claude
merge preserves unrelated state, and makes a real authenticated Context7 tool
call when `CONTEXT7_API_KEY` is available. It reports an explicit skip when the
credential has not been installed.

### vscode

- `./install.sh` symlinks `configs/vscode/.vscodevimrc` -> `~/.vscodevimrc`

### tmux
- install `tmux`

```
brew install tmux
```

- install tmux plugin manager

```
mkdir ~/.tmux/plugins/tpm
git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm
```

- `./install.sh` symlinks `configs/tmux` -> `~/.config/tmux`

- install tmux plugins (this will block the terminal for a bit)
```
# start a tmux session
tmux
# then do <prefix>I
```

### dock
- turn dock hiding on
- disable animation:

```bash
defaults write com.apple.dock autohide-time-modifier -int 0; killall Dock
```

### disable character accent menu

```bash
defaults write -g ApplePressAndHoldEnabled -bool false
```
