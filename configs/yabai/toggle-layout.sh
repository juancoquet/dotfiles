#!/usr/bin/env sh

layout=$(yabai -m query --spaces --space | jq -r '.type')
if [ "$layout" = "bsp" ]; then
  yabai -m space --layout stack
else
  yabai -m space --layout bsp
fi
