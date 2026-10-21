local keymap = require("keymap")
local remap = require("remap")

require("hs.ipc")
hs.autoLaunch(true)

local HIDUTIL = "/usr/bin/hidutil"
local KEYBOARDS = '{"PrimaryUsagePage":1,"PrimaryUsage":6}'
-- marks events posted below so the tap passes them through untouched
local SYNTHETIC = 0x6B6D6170

local types = hs.eventtap.event.types
local props = hs.eventtap.event.properties

local function clearHidutil()
	hs.execute(HIDUTIL .. [[ property --set '{"UserKeyMapping":[]}']])
end

local function merged(extraFrom, extraTo)
	local mapping = {}
	for key, value in pairs(keymap.hidutil) do mapping[key] = value end
	mapping[extraFrom] = extraTo
	return mapping
end

local function applyHidutil()
	hs.execute(string.format("%s property --set '%s'", HIDUTIL, remap.hidutilMapping(keymap.hidutil)))
	for _, kb in ipairs(keymap.excludedKeyboards) do
		hs.execute(string.format([[%s property --matching '{"VendorID":%d,"ProductID":%d}' --set '{"UserKeyMapping":[]}']],
			HIDUTIL, kb.vendorID, kb.productID))
	end
	-- applied last, so it replaces the global mapping on these keyboards
	for _, kb in ipairs(keymap.lockScreen.keyboards) do
		hs.execute(string.format([[%s property --matching '{"VendorID":%d,"ProductID":%d}' --set '%s']],
			HIDUTIL, kb.vendorID, kb.productID, remap.hidutilMapping(merged(kb.from, keymap.lockScreen.key))))
	end
end

local kinds = {
	[types.keyDown] = "keyDown",
	[types.keyUp] = "keyUp",
	[types.leftMouseDown] = "mouseDown",
	[types.rightMouseDown] = "mouseDown",
	[types.otherMouseDown] = "mouseDown",
	[types.leftMouseUp] = "mouseUp",
	[types.rightMouseUp] = "mouseUp",
	[types.otherMouseUp] = "mouseUp",
}
local tapped = {}
for t in pairs(kinds) do tapped[#tapped + 1] = t end

local function modList(flags)
	local list = {}
	for mod in pairs(flags) do list[#list + 1] = mod end
	return list
end

local engine = remap.new(keymap)

-- global: Hammerspoon garbage-collects taps and timers only held by locals
keyboard = {}

keyboard.tap = hs.eventtap.new(tapped, function(event)
	if event:getProperty(props.eventSourceUserData) == SYNTHETIC then return false end
	local kind = kinds[event:getType()]
	local key
	if kind == "keyDown" or kind == "keyUp" then key = hs.keycodes.map[event:getKeyCode()] end
	if key == keymap.lockScreen.key then
		if kind == "keyDown" and event:getProperty(props.keyboardEventAutorepeat) == 0 then
			hs.caffeinate.lockScreen()
		end
		return true
	end
	local result = engine:handle({ kind = kind, key = key, flags = event:getFlags(), time = hs.timer.absoluteTime() / 1e9 })
	if result.action == "modify" then
		event:setFlags(result.flags)
	elseif result.action == "replace" then
		local events = {}
		for _, emit in ipairs(result.emit) do
			local out = hs.eventtap.event.newKeyEvent(modList(emit.flags), emit.key, emit.down)
			out:setProperty(props.eventSourceUserData, SYNTHETIC)
			events[#events + 1] = out
		end
		return true, events
	end
	return false
end):start()

-- hidutil turns caps lock, quote and right command into keys only the tap
-- understands, so the mapping must only be active while the tap runs. the tap
-- cannot start without accessibility access, and macOS disables taps it
-- considers too slow.
local function syncTap()
	if not keyboard.tap:isEnabled() then keyboard.tap:start() end
	local active = keyboard.tap:isEnabled()
	if active == keyboard.active then return end
	keyboard.active = active
	if active then applyHidutil() else clearHidutil() end
end

local function keyboardIDs(listing)
	local ids = {}
	for id in listing:gmatch("\n%S+%s+%S+%s+%S+%s+%S+%s+%S+%s+(0x%x+)") do ids[#ids + 1] = id end
	table.sort(ids)
	return table.concat(ids, ",")
end

syncTap()

-- a newly connected excluded keyboard picks up the global hidutil mapping
keyboard.poll = hs.timer.doEvery(3, function()
	syncTap()
	if keyboard.list and keyboard.list:isRunning() then return end
	keyboard.list = hs.task.new(HIDUTIL, function(_, stdout)
		local ids = keyboardIDs(stdout)
		if keyboard.active and keyboard.ids and ids ~= keyboard.ids then applyHidutil() end
		keyboard.ids = ids
	end, { "list", "--matching", KEYBOARDS }):start()
end)

hs.shutdownCallback = clearHidutil
