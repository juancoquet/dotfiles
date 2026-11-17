-- Modal editing on a UTF-8 string. No Hammerspoon calls: scripts/check-hammerspoon loads this.
local M = {}

local function utf8len(b)
	if not b then return 1 end
	if b >= 0xF0 then return 4 end
	if b >= 0xE0 then return 3 end
	if b >= 0xC0 then return 2 end
	return 1
end

function M.byteForUtf16(text, units)
	local u, i = 0, 1
	while i <= #text and u < units do
		local len = utf8len(text:byte(i))
		local span = len == 4 and 2 or 1
		if u + span > units then break end
		u = u + span
		i = i + len
	end
	return i
end

function M.block(text, caret)
	if caret < 1 or caret > #text or text:byte(caret) == 10 then return nil end
	return { caret, caret + utf8len(text:byte(caret)) }
end

-- Normal mode highlights the character under the cursor. The prompt leaves its
-- caret at the end of that highlight, so a held block has to be collapsed with
-- Left before the next motion. Left lands on `origin` for a one-character block
-- whether it collapses the selection or steps back from the caret.
function M.planCaret(text, origin, vimCaret, mode, visualSelection, held)
	local selection
	if mode == "normal" then
		selection = M.block(text, vimCaret)
	elseif mode == "visual" or mode == "visual-line" or mode == "visual-block" then
		selection = visualSelection
	end
	local moves = {}
	if held then moves[1] = { key = "left", count = 1, shift = false } end
	local motion, place = M.retarget(text, origin, vimCaret, selection)
	for _, move in ipairs(motion) do moves[#moves + 1] = move end
	return moves, place, selection
end

function M.steps(text, fromByte, toByte)
	local function forward(a, b)
		local n, i = 0, a
		while i < b and i <= #text do
			i = i + utf8len(text:byte(i))
			n = n + 1
		end
		return n
	end
	if toByte >= fromByte then return forward(fromByte, toByte) end
	return -forward(toByte, fromByte)
end

function M.utf16ForByte(text, byteIndex)
	local u, i = 0, 1
	while i < byteIndex and i <= #text do
		local len = utf8len(text:byte(i))
		u = u + (len == 4 and 2 or 1)
		i = i + len
	end
	return u
end

local function nextByte(text, i)
	if i > #text then return i end
	return i + utf8len(text:byte(i))
end

local function prevByte(text, i)
	if i <= 1 then return 1 end
	local j = i - 1
	while j > 1 and text:byte(j) >= 0x80 and text:byte(j) < 0xC0 do j = j - 1 end
	return j
end

local function lineStart(text, pos)
	local s = 1
	for i = 1, math.min(pos, #text + 1) - 1 do
		if text:byte(i) == 10 then s = i + 1 end
	end
	return s
end

local function lineEnd(text, start)
	local i = start
	while i <= #text and text:byte(i) ~= 10 do i = nextByte(text, i) end
	return i
end

local function column(text, pos)
	local n, i = 0, lineStart(text, pos)
	while i < pos and i <= #text do
		n = n + 1
		i = nextByte(text, i)
	end
	return n
end

local function atColumn(text, start, finish, col)
	local i, n = start, 0
	while i < finish and n < col do
		i = nextByte(text, i)
		n = n + 1
	end
	if i >= finish and finish > start then return prevByte(text, finish) end
	return i
end

local function clamp(text, pos)
	if #text == 0 then return 1 end
	if pos < 1 then pos = 1 end
	if pos > #text then pos = prevByte(text, #text + 1) end
	if pos <= #text and text:byte(pos) == 10 then
		local s = lineStart(text, pos)
		if s < pos then return prevByte(text, pos) end
	end
	return pos
end

local function place(text, pos)
	pos = clamp(text, pos)
	return { mode = "normal", pos = pos, prefer = column(text, pos) }
end

function M.fromInsert(text, caretByte)
	local pos = caretByte or 1
	local s = lineStart(text, pos)
	if pos > s then pos = prevByte(text, pos) end
	return place(text, pos)
end

function M.cursor(text, caretByte)
	return place(text, caretByte or 1)
end

-- Bytes [pre, oldEnd) in old correspond to [pre, newEnd) in new.
-- old:sub(1, pre - 1) .. new:sub(pre, newEnd - 1) .. old:sub(oldEnd) == new
function M.editSpan(old, new)
	local pre = 1
	while pre <= #old and pre <= #new and old:byte(pre) == new:byte(pre) do
		pre = pre + 1
	end
	local oldEnd, newEnd = #old + 1, #new + 1
	while oldEnd > pre and newEnd > pre and old:byte(oldEnd - 1) == new:byte(newEnd - 1) do
		oldEnd = oldEnd - 1
		newEnd = newEnd - 1
	end
	return pre, oldEnd, newEnd
end

function M.retarget(text, fromByte, caretByte, selection)
	local function move(from, to, shift)
		local n = M.steps(text, from, to)
		if n == 0 then return nil end
		return { key = n > 0 and "right" or "left", count = math.abs(n), shift = shift or false }
	end
	local moves = {}
	if selection then
		local jump = move(fromByte, selection[1], false)
		if jump then moves[#moves + 1] = jump end
		local extend = move(selection[1], selection[2], true)
		if extend then moves[#moves + 1] = extend end
		return moves, selection[2]
	end
	local jump = move(fromByte, caretByte, false)
	if jump then moves[1] = jump end
	return moves, caretByte
end

local function isNL(text, i) return i <= #text and text:byte(i) == 10 end

local function classOf(text, i)
	if i > #text or isNL(text, i) then return "nl" end
	local b = text:byte(i)
	if b == 32 or b == 9 then return "space" end
	if b < 128 and not text:sub(i, i):match("[%w_]") then return "punct" end
	return "word"
end

local function skipClass(text, i, kind, dir)
	while i >= 1 and i <= #text and classOf(text, i) == kind do
		i = dir > 0 and nextByte(text, i) or prevByte(text, i)
		if dir < 0 and classOf(text, i) ~= kind then break end
	end
	return i
end

local function motionWord(text, pos, big, towards)
	local i = pos
	if towards > 0 then
		local kind = classOf(text, i)
		if kind ~= "nl" then i = skipClass(text, i, kind, 1) end
		while isNL(text, i) or (not big and classOf(text, i) == "space") or (big and classOf(text, i) == "space") do
			if isNL(text, i) and not big then break end
			i = nextByte(text, i)
			if i > #text then return clamp(text, #text) end
		end
		if big then
			while classOf(text, i) == "space" do i = nextByte(text, i) end
		end
		return clamp(text, i)
	end
	i = prevByte(text, i)
	while classOf(text, i) == "space" or classOf(text, i) == "nl" do
		if i <= 1 then break end
		i = prevByte(text, i)
	end
	local kind = classOf(text, i)
	local s = i
	while s > 1 do
		local p = prevByte(text, s)
		if classOf(text, p) ~= kind then break end
		s = p
	end
	return s
end

local function motionEnd(text, pos, big)
	local i = pos
	if classOf(text, nextByte(text, i)) == classOf(text, i) and classOf(text, i) ~= "space" and classOf(text, i) ~= "nl" then
		i = nextByte(text, i)
	else
		i = nextByte(text, i)
		while classOf(text, i) == "space" or classOf(text, i) == "nl" do
			if i > #text then return clamp(text, pos) end
			i = nextByte(text, i)
		end
	end
	local kind = big and (classOf(text, i) == "space" and "space" or "word") or classOf(text, i)
	if big then
		while i <= #text and classOf(text, nextByte(text, i)) ~= "space" and classOf(text, nextByte(text, i)) ~= "nl" and nextByte(text, i) <= #text do
			local n = nextByte(text, i)
			if classOf(text, n) == "space" or classOf(text, n) == "nl" then break end
			i = n
		end
		return clamp(text, i)
	end
	while nextByte(text, i) <= #text and classOf(text, nextByte(text, i)) == kind do
		i = nextByte(text, i)
	end
	return clamp(text, i)
end

local function lineNumber(text, pos)
	local n = 1
	for i = 1, math.min(pos, #text) - 1 do
		if text:byte(i) == 10 then n = n + 1 end
	end
	return n
end

local function startOfLine(text, n)
	if n <= 1 then return 1 end
	local seen = 1
	for i = 1, #text do
		if text:byte(i) == 10 then
			seen = seen + 1
			if seen == n then return i + 1 end
		end
	end
	return #text + 1
end

local function firstNonBlank(text, start, finish)
	local i = start
	while i < finish and classOf(text, i) == "space" do i = nextByte(text, i) end
	if i >= finish and finish > start then return start end
	return i
end

local function moveVertical(text, pos, prefer, delta)
	local target = lineNumber(text, pos) + delta
	if target < 1 then target = 1 end
	local s = startOfLine(text, target)
	if s > #text + 1 then s = lineStart(text, #text + 1) end
	local e = lineEnd(text, s)
	return atColumn(text, s, e, prefer)
end

-- exclusive: destination character is not included. inclusive: it is.
-- linewise: whole lines covered by the two positions.
local linewiseKeys = { j = true, k = true, ["+"] = true, gg = true, G = true }

-- British shift layer. Used only when the event did not already carry the
-- shifted character, so a layout that does is left alone.
local shiftPlain = {
	["1"] = "!", ["2"] = "@", ["3"] = "£", ["4"] = "$", ["5"] = "%",
	["6"] = "^", ["7"] = "&", ["8"] = "*", ["9"] = "(", ["0"] = ")",
	["-"] = "_", ["="] = "+",
	["["] = "{", ["]"] = "}",
	[";"] = ":", ["'"] = "\"",
	["\\"] = "|",
	[","] = "<", ["."] = ">", ["/"] = "?",
}

local padKey = {
	pad0 = "0", pad1 = "1", pad2 = "2", pad3 = "3", pad4 = "4",
	pad5 = "5", pad6 = "6", pad7 = "7", pad8 = "8", pad9 = "9",
	["pad+"] = "+", ["pad-"] = "-",
}

local function singleChar(char)
	if type(char) ~= "string" or char == "" or char:find("%c") then return nil end
	if utf8len(char:byte(1)) ~= #char then return nil end
	return char
end

local function resolveKey(input)
	local char = singleChar(input.char)
	local name = padKey[input.key]
	if not name and type(input.key) == "string" and #input.key == 1 then name = input.key end
	if char and not (input.shift and char == name) then return char end
	local key = name
	if input.shift and key then
		key = shiftPlain[key] or (key:match("%l") and key:upper()) or key
	end
	return key
end

local function moveOnce(text, pos, prefer, key)
	local s, e = lineStart(text, pos), lineEnd(text, pos)
	if key == "h" or key == "left" then
		if pos > s then return prevByte(text, pos), column(text, prevByte(text, pos)), "exclusive" end
		return pos, prefer, "exclusive"
	end
	if key == "l" or key == "right" then
		local n = nextByte(text, pos)
		if n < e then return n, column(text, n), "exclusive" end
		return pos, prefer, "exclusive"
	end
	if key == "0" then return s, 0, "exclusive" end
	if key == "^" then
		local p = firstNonBlank(text, s, e)
		return p, column(text, p), "exclusive"
	end
	if key == "$" then
		local p = e > s and prevByte(text, e) or s
		return p, math.huge, "inclusive"
	end
	if key == "w" or key == "W" then
		local p = motionWord(text, pos, key == "W", 1)
		return p, column(text, p), "exclusive"
	end
	if key == "b" or key == "B" then
		local p = motionWord(text, pos, key == "B", -1)
		return p, column(text, p), "exclusive"
	end
	if key == "e" or key == "E" then
		local p = motionEnd(text, pos, key == "E")
		return p, column(text, p), "inclusive"
	end
	if key == "j" or key == "+" or key == "return" then
		local p = moveVertical(text, pos, prefer, 1)
		if key ~= "j" then p = firstNonBlank(text, lineStart(text, p), lineEnd(text, p)) end
		return p, key == "j" and prefer or column(text, p), "linewise"
	end
	if key == "k" then
		return moveVertical(text, pos, prefer, -1), prefer, "linewise"
	end
	if key == "gg" then return 1, 0, "linewise" end
	if key == "G" then
		local p = lineStart(text, #text + 1)
		p = clamp(text, p > #text and prevByte(text, #text + 1) or p)
		return p, 0, "linewise"
	end
	return nil
end

local function repeatMotion(text, pos, prefer, key, count)
	local kind = "exclusive"
	for _ = 1, count do
		local np, nprefer, nkind = moveOnce(text, pos, prefer, key)
		if not np or np == pos and key ~= "j" and key ~= "k" then
			if np then pos, prefer, kind = np, nprefer, nkind end
			break
		end
		pos, prefer, kind = np, nprefer, nkind
	end
	return pos, prefer, kind
end

local function spanBetween(text, origin, dest, kind)
	if kind == "linewise" then
		local a = math.min(lineNumber(text, origin), lineNumber(text, dest))
		local b = math.max(lineNumber(text, origin), lineNumber(text, dest))
		local start = startOfLine(text, a)
		local last = lineEnd(text, startOfLine(text, b))
		local finish = last
		if last <= #text and text:byte(last) == 10 then finish = last + 1 end
		if finish > #text + 1 then finish = #text + 1 end
		-- deleting the last line also takes the previous newline
		if finish == #text + 1 and start > 1 and text:byte(start - 1) == 10 and last > #text then
			start = start - 1
		end
		return start, finish, firstNonBlank(text, start, lineEnd(text, start))
	end
	local left = math.min(origin, dest)
	local right = math.max(origin, dest)
	if kind == "inclusive" then right = nextByte(text, right) end
	return left, right, left
end

local function deleteRange(text, a, b, cursor)
	if b < a then a, b = b, a end
	if a < 1 then a = 1 end
	if b > #text + 1 then b = #text + 1 end
	local yanked = text:sub(a, b - 1)
	local newText = text:sub(1, a - 1) .. text:sub(b)
	local pos = cursor or a
	if pos > #newText + 1 then pos = #newText + 1 end
	return newText, yanked, pos
end

local function findPair(text, pos, open, close)
	local balance = 0
	local i = pos
	while i >= 1 do
		local ch = text:sub(i, i)
		if ch == close and not (open == close) then balance = balance + 1
		elseif ch == open then
			if balance == 0 then
				local j, depth = nextByte(text, i), 1
				while j <= #text do
					local c = text:sub(j, j)
					if c == open and open ~= close then depth = depth + 1 end
					if c == close then
						depth = depth - 1
						if depth == 0 then return i, j end
					end
					j = nextByte(text, j)
				end
				return nil
			end
			balance = balance - 1
		end
		if i == 1 then break end
		i = prevByte(text, i)
	end
	return nil
end

local function quoteSpan(text, pos, quote)
	local s = lineStart(text, pos)
	local e = lineEnd(text, s)
	local first
	local i = s
	while i < e do
		if text:sub(i, i) == quote and text:byte(i - 1) ~= 92 then
			if not first then first = i
			elseif pos >= first and pos <= i then
				return first, i
			else first = i end
		end
		i = nextByte(text, i)
	end
	return nil
end

local pairsFor = {
	["("] = { "(", ")" }, [")"] = { "(", ")" }, b = { "(", ")" },
	["["] = { "[", "]" }, ["]"] = { "[", "]" },
	["{"] = { "{", "}" }, ["}"] = { "{", "}" }, B = { "{", "}" },
	["<"] = { "<", ">" }, [">"] = { "<", ">" },
	['"'] = { '"' }, ["'"] = { "'" }, ["`"] = { "`" },
}

local function objectSpan(text, pos, around, spec)
	local pair = pairsFor[spec]
	if not pair then
		if spec ~= "w" and spec ~= "W" then return nil end
		local big = spec == "W"
		local kind = classOf(text, pos)
		if kind == "nl" then return nil end
		local target = (kind == "space" or big) and (big and kind ~= "nl" and "word" or kind) or kind
		if big and kind ~= "space" then target = nil end
		local a = pos
		if spec == "w" then
			while a > 1 and classOf(text, prevByte(text, a)) == classOf(text, pos) and classOf(text, pos) ~= "nl" do
				a = prevByte(text, a)
			end
		else
			while a > 1 and classOf(text, prevByte(text, a)) ~= "space" and classOf(text, prevByte(text, a)) ~= "nl" do
				a = prevByte(text, a)
			end
		end
		local b = pos
		if spec == "w" then
			while nextByte(text, b) <= #text and classOf(text, nextByte(text, b)) == classOf(text, pos) do
				b = nextByte(text, b)
			end
		else
			while nextByte(text, b) <= #text and classOf(text, nextByte(text, b)) ~= "space" and classOf(text, nextByte(text, b)) ~= "nl" do
				b = nextByte(text, b)
			end
		end
		b = nextByte(text, b)
		if around then
			local after = b
			while after <= #text and classOf(text, after) == "space" do after = nextByte(text, after) end
			if after ~= b then return a, after end
			local before = a
			while before > 1 and classOf(text, prevByte(text, before)) == "space" do before = prevByte(text, before) end
			return before, b
		end
		return a, b
	end
	if #pair == 1 then
		local a, b = quoteSpan(text, pos, pair[1])
		if not a then return nil end
		if around then return a, nextByte(text, b) end
		return nextByte(text, a), b
	end
	local a, b = findPair(text, pos, pair[1], pair[2])
	if not a then return nil end
	if around then return a, nextByte(text, b) end
	return nextByte(text, a), b
end

local function linesOf(text)
	local lines, s = {}, 1
	for i = 1, #text + 1 do
		if i > #text or text:byte(i) == 10 then
			lines[#lines + 1] = { start = s, finish = i, text = text:sub(s, i - 1) }
			s = i + 1
		end
	end
	if #lines == 0 then lines[1] = { start = 1, finish = 1, text = "" } end
	return lines
end

local function visualSpan(text, state)
	if state.mode == "visual-line" then
		local a = math.min(lineNumber(text, state.anchor), lineNumber(text, state.pos))
		local b = math.max(lineNumber(text, state.anchor), lineNumber(text, state.pos))
		local start = startOfLine(text, a)
		local last = lineEnd(text, startOfLine(text, b))
		local finish = (last <= #text and text:byte(last) == 10) and last + 1 or last
		return start, finish, "line"
	end
	if state.mode == "visual-block" then
		return nil, nil, "block"
	end
	local a = math.min(state.anchor, state.pos)
	local b = math.max(state.anchor, state.pos)
	return a, nextByte(text, b), "char"
end

local function blockSlices(text, state)
	local lines = linesOf(text)
	local function loc(p)
		for n, line in ipairs(lines) do
			if p >= line.start and p <= line.finish then
				return n, column(text, math.min(p, math.max(line.start, line.finish - (line.finish > line.start and 0 or 0))))
			end
		end
		return #lines, 0
	end
	local l1, c1 = loc(state.anchor)
	local l2, c2 = loc(state.pos)
	if l1 > l2 then l1, l2 = l2, l1 end
	if c1 > c2 then c1, c2 = c2, c1 end
	return lines, l1, l2, c1, c2
end

local function applyBlock(text, state, how)
	local lines, l1, l2, c1, c2 = blockSlices(text, state)
	local yanked, built = {}, {}
	for n, line in ipairs(lines) do
		if n < l1 or n > l2 then
			built[#built + 1] = line.text
		else
			local chars = {}
			local i = line.start
			while i < line.finish do
				chars[#chars + 1] = text:sub(i, nextByte(text, i) - 1)
				i = nextByte(text, i)
			end
			local slice, keep = {}, {}
			for c = 1, #chars do
				if c - 1 >= c1 and c - 1 <= c2 then slice[#slice + 1] = chars[c]
				else keep[#keep + 1] = chars[c] end
			end
			yanked[#yanked + 1] = table.concat(slice)
			if how == "y" then built[#built + 1] = line.text
			else built[#built + 1] = table.concat(keep) end
		end
	end
	local newText = table.concat(built, "\n")
	local cursorLine = lines[l1]
	local cursor = atColumn(text, cursorLine.start, cursorLine.finish, c1)
	-- recompute cursor against newText's first changed line
	local ns = startOfLine(newText, l1)
	local ne = lineEnd(newText, ns)
	cursor = atColumn(newText, ns, ne, c1)
	if how ~= "y" and cursor >= ne and ne > ns then cursor = prevByte(newText, ne) end
	return newText, table.concat(yanked, "\n"), clamp(newText, cursor)
end

local function finishOp(state, text, a, b, cursor, intoInsert)
	local newText, yanked, pos = deleteRange(text, a, b, cursor)
	if intoInsert then
		if pos > #newText + 1 then pos = #newText + 1 end
		state.mode = "insert"
		state.pos = pos
	else
		state.mode = "normal"
		state.pos = clamp(newText, pos)
		state.prefer = column(newText, state.pos)
	end
	state.op, state.obj, state.count, state.opcount, state.anchor = nil, nil, nil, nil, nil
	return state, newText, yanked
end

local function clearPending(state)
	state.op, state.obj, state.count, state.opcount = nil, nil, nil, nil
	return state
end

local function feedNormal(state, text, key)
	if key == "escape" then
		clearPending(state)
		if state.mode ~= "normal" then
			state.mode = "normal"
			state.pos = clamp(text, state.pos)
			state.anchor = nil
		end
		return state, text, nil
	end
	if key:match("^%d$") and (key ~= "0" or state.count) then
		state.count = (state.count or 0) * 10 + tonumber(key)
		return state, text, nil
	end
	local count = state.count or 1
	state.count = nil

	if state.obj then
		local around = state.obj == "a"
		local op = state.op
		local a, b = objectSpan(text, state.pos, around, key)
		state.obj = nil
		if not a then return clearPending(state), text, nil end
		if state.mode == "visual" or state.mode == "visual-line" or state.mode == "visual-block" then
			state.anchor, state.pos = a, prevByte(text, b)
			state.mode = "visual"
			return state, text, nil
		end
		if not op then return state, text, nil end
		local cursor = a
		if op == "y" then
			local yanked = text:sub(a, b - 1)
			state.pos = clamp(text, a)
			clearPending(state)
			state.mode = "normal"
			return state, text, yanked
		end
		return finishOp(state, text, a, b, cursor, op == "c")
	end

	if (state.mode == "visual" or state.mode == "visual-line" or state.mode == "visual-block") and (key == "d" or key == "x" or key == "c" or key == "y") then
		if state.mode == "visual-block" then
			local newText, yanked, pos = applyBlock(text, state, key == "y" and "y" or "d")
			if key == "y" then
				state.mode = "normal"
				state.anchor = nil
				state.pos = clamp(text, pos)
				return clearPending(state), text, yanked
			end
			state.mode = key == "c" and "insert" or "normal"
			state.anchor = nil
			state.pos = key == "c" and pos or clamp(newText, pos)
			return clearPending(state), newText, yanked
		end
		local a, b = visualSpan(text, state)
		if key == "y" then
			local yanked = text:sub(a, b - 1)
			state.mode = "normal"
			state.pos = clamp(text, a)
			state.anchor = nil
			return clearPending(state), text, yanked
		end
		return finishOp(state, text, a, b, a, key == "c")
	end

	if not state.op and (key == "v" or key == "V" or key == "ctrl-v") then
		state.anchor = state.pos
		state.mode = key == "V" and "visual-line" or (key == "ctrl-v" and "visual-block" or "visual")
		return state, text, nil
	end

	if not state.op and (key == "d" or key == "c" or key == "y") then
		if state.mode == "normal" then
			state.opcount = count
			state.op = key
			return state, text, nil
		end
	end

	if state.op and key == state.op and state.mode == "normal" then
		local n = state.opcount or count
		local line = lineNumber(text, state.pos)
		local destLine = line + n - 1
		local dest = clamp(text, startOfLine(text, destLine))
		local a, b, cursor = spanBetween(text, state.pos, dest, "linewise")
		if state.op == "c" then
			-- cc keeps the line and removes its contents
			local s = lineStart(text, state.pos)
			local lastLine = startOfLine(text, destLine)
			local e = lineEnd(text, lastLine)
			local yanked = text:sub(s, e - 1)
			local newText = text:sub(1, s - 1) .. text:sub(e)
			state.mode = "insert"
			state.pos = s
			return clearPending(state), newText, yanked
		end
		if state.op == "y" then
			local yanked = text:sub(a, b - 1)
			clearPending(state)
			return state, text, yanked
		end
		return finishOp(state, text, a, b, cursor, false)
	end

	if key == "i" or key == "a" then
		if state.op or state.mode == "visual" or state.mode == "visual-line" or state.mode == "visual-block" then
			state.obj = key
			return state, text, nil
		end
	end

	if state.mode == "normal" and not state.op then
		if key == "i" then
			state.mode = "insert"
			return state, text, nil
		end
		if key == "a" then
			local e = lineEnd(text, lineStart(text, state.pos))
			local n = nextByte(text, state.pos)
			state.pos = (state.pos < e and n < e) and n or e
			if text:byte(state.pos) == 10 then state.pos = state.pos end
			if state.pos > e then state.pos = e end
			state.mode = "insert"
			return state, text, nil
		end
		if key == "I" then
			local s, e = lineStart(text, state.pos), lineEnd(text, state.pos)
			state.pos = firstNonBlank(text, s, e)
			state.mode = "insert"
			return state, text, nil
		end
		if key == "A" then
			state.pos = lineEnd(text, lineStart(text, state.pos))
			state.mode = "insert"
			return state, text, nil
		end
		if key == "o" or key == "O" then
			local s = lineStart(text, state.pos)
			local e = lineEnd(text, s)
			local at = key == "o" and (e <= #text and e + 1 or e) or s
			local newText = text:sub(1, at - 1) .. "\n" .. text:sub(at)
			state.mode = "insert"
			state.pos = key == "o" and at + 1 or at
			return state, newText, nil
		end
		if key == "x" or key == "X" then
			local origin = state.pos
			local e = lineEnd(text, lineStart(text, origin))
			if key == "x" then
				local b = origin
				for _ = 1, count do
					if b >= e then break end
					b = nextByte(text, b)
				end
				if b == origin then return state, text, nil end
				return finishOp(state, text, origin, b, origin, false)
			end
			local a = origin
			for _ = 1, count do
				if a <= lineStart(text, origin) then break end
				a = prevByte(text, a)
			end
			if a == origin then return state, text, nil end
			return finishOp(state, text, a, origin, a, false)
		end
		if key == "s" then
			local e = lineEnd(text, lineStart(text, state.pos))
			if state.pos >= e then return state, text, nil end
			return finishOp(state, text, state.pos, nextByte(text, state.pos), state.pos, true)
		end
		if key == "D" or key == "C" or key == "Y" then
			local dest = select(1, moveOnce(text, state.pos, state.prefer, "$"))
			local a, b = spanBetween(text, state.pos, dest, "inclusive")
			if key == "Y" then
				local s = lineStart(text, state.pos)
				local e = lineEnd(text, s)
				local finish = (e <= #text and text:byte(e) == 10) and e + 1 or e
				return state, text, text:sub(s, finish - 1)
			end
			return finishOp(state, text, a, b, a, key == "C")
		end
		if key == "p" or key == "P" then
			local clip = state.clipboard or ""
			if clip == "" then return state, text, nil end
			local at
			if key == "P" then
				at = state.pos
			else
				local e = lineEnd(text, lineStart(text, state.pos))
				local n = nextByte(text, state.pos)
				at = n <= e and n or e
			end
			if clip:find("\n", 1, true) then
				local s = lineStart(text, state.pos)
				local e = lineEnd(text, s)
				at = key == "P" and s or (e <= #text and e + 1 or #text + 1)
				if clip:sub(-1) ~= "\n" then clip = clip .. "\n" end
			end
			local newText = text:sub(1, at - 1) .. clip .. text:sub(at)
			state.pos = clamp(newText, at)
			return state, newText, nil
		end
	end

	local moved, prefer, kind
	if key == "_" or key == "-" then
		local total = (state.op and (state.opcount or 1) or 1) * count
		local delta = key == "-" and -total or (total - 1)
		moved = moveVertical(text, state.pos, 0, delta)
		local s = lineStart(text, moved)
		moved = firstNonBlank(text, s, lineEnd(text, s))
		prefer = column(text, moved)
		kind = "linewise"
	else
		moved, prefer, kind = repeatMotion(text, state.pos, state.prefer or 0, key, count)
	end
	if not moved then return clearPending(state), text, nil end
	if state.op then
		local times = state.opcount or 1
		if times > 1 and linewiseKeys[key] then
			moved, prefer, kind = repeatMotion(text, state.pos, state.prefer or 0, key, count * times)
		end
		local a, b, cursor = spanBetween(text, state.pos, moved, kind)
		if state.op == "y" then
			local yanked = text:sub(a, math.max(a, b) - 1)
			state.pos = clamp(text, kind == "linewise" and cursor or math.min(state.pos, moved))
			state.prefer = column(text, state.pos)
			clearPending(state)
			return state, text, yanked
		end
		return finishOp(state, text, a, b, kind == "linewise" and cursor or math.min(a, b > a and a or a), state.op == "c")
	end
	state.pos = moved
	state.prefer = prefer
	return state, text, nil
end

local modifierKey = {
	shift = true, rightshift = true,
	ctrl = true, rightctrl = true,
	alt = true, rightalt = true,
	cmd = true, rightcmd = true,
	fn = true, capslock = true,
}

function M.feed(state, text, input)
	state.clipboard = input.clipboard
	-- The shift key has no character. Swallowing it means the following key
	-- arrives unshifted, so $ and ^ show up as the digits 4 and 6.
	if modifierKey[input.key] then return state, text, { pass = true } end
	if input.cmd then return state, text, { pass = true } end
	if input.ctrl and input.key ~= "v" then return state, text, { pass = true } end
	-- Right command is option, and that layer types symbols such as 0, $ and ^
	-- as characters. Option with anything else is a shortcut for the app.
	local optionChar
	if input.alt then
		optionChar = singleChar(input.char)
		local named = type(input.key) == "string" and #input.key == 1
		if not optionChar or not named then return state, text, { pass = true } end
	end
	local key
	if input.ctrl and input.key == "v" then key = "ctrl-v"
	elseif input.key == "escape" then key = "escape"
	elseif input.key == "return" or input.key == "padenter" then key = "return"
	elseif input.key == "left" then key = "h"
	elseif input.key == "right" then key = "l"
	elseif input.key == "up" then key = "k"
	elseif input.key == "down" then key = "j"
	elseif input.key == "delete" or input.key == "forwarddelete" then key = "x"
	elseif optionChar then key = optionChar
	else key = resolveKey(input) end
	if not key then
		if state.mode == "insert" then return state, text, { pass = true } end
		return state, text, { caret = state.pos, mode = state.mode }
	end
	if state.mode == "insert" then
		if key ~= "escape" then return state, text, { pass = true } end
		return state, text, { enterNormal = true }
	end
	local newState, newText, yanked, paste = feedNormal(state, text, key)
	local info = { yank = yanked, caret = newState.pos, mode = newState.mode, key = key }
	if paste then info.paste = true end
	if newState.mode == "visual" or newState.mode == "visual-line" then
		local a, b = visualSpan(newText, newState)
		info.select = { a, b }
	elseif newState.mode == "normal" or newState.mode == "insert" then
		info.select = nil
	end
	return newState, newText, info
end

return M
