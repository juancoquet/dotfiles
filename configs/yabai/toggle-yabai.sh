#!/usr/bin/env sh

if yabai -m query --spaces >/dev/null 2>&1; then
  yabai --stop-service
else
  yabai --start-service
fi
