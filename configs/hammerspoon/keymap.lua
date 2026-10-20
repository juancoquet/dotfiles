-- hidutil names are the HID usages listed in remap.lua. tapHold and layers use
-- Hammerspoon key names (hs.keycodes.map) as they arrive after hidutil.
return {
	-- keyboards whose firmware already does all of this. hidutil leaves them
	-- alone, so they never send the f17-f19 keys the rules below act on.
	excludedKeyboards = {
		{ vendorID = 0x1D50, productID = 0x615E }, -- corne
	},

	-- applied below the event tap, so these also work in secure input fields.
	-- caps lock, quote and right command become f17-f19, which no keyboard
	-- sends, so tapHold and layers only fire on keyboards hidutil remaps.
	hidutil = {
		caps_lock = "f18",
		quote = "f17",
		right_command = "f19",
		escape = "caps_lock",
		open_bracket = "slash",
		slash = "backspace",
		grave = "equal",
	},

	-- seconds a tapHold key may be held and still send its tap key
	tapTimeout = 0.18,

	tapHold = {
		f18 = { tap = "escape", hold = "ctrl" },
		f17 = { tap = "'", hold = "ctrl" },
	},

	layers = {
		f19 = {
			q = "shift+1", w = "shift+2", e = "shift+3", r = "shift+4", t = "shift+5",
			y = "shift+6", u = "shift+7", i = "shift+8", o = "shift+`",
			a = "1", s = "2", d = "3", f = "4", g = "5",
			h = "6", j = "7", k = "8", l = "9", [";"] = "0",
			z = "`", x = "[", c = "shift+[", v = "shift+9", b = "\\",
			n = "shift+\\", m = "shift+0", [","] = "shift+]", ["."] = "]",
		},
	},
}
