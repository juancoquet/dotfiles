#!/usr/bin/env python3
"""Generate a keyboard layout from keymap.lua's `keylayout` table.

The layout copies a macOS layout and replaces its option layer, so the symbol
layer works in password fields, where Hammerspoon's event tap cannot run.
"""

import ctypes
import os
import re
import struct
import subprocess
import sys
import time
from pathlib import Path

MARKER = "Generated from configs/hammerspoon/keymap.lua. Do not edit."
NAME = "British Layers"
LAYOUT_ID = "-22721"

# virtual key codes, matching hs.keycodes.map
KEY_CODES = {
    "a": 0, "s": 1, "d": 2, "f": 3, "h": 4, "g": 5, "z": 6, "x": 7, "c": 8, "v": 9,
    "b": 11, "q": 12, "w": 13, "e": 14, "r": 15, "y": 16, "t": 17,
    "1": 18, "2": 19, "3": 20, "4": 21, "6": 22, "5": 23, "=": 24, "9": 25,
    "7": 26, "-": 27, "8": 28, "0": 29, "]": 30, "o": 31, "u": 32, "[": 33,
    "i": 34, "p": 35, "l": 37, "j": 38, "'": 39, "k": 40, ";": 41, "\\": 42,
    ",": 43, "/": 44, "n": 45, "m": 46, ".": 47, "`": 50,
}
QUOTE_CODE = 39
ESCAPE_CODE = 53
F17_CODE = 64
F18_CODE = 79
MODIFIERS = {
    "": "",
    "shift": "anyShift",
    "option": "anyOption",
    "shift+option": "anyShift anyOption",
    "caps": "caps",
    "caps+shift": "caps anyShift",
    "caps+option": "caps anyOption",
    "caps+shift+option": "caps anyShift anyOption",
}
OPTION_LAYERS = {"option", "shift+option", "caps+option", "caps+shift+option"}


def parse_keymap(path):
    text = path.read_text()
    block = re.search(r"\n\tkeylayout = \{(?P<body>.*?)\n\t\},", text, re.S)
    if not block:
        raise SystemExit(f"{path} has no keylayout table")
    body = block.group("body")
    base = re.search(r'base = "([^"]+)"', body)
    if not base:
        raise SystemExit(f"{path} keylayout has no base")
    option = {}
    for match in re.finditer(r'(?:\["(.+?)"\]|([^\s={},]+))\s*=\s*"((?:\\.|[^"\\])*)"', body):
        key = match.group(1) or match.group(2)
        if key == "base":
            continue
        option[key] = bytes(match.group(3), "utf-8").decode("unicode_escape")
    if not option:
        raise SystemExit(f"{path} keylayout has no option layer")
    return base.group(1), option


def chord(text):
    parts = text.split("+")
    key = parts[-1]
    mods = set(parts[:-1])
    if key not in KEY_CODES or not mods <= {"shift"}:
        raise SystemExit(f"unsupported keylayout chord: {text}")
    return key, mods


class Layout:
    def __init__(self):
        carbon = ctypes.CDLL("/System/Library/Frameworks/Carbon.framework/Carbon")
        cf = ctypes.CDLL("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation")
        self.carbon = carbon
        self.cf = cf

        def data_symbol(library, name):
            return ctypes.c_void_p.in_dll(library, name)

        cf.CFDictionaryCreate.restype = ctypes.c_void_p
        cf.CFDictionaryCreate.argtypes = [
            ctypes.c_void_p, ctypes.POINTER(ctypes.c_void_p), ctypes.POINTER(ctypes.c_void_p),
            ctypes.c_long, ctypes.c_void_p, ctypes.c_void_p,
        ]
        cf.CFArrayGetCount.restype = ctypes.c_long
        cf.CFArrayGetCount.argtypes = [ctypes.c_void_p]
        cf.CFArrayGetValueAtIndex.restype = ctypes.c_void_p
        cf.CFArrayGetValueAtIndex.argtypes = [ctypes.c_void_p, ctypes.c_long]
        cf.CFStringGetCString.restype = ctypes.c_bool
        cf.CFStringGetCString.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_long, ctypes.c_uint32]
        carbon.TISCreateInputSourceList.restype = ctypes.c_void_p
        carbon.TISCreateInputSourceList.argtypes = [ctypes.c_void_p, ctypes.c_bool]
        carbon.TISGetInputSourceProperty.restype = ctypes.c_void_p
        carbon.TISGetInputSourceProperty.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
        carbon.UCKeyTranslate.restype = ctypes.c_int32
        carbon.UCKeyTranslate.argtypes = [
            ctypes.c_void_p, ctypes.c_uint16, ctypes.c_uint16, ctypes.c_uint32, ctypes.c_uint32,
            ctypes.c_uint32, ctypes.POINTER(ctypes.c_uint32), ctypes.c_long,
            ctypes.POINTER(ctypes.c_long), ctypes.POINTER(ctypes.c_uint16),
        ]
        carbon.LMGetKbdType.restype = ctypes.c_uint8
        cf.CFDataGetBytePtr.restype = ctypes.c_void_p
        cf.CFDataGetBytePtr.argtypes = [ctypes.c_void_p]
        self.utf8 = 0x08000100
        self.id_property = data_symbol(carbon, "kTISPropertyInputSourceID")
        self.name_property = data_symbol(carbon, "kTISPropertyLocalizedName")
        self.data_property = data_symbol(carbon, "kTISPropertyUnicodeKeyLayoutData")
        self.keyboard_type = carbon.LMGetKbdType()

        key = ctypes.c_void_p(data_symbol(carbon, "kTISPropertyInputSourceType").value)
        value = ctypes.c_void_p(data_symbol(carbon, "kTISTypeKeyboardLayout").value)
        keys = (ctypes.c_void_p * 1)(key)
        values = (ctypes.c_void_p * 1)(value)
        query = cf.CFDictionaryCreate(
            None, keys, values, 1,
            data_symbol(cf, "kCFTypeDictionaryKeyCallBacks"),
            data_symbol(cf, "kCFTypeDictionaryValueCallBacks"),
        )
        self.sources = carbon.TISCreateInputSourceList(query, True)

    def _string(self, value):
        if not value:
            return ""
        buffer = ctypes.create_string_buffer(256)
        self.cf.CFStringGetCString(value, buffer, len(buffer), self.utf8)
        return buffer.value.decode()

    def source_by_id(self, source_id):
        count = self.cf.CFArrayGetCount(self.sources)
        for index in range(count):
            source = self.cf.CFArrayGetValueAtIndex(self.sources, index)
            ident = self.carbon.TISGetInputSourceProperty(source, self.id_property)
            if self._string(ident) == source_id:
                return source
        return None

    def output(self, source_id):
        source = self.source_by_id(source_id)
        if source is None:
            raise SystemExit(f"keyboard layout {source_id} is not installed")
        data = self.carbon.TISGetInputSourceProperty(source, self.data_property)
        pointer = self.cf.CFDataGetBytePtr(data)
        masks = {
            "": 0,
            "shift": 1 << 1,
            "option": 1 << 3,
            "shift+option": (1 << 1) | (1 << 3),
            "caps": 1 << 2,
            "caps+shift": (1 << 2) | (1 << 1),
            "caps+option": (1 << 2) | (1 << 3),
            "caps+shift+option": (1 << 2) | (1 << 1) | (1 << 3),
        }
        result = {}
        for name, mask in masks.items():
            result[name] = {code: self._translate(pointer, code, mask) for code in range(128)}
        return result

    def _translate(self, layout, code, mask):
        dead = ctypes.c_uint32(0)
        length = ctypes.c_long(0)
        chars = (ctypes.c_uint16 * 8)()
        status = self.carbon.UCKeyTranslate(
            layout, code, 3, mask, self.keyboard_type, 1,
            ctypes.byref(dead), 8, ctypes.byref(length), chars,
        )
        if status != 0 or length.value == 0:
            return ""
        encoded = struct.pack(f"<{length.value}H", *chars[:length.value])
        return encoded.decode("utf-16-le")

    def select(self, name):
        count = self.cf.CFArrayGetCount(self.sources)
        for index in range(count):
            source = self.cf.CFArrayGetValueAtIndex(self.sources, index)
            if self._string(self.carbon.TISGetInputSourceProperty(source, self.name_property)) != name:
                continue
            self.carbon.TISEnableInputSource.argtypes = [ctypes.c_void_p]
            self.carbon.TISSelectInputSource.argtypes = [ctypes.c_void_p]
            self.carbon.TISEnableInputSource.restype = ctypes.c_int32
            self.carbon.TISSelectInputSource.restype = ctypes.c_int32
            enabled = self.carbon.TISEnableInputSource(source)
            selected = self.carbon.TISSelectInputSource(source)
            return enabled == 0 and selected == 0
        return False


def xml_attr(text):
    # the keylayout parser expands numeric character references only, so named
    # entities such as &quot; would be typed literally or dropped.
    out = []
    for char in text:
        code = ord(char)
        if char in '&<>"' or code < 32 or code == 127:
            out.append(f"&#x{code:04X};")
        else:
            out.append(char)
    return "".join(out)


def build(base_output, option):
    resolved = {}
    for key, text in option.items():
        name, mods = chord(text)
        resolved[KEY_CODES[key]] = (KEY_CODES[name], mods)

    maps = {name: dict(entries) for name, entries in base_output.items()}
    for code, (source, mods) in resolved.items():
        for layer in OPTION_LAYERS:
            # caps does not change the symbol layer; only shift does
            state = "shift" if mods or "shift" in layer else ""
            character = base_output[state][source]
            if character == "":
                raise SystemExit(f"base layout has no output for {state or 'plain'} key {source}")
            maps[layer][code] = character
    for state, entries in maps.items():
        entries[F17_CODE] = base_output[state][QUOTE_CODE]
        entries[F18_CODE] = base_output[state][ESCAPE_CODE]
    return maps


def render(maps):
    longest = max(len(text) for entries in maps.values() for text in entries.values())
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<!DOCTYPE keyboard SYSTEM "file://localhost/System/Library/DTDs/KeyboardLayout.dtd">',
        f"<!-- {MARKER} -->",
        f'<keyboard group="126" id="{LAYOUT_ID}" name="{NAME}" maxout="{max(longest, 1)}">',
        "  <layouts>",
        '    <layout first="0" last="17" modifiers="modifiers" mapSet="mapset"/>',
        "  </layouts>",
        '  <modifierMap id="modifiers" defaultIndex="0">',
    ]
    for index, name in enumerate(MODIFIERS):
        lines.append(f'    <keyMapSelect mapIndex="{index}">')
        lines.append(f'      <modifier keys="{MODIFIERS[name]}"/>')
        lines.append("    </keyMapSelect>")
    lines += ["  </modifierMap>", '  <keyMapSet id="mapset">']
    for index, name in enumerate(MODIFIERS):
        lines.append(f'    <keyMap index="{index}">')
        for code in sorted(maps[name]):
            if maps[name][code] != "":
                lines.append(f'      <key code="{code}" output="{xml_attr(maps[name][code])}"/>')
        lines.append("    </keyMap>")
    lines += ["  </keyMapSet>", "</keyboard>", ""]
    return "\n".join(lines)


def check(maps, base_output, option):
    rendered = render(maps)
    for key, text in option.items():
        name, mods = chord(text)
        state = "shift" if mods else ""
        code = KEY_CODES[key]
        expected = base_output[state][KEY_CODES[name]]
        shifted = base_output["shift"][KEY_CODES[name]]
        if maps["option"][code] != expected:
            raise SystemExit(f"option+{key} is {maps['option'][code]!r}, expected {expected!r}")
        if maps["shift+option"][code] != shifted:
            raise SystemExit(f"shift+option+{key} is {maps['shift+option'][code]!r}, expected {shifted!r}")
    if maps["option"][KEY_CODES["p"]] != base_output["option"][KEY_CODES["p"]]:
        raise SystemExit("option+p changed, but it is not in the layer")
    if maps[""][KEY_CODES["q"]] != base_output[""][KEY_CODES["q"]]:
        raise SystemExit("the base layout changed")
    for state in MODIFIERS:
        if maps[state][F17_CODE] != base_output[state][QUOTE_CODE]:
            raise SystemExit(f"f17 does not type a quote with {state or 'no'} modifiers")
        if maps[state][F18_CODE] != base_output[state][ESCAPE_CODE]:
            raise SystemExit(f"f18 does not type escape with {state or 'no'} modifiers")
    if f'output="{xml_attr(base_output[""][KEY_CODES["q"]])}"' not in rendered:
        raise SystemExit("rendered layout is missing the base character")
    if any(entity in rendered for entity in ("&quot;", "&lt;", "&gt;", "&amp;")):
        raise SystemExit("named entities are ignored by the keylayout parser")


def write(path, text):
    destination = Path(path)
    if destination.exists() and MARKER not in destination.read_text(errors="replace"):
        raise SystemExit(f"{destination} exists and was not generated by this script")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(text)
    print(f"wrote {destination}")


def main():
    if sys.platform != "darwin":
        print("keyboard layout skipped: not macOS")
        return
    args = sys.argv[1:]
    selecting = "--select" in args
    checking = "--check" in args
    paths = [arg for arg in args if not arg.startswith("--")]
    if len(paths) != 1:
        raise SystemExit("usage: keylayout.py [--select] [--check] OUTPUT")
    keymap = Path(__file__).with_name("keymap.lua")
    base_id, option = parse_keymap(keymap)
    base_output = Layout().output(base_id)
    maps = build(base_output, option)
    if checking:
        check(maps, base_output, option)
    write(paths[0], render(maps))
    if not selecting:
        return
    # compiled layouts are cached per process until the cache files are removed
    cache = Path(os.environ.get("TMPDIR", "/tmp")).resolve().parent / "C"
    for path in cache.glob("com.apple.IntlDataCache*"):
        path.unlink(missing_ok=True)
    for path in cache.glob("*/com.apple.IntlDataCache*"):
        try:
            path.unlink()
        except OSError:
            pass
    subprocess.run(["killall", "TextInputMenuAgent"], check=False)
    time.sleep(1)
    if Layout().select(NAME):
        print(f"selected input source {NAME}")
    else:
        print(f"{NAME} is not available yet. Log out, then select it in")
        print("System Settings -> Keyboard -> Input Sources, and remove British.")


if __name__ == "__main__":
    main()
