-- No hs.* here: scripts/check-hammerspoon runs this outside Hammerspoon.
local M = {}

-- HID keyboard usage IDs (usage page 0x07)
local usages = {
	backspace = 0x2A,
	caps_lock = 0x39,
	equal = 0x2E,
	escape = 0x29,
	f16 = 0x6B,
	f17 = 0x6C,
	forward_delete = 0x4C,
	f18 = 0x6D,
	f19 = 0x6E,
	f20 = 0x6F,
	grave = 0x35,
	left_command = 0xE3,
	left_option = 0xE2,
	open_bracket = 0x2F,
	quote = 0x34,
	right_command = 0xE7,
	right_option = 0xE6,
	slash = 0x38,
}

local function usage(name)
	local id = usages[name]
	if not id then error("unknown hidutil key: " .. tostring(name)) end
	return 0x700000000 + id
end

function M.hidutilMapping(hidutil)
	local sources = {}
	for from in pairs(hidutil) do sources[#sources + 1] = from end
	table.sort(sources)
	local entries = {}
	for _, from in ipairs(sources) do
		entries[#entries + 1] = string.format(
			'{"HIDKeyboardModifierMappingSrc":%.0f,"HIDKeyboardModifierMappingDst":%.0f}',
			usage(from), usage(hidutil[from]))
	end
	return '{"UserKeyMapping":[' .. table.concat(entries, ",") .. "]}"
end

local function parseChord(chord)
	local parts = {}
	for part in string.gmatch(chord, "[^+]+") do parts[#parts + 1] = part end
	local key = table.remove(parts)
	local mods = {}
	for _, mod in ipairs(parts) do mods[mod] = true end
	return { key = key, mods = mods }
end

local function union(...)
	local out = {}
	for i = 1, select("#", ...) do
		for mod, on in pairs((select(i, ...))) do
			if on then out[mod] = true end
		end
	end
	return out
end

local function drop() return { action = "replace", emit = {} } end

local Engine = {}
Engine.__index = Engine

function M.new(keymap)
	local layers = {}
	for trigger, map in pairs(keymap.layers or {}) do
		layers[trigger] = {}
		for from, chord in pairs(map) do layers[trigger][from] = parseChord(chord) end
	end
	return setmetatable({
		tapHold = keymap.tapHold or {},
		tapTimeout = keymap.tapTimeout,
		layers = layers,
		held = {},
		layered = {},
		layer = nil,
	}, Engine)
end

function Engine:holdMods()
	local mods = {}
	for key in pairs(self.held) do mods[self.tapHold[key].hold] = true end
	return mods
end

function Engine:tapHoldKey(ev, tapHold, down)
	if down then
		self.held[ev.key] = self.held[ev.key] or { since = ev.time, used = false }
		return drop()
	end
	local state = self.held[ev.key]
	self.held[ev.key] = nil
	if not state or state.used or ev.time - state.since > self.tapTimeout then return drop() end
	local flags = union(ev.flags, self:holdMods())
	return { action = "replace", emit = {
		{ key = tapHold.tap, flags = flags, down = true },
		{ key = tapHold.tap, flags = flags, down = false },
	} }
end

-- ev: { kind = "keyDown"|"keyUp"|"mouseDown"|"mouseUp", key = name, flags = set, time = seconds }
-- returns { action = "pass" }, { action = "modify", flags = set } or
-- { action = "replace", emit = { { key = name, flags = set, down = bool }, ... } }
function Engine:handle(ev)
	local isKey = ev.kind == "keyDown" or ev.kind == "keyUp"
	local down = ev.kind == "keyDown" or ev.kind == "mouseDown"

	if isKey then
		local tapHold = self.tapHold[ev.key]
		if tapHold then return self:tapHoldKey(ev, tapHold, down) end
		if self.layers[ev.key] then
			if down then
				self.layer = ev.key
			elseif self.layer == ev.key then
				self.layer = nil
			end
			return drop()
		end
	end

	if down then
		for _, state in pairs(self.held) do state.used = true end
	end
	local mods = self:holdMods()

	if isKey then
		-- a key released after its layer must release what it pressed
		local chord = (down and self.layer and self.layers[self.layer][ev.key]) or (not down and self.layered[ev.key])
		if chord then
			self.layered[ev.key] = down and chord or nil
			return { action = "replace", emit = { { key = chord.key, flags = union(chord.mods, ev.flags, mods), down = down } } }
		end
	end

	if next(mods) then return { action = "modify", flags = union(ev.flags, mods) } end
	return { action = "pass" }
end

return M
