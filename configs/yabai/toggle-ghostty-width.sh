#!/usr/bin/env sh

state_file="$HOME/.config/yabai/.ghostty-width-mode"

current_mode="regular"
if [ -f "$state_file" ]; then
  current_mode=$(cat "$state_file")
fi

if [ "$current_mode" = "narrow" ]; then
  echo "wide" > "$state_file"
elif [ "$current_mode" = "wide" ]; then
  echo "regular" > "$state_file"
else
  echo "narrow" > "$state_file"
fi

# trigger padding recalculation
"$HOME/.config/yabai/padding.sh"
