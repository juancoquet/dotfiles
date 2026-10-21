-- hidutil names are the HID usages listed in remap.lua. tapHold and layers use
-- Hammerspoon key names (hs.keycodes.map) as they arrive after hidutil.
return {
	-- keyboards whose firmware already does all of this. hidutil leaves them
	-- alone, so they never send the f17-f19 keys the rules below act on.
	excludedKeyboards = {
		{ vendorID = 0x1D50, productID = 0x615E }, -- corne
	},

	-- applied below the event tap, so these also work in secure input fields.
	-- caps lock, quote and both command keys become f17-f20, which no keyboard
	-- sends, so tapHold and layers only fire on keyboards hidutil remaps.
	hidutil = {
		caps_lock = "f18",
		quote = "f17",
		right_command = "f19",
		left_command = "f20",
		left_option = "left_command",
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
		-- aerospace workspace bindings. held keys are added to the output, so
		-- also holding command (left option) moves the window there instead.
		f20 = {
			a = "shift+ctrl+1", s = "shift+ctrl+2", d = "shift+ctrl+3", f = "shift+ctrl+4", g = "shift+ctrl+5",
			h = "shift+ctrl+6", j = "shift+ctrl+7", k = "shift+ctrl+8", l = "shift+ctrl+9", [";"] = "shift+ctrl+0",
		},
	},
}
