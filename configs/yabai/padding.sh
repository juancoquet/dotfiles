#!/usr/bin/env sh

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

event="${1:-}"

if [ -z "${PADDING_POSTRUN:-}" ]; then
  (sleep 0.2 && PADDING_POSTRUN=1 "$0" "$@") &
fi

focused_app=$(yabai -m query --windows --window | jq -r '.app')
space_windows=$(yabai -m query --windows --space | jq '[.[] | select((."is-visible" == 1 or ."is-visible" == true) and (."is-minimized" == 0 or ."is-minimized" == false))]')
space_window_count=$(printf '%s' "$space_windows" | jq 'length')
space_single_app=$(printf '%s' "$space_windows" | jq -r 'if length == 1 then .[0].app else empty end')
display_width=$(yabai -m query --displays --space | jq -r '.frame.w | floor')

max_width=$display_width
ghostty_width_mode="narrow"
if [ -f "$HOME/.config/yabai/.ghostty-width-mode" ]; then
  ghostty_width_mode=$(cat "$HOME/.config/yabai/.ghostty-width-mode")
fi

if [ "$space_single_app" = "Ghostty" ] || [ "$space_single_app" = "Telegram" ]; then
  if [ "$ghostty_width_mode" = "wide" ]; then
    max_width=2560
  elif [ "$ghostty_width_mode" = "narrow" ]; then
    max_width=1720
  else
    max_width=$display_width
  fi
elif [ "$space_single_app" = "Slack" ]; then
  max_width=1720
elif [ "$space_single_app" = "Zen Browser" ] || [ "$space_single_app" = "Zen" ]; then
  max_width=2560
fi

base_padding=4

if [ -n "$display_width" ]; then
  if [ "$display_width" -le "$max_width" ]; then
    side_padding=$base_padding
  else
    side_padding=$(( (display_width - max_width) / 2 ))
    if [ "$side_padding" -lt "$base_padding" ]; then
      side_padding=$base_padding
    fi
  fi

  yabai -m space --padding abs:$base_padding:$base_padding:$side_padding:$side_padding

  if [ "$display_width" -eq 3440 ]; then
    if [ "$space_window_count" -lt 3 ]; then
      yabai -m config split_type vertical
    elif [ "$space_window_count" -eq 3 ]; then
      yabai -m config split_type horizontal
      yabai -m space --balance
    else
      yabai -m config split_type horizontal
    fi
  else
    yabai -m config split_type auto
  fi

  if [ "$event" = "window_created" ] && [ "$display_width" -eq 3440 ] && [ "$space_window_count" -ge 3 ]; then
    next_window_id=$(printf '%s' "$space_windows" | jq -r '
      sort_by(.frame.x) as $wins |
      ($wins | map(.frame.x | floor) | unique) as $cols |
      if ($cols | length) < 2 then empty else
        ($wins | map(select(."has-focus" == true or ."has-focus" == 1)) | .[0].frame.x | floor) as $focused_col |
        ($cols | index($focused_col)) as $idx |
        if $idx == null then empty else
          $cols[(($idx + 1) % ($cols | length))]
        end as $target_col |
        ($wins | map(select((.frame.x | floor) == $target_col)) | .[0].id)
      end
    ')

    if [ -n "$next_window_id" ]; then
      yabai -m window --focus "$next_window_id"
    fi
  fi
fi
