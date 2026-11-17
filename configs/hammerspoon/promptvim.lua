-- Vim for the Cursor agent prompt. The editor is untouched.
-- Hammerspoon only: scripts/check-hammerspoon loads vimmode, not this file.
local vimmode = require("vimmode")

local CURSOR = "com.todesktop.230313mzl4w4u92"
local SYNTHETIC = 0x6B6D6170
local props = hs.eventtap.event.properties

local M = {}

local session
local keyboard
local enabledPid
local promptElement
local trace = {}

local function now()
	return hs.timer.secondsSinceEpoch()
end

local function note(message)
	trace[#trace + 1] = string.format("%.3f %s", now(), message)
	while #trace > 30 do table.remove(trace, 1) end
end

local function postKey(key, flags, down)
	local event = hs.eventtap.event.newKeyEvent(flags or {}, key, down)
	event:setProperty(props.eventSourceUserData, SYNTHETIC)
	event:post()
end

local function tap(key, flags)
	postKey(key, flags, true)
	postKey(key, flags, false)
end

local function flagList(input)
	local list = {}
	if input.ctrl then list[#list + 1] = "ctrl" end
	if input.alt then list[#list + 1] = "alt" end
	if input.shift then list[#list + 1] = "shift" end
	if input.cmd then list[#list + 1] = "cmd" end
	return list
end

local function copyEvent(event, kind)
	local flags = event:getFlags()
	local char = ""
	pcall(function() char = event:getCharacters() or "" end)
	if char == "" then pcall(function() char = event:getCharacters(true) or "" end) end
	return {
		kind = kind,
		key = hs.keycodes.map[event:getKeyCode()],
		code = event:getKeyCode(),
		char = char,
		ctrl = flags.ctrl or false,
		alt = flags.alt or false,
		shift = flags.shift or false,
		cmd = flags.cmd or false,
	}
end

local function play(moves)
	for _, move in ipairs(moves) do
		local flags = {}
		if move.shift then flags[#flags + 1] = "shift" end
		if move.alt then flags[#flags + 1] = "alt" end
		for _ = 1, move.count do tap(move.key, flags) end
	end
end

local function utf8len(b)
	if b >= 0xF0 then return 4 end
	if b >= 0xE0 then return 3 end
	if b >= 0xC0 then return 2 end
	return 1
end

-- A newline is shift-return. Plain return sends the prompt.
local function typeChars(text)
	local i = 1
	while i <= #text do
		if text:byte(i) == 10 then
			tap("return", { "shift" })
			i = i + 1
		else
			local len = utf8len(text:byte(i))
			local ch = text:sub(i, i + len - 1)
			local down = hs.eventtap.event.newKeyEvent({}, "a", true)
			local up = hs.eventtap.event.newKeyEvent({}, "a", false)
			down:setUnicodeString(ch)
			up:setUnicodeString(ch)
			down:setProperty(props.eventSourceUserData, SYNTHETIC)
			up:setProperty(props.eventSourceUserData, SYNTHETIC)
			down:post()
			up:post()
			i = i + len
		end
	end
end

local function publish()
	keyboard.promptMode = session.state.mode
	if keyboard.refreshMenu then hs.timer.doAfter(0, keyboard.refreshMenu) end
end

local function finishInject()
	session.busy = false
	session.trustedUntil = now() + 0.4
	local queued = session.queue
	session.queue = {}
	for i, item in ipairs(queued) do
		if session.busy then
			for j = i, #queued do session.queue[#session.queue + 1] = queued[j] end
			return
		end
		if not M.handle(item) then postKey(item.key, flagList(item), item.kind == "keyDown") end
	end
	publish()
end

local function isPrompt(element)
	if not element or element:attributeValue("AXRole") ~= "AXTextArea" then return false end
	if element:attributeValue("AXDescription") == "Prompt" then return true end
	local class = element:attributeValue("AXDOMClassList")
	if type(class) == "string" then class = { class } end
	if type(class) ~= "table" then return false end
	for _, name in ipairs(class) do
		if name == "ui-prompt-input-editor__input" or name == "agent-panel-followup-input" then
			return true
		end
	end
	return false
end

local function findPrompt(element, depth)
	if not element or depth > 30 then return nil end
	if isPrompt(element) then return element end
	local children = element:attributeValue("AXChildren")
	if type(children) ~= "table" then return nil end
	for _, child in ipairs(children) do
		local found = findPrompt(child, depth + 1)
		if found then return found end
	end
	return nil
end

local function focusedPrompt()
	local element = hs.axuielement.systemWideElement():attributeValue("AXFocusedUIElement")
	local app = element and hs.application.applicationForPID(element:pid())
	if not app or app:bundleID() ~= CURSOR then
		app = hs.application.frontmostApplication()
		if not app or app:bundleID() ~= CURSOR then return nil end
	end
	if enabledPid ~= app:pid() then
		pcall(function()
			hs.axuielement.applicationElement(app):setAttributeValue("AXManualAccessibility", true)
		end)
		enabledPid = app:pid()
		element = hs.axuielement.systemWideElement():attributeValue("AXFocusedUIElement") or element
	end
	if isPrompt(element) then
		promptElement = element
		return element
	end
	-- The Agents window reports focus on its web page, not on the composer.
	local agents = element and element:attributeValue("AXRole") == "AXWebArea"
		and element:attributeValue("AXTitle") == "Cursor Agents"
	if not agents then return nil end
	if not isPrompt(promptElement) then promptElement = findPrompt(element, 0) end
	return isPrompt(promptElement) and promptElement or nil
end

local function readPrompt(element)
	local value = element:attributeValue("AXValue") or ""
	value = value:gsub("\r\n", "\n"):gsub("\r", "\n")
	local range = element:attributeValue("AXSelectedTextRange")
	local loc, length = 0, 0
	if type(range) == "table" then
		loc = range.location or 0
		length = range.length or 0
	end
	return value, vimmode.byteForUtf16(value, loc), vimmode.byteForUtf16(value, loc + length)
end

-- The live selection start is the highlighted character. `held` means a normal
-- mode block is showing, so the caret is sitting on the character after it.
local function motionOrigin(element, previous)
	local ok, _, startByte, endByte = pcall(readPrompt, element)
	if not ok then return session.place, false end
	if previous == "visual" or previous == "visual-line" or previous == "visual-block" then
		return session.place, false
	end
	return startByte, previous == "normal" and endByte > startByte
end

local function moveWidget(element, text, caret, mode, visual, previous)
	local origin, held = motionOrigin(element, previous)
	local moves, place, selection = vimmode.planCaret(text, origin, caret, mode, visual, held)
	session.place = place
	session.mark = selection or { caret, caret }
	local total = 0
	for _, move in ipairs(moves) do total = total + move.count end
	if total == 0 then
		session.trustedUntil = now() + 0.4
		return
	end
	local function draw()
		play(moves)
	end
	if total > 50 then
		session.busy = true
		session.busyUntil = now() + 2
		hs.timer.doAfter(0, function()
			local ok, err = pcall(draw)
			if not ok then note("move " .. tostring(err)) end
			finishInject()
		end)
		return
	end
	draw()
	session.trustedUntil = now() + 0.4
end

-- Command-A does not select this box, so an edit is arrows, backspace, and
-- typed characters. The caret byte is where the box is before the edit.
local function rewrite(element, old, new, caret, mode, visual, yank, previous)
	local origin, held = motionOrigin(element, previous)
	local pre, oldEnd, newEnd = vimmode.editSpan(old, new)
	local approach = vimmode.steps(old, origin, oldEnd)
	local deletes = vimmode.steps(old, pre, oldEnd)
	local _, _, selection = vimmode.planCaret(new, caret, caret, mode, visual, false)
	session.busy = true
	session.busyUntil = now() + 2
	hs.timer.doAfter(0, function()
		local ok, err = pcall(function()
			if held then tap("left", {}) end
			local key = approach > 0 and "right" or "left"
			for _ = 1, math.abs(approach) do tap(key, {}) end
			for _ = 1, deletes do tap("delete", {}) end
			typeChars(new:sub(pre, newEnd - 1))
			local moves, place = vimmode.retarget(new, newEnd, caret, selection)
			play(moves)
			session.place = place
			session.mark = selection or { caret, caret }
			if yank ~= nil then hs.pasteboard.setContents(yank) end
		end)
		if not ok then note("edit " .. tostring(err)) end
		finishInject()
	end)
end

local function resync(element)
	if now() < session.trustedUntil then return end
	local value, startByte, endByte = readPrompt(element)
	local mark = session.mark or { session.place, session.place }
	if value == session.text and startByte == mark[1] and endByte == mark[2] then return end
	session.text = value
	session.place = endByte
	session.mark = { startByte, endByte }
	session.state = vimmode.cursor(value, startByte)
end

local function enterNormal(element)
	local value, byte = readPrompt(element)
	session.text = value
	session.place = byte
	session.state = vimmode.fromInsert(value, byte)
	moveWidget(element, value, session.state.pos, session.state.mode, nil, "insert")
	publish()
end

local function apply(element, before, previous, newState, newText, info)
	session.state = newState
	session.text = newText
	if newText ~= before then
		rewrite(element, before, newText, info.caret, newState.mode, info.select, info.yank, previous)
		return
	end
	if info.yank ~= nil then hs.pasteboard.setContents(info.yank) end
	moveWidget(element, newText, info.caret, newState.mode, info.select, previous)
end

function M.handle(input)
	if session.busy and now() > (session.busyUntil or 0) then
		session.busy = false
		session.queue = {}
		note("busy timed out")
	end
	if input.kind == "keyUp" then
		if session.swallowed[input.code] then
			session.swallowed[input.code] = nil
			return true
		end
		return false
	end
	if input.kind ~= "keyDown" then return false end

	local ok, element = pcall(focusedPrompt)
	if not ok or not element then return false end
	if session.busy then return true end

	if (input.key == "return" or input.key == "padenter") and (input.shift or input.cmd) then
		return false
	end

	local contents
	pcall(function() contents = hs.pasteboard.getContents() end)
	input.clipboard = contents
	if session.state.mode ~= "insert" then
		local synced, err = pcall(resync, element)
		if not synced then note("resync " .. tostring(err)) end
	end

	local before = session.text
	local previous = session.state.mode
	local fed, newState, newText, info = pcall(vimmode.feed, session.state, before, input)
	if not fed then
		note("feed " .. tostring(newState))
		if previous ~= "insert" and not input.cmd and not input.alt and not input.ctrl then
			return true
		end
		return false
	end
	if info.pass then
		note("pass " .. tostring(input.key) .. " " .. previous)
		return false
	end

	session.swallowed[input.code] = true
	if info.enterNormal then
		local entered, err = pcall(enterNormal, element)
		if not entered then note("enter " .. tostring(err)) end
		publish()
		return true
	end
	note(string.format("%s %s -> %s%s", tostring(info.key or input.key), previous, newState.mode,
		newText ~= before and " edit" or ""))
	local applied, err = pcall(apply, element, before, previous, newState, newText, info)
	if not applied then note("apply " .. tostring(err)) end
	publish()
	return true
end

function M.install(target)
	keyboard = target
	session = {
		state = { mode = "insert", pos = 1 },
		text = "",
		place = 1,
		mark = { 1, 1 },
		trustedUntil = 0,
		swallowed = {},
		queue = {},
	}
	session.busy = false
	keyboard.promptVim = true
	keyboard.promptMode = "insert"

	function keyboard.resetPromptVim()
		session.busy = false
		session.queue = {}
		session.state = { mode = "insert", pos = 1 }
		publish()
	end

	function keyboard.onPrompt(event, kind)
		if not keyboard.promptVim then return false end
		if kind ~= "keyDown" and kind ~= "keyUp" then return false end
		local handled, swallow = pcall(M.handle, copyEvent(event, kind))
		if not handled then
			note("tap " .. tostring(swallow))
			return false
		end
		return swallow
	end

	function keyboard.promptVimTrace()
		return table.concat(trace, "\n")
	end
end

return M
