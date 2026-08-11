local function user_id()
  return vim.uv.os_get_passwd().uid
end

local function review_socket()
  local pane = vim.env.PI_CODE_OWNER_PANE
  local tmux_socket = vim.env.PI_CODE_TMUX_SOCKET
  if pane and pane:match("^%%%d+$") and tmux_socket then
    return string.format(
      "%s/.local/state/pi-comments/%s-%s-%s.sock",
      vim.env.HOME,
      vim.fn.sha256(tmux_socket):sub(1, 16),
      user_id(),
      pane:sub(2)
    )
  end

  local tmux = vim.env.TMUX
  if not tmux then
    return nil, "Code comments require tmux"
  end

  local tmux_hash = vim.fn.sha256(tmux:match("^[^,]+")):sub(1, 16)
  local pattern = string.format(
    "%s/.local/state/pi-comments/%s-%s-*.sock",
    vim.env.HOME,
    tmux_hash,
    user_id()
  )
  local sockets = vim.fn.glob(pattern, false, true)
  if #sockets == 1 then
    return sockets[1]
  end
  if #sockets > 1 then
    return nil, "Multiple Pi code-comment sessions are active; open Neovim from the target Pi pane"
  end
  return nil, "No active Pi code-comment session is available"
end

local function relative_path(path)
  local root = vim.fs.root(path, { ".git" }) or vim.uv.cwd()
  if not root then
    return path
  end

  local relative = vim.fs.relpath(root, path)
  return relative or path
end

local function diffbandit_metadata(bufnr)
  local ok, state = pcall(require, "diffbandit.state")
  local session = ok and state.sessions[vim.api.nvim_get_current_tabpage()]
  if not session then
    return nil
  end

  if session.left_buf == bufnr then
    return { path = session.left.path, side = "old" }
  end
  if session.right_buf == bufnr then
    return { path = session.right.path, side = "new" }
  end
end

local function diff_metadata(bufnr)
  return diffbandit_metadata(bufnr)
end

local function selection()
  local bufnr = vim.api.nvim_get_current_buf()
  local diff = diff_metadata(bufnr)
  local path = diff and diff.path or vim.api.nvim_buf_get_name(bufnr)
  if not path or path == "" then
    return nil, "Code comments require a file-backed buffer"
  end

  local start_line = vim.api.nvim_win_get_cursor(0)[1]
  local end_line = start_line
  local mode = vim.fn.mode()
  if mode == "v" or mode == "V" or mode == "\22" then
    local anchor_line = vim.fn.getpos("v")[2]
    start_line = math.min(anchor_line, end_line)
    end_line = math.max(anchor_line, end_line)
  end

  return {
    version = 1,
    path = relative_path(path),
    startLine = start_line,
    endLine = end_line,
    selectedContent = table.concat(vim.api.nvim_buf_get_lines(bufnr, start_line - 1, end_line, false), "\n"),
    side = diff and diff.side or nil,
  }
end

local function report(message, level)
  if level == vim.log.levels.ERROR then
    vim.fn.setreg("+", message)
    vim.api.nvim_err_writeln(message)
    message = message .. " (copied to clipboard)"
  end
  vim.notify(message, level)
end

local function submit(comment, win)
  local text = table.concat(vim.api.nvim_buf_get_lines(win.buf, 0, -1, false), "\n")
  if text:match("^%s*$") then
    vim.notify("Code comment cannot be empty", vim.log.levels.WARN)
    return
  end

  comment.comment = text
  local socket_path, socket_error = review_socket()
  if not socket_path then
    vim.notify(socket_error, vim.log.levels.ERROR)
    return
  end

  local client = vim.uv.new_pipe(false)
  local timer = vim.uv.new_timer()
  local response = ""
  local finished = false
  local function done(message, level)
    if finished then
      return
    end
    finished = true
    timer:stop()
    timer:close()
    client:read_stop()
    client:close()
    if message then
      vim.schedule(function()
        report(message, level)
      end)
    end
  end

  timer:start(1500, 0, function()
    done("Pi did not accept the code comment", vim.log.levels.ERROR)
  end)
  client:connect(socket_path, function(error)
    if error then
      done("Could not connect to Pi: " .. error, vim.log.levels.ERROR)
      return
    end

    client:read_start(function(read_error, data)
      if read_error then
        done("Pi rejected the code comment: " .. read_error, vim.log.levels.ERROR)
        return
      end
      if not data then
        done("Pi closed the code-comment connection", vim.log.levels.ERROR)
        return
      end

      response = response .. data
      local line = response:match("^(.-)\n")
      if not line then
        return
      end
      local ok, reply = pcall(vim.json.decode, line)
      if ok and reply.ok == true then
        done("Code comment added to Pi's draft", vim.log.levels.INFO)
      elseif ok and type(reply.error) == "string" then
        done("Pi rejected the code comment: " .. reply.error, vim.log.levels.ERROR)
      else
        done("Pi rejected the code comment", vim.log.levels.ERROR)
      end
    end)
    client:write(vim.json.encode(comment) .. "\n")
  end)

  win:close()
end

local function leave_nvim(direction)
  vim.fn.system({ "tmux", "select-pane", direction })
end

local function comment_window_options()
  local height = 8
  local row = vim.fn.winline()
  local below = vim.api.nvim_win_get_height(0) - row
  local above = below < height + 2

  return {
    relative = "cursor",
    anchor = above and "SW" or "NW",
    row = above and -1 or 1,
    col = 0,
    width = math.min(72, math.floor(vim.api.nvim_win_get_width(0) * 0.6)),
    height = height,
  }
end

local function open_comment()
  local comment, error = selection()
  if not comment then
    vim.notify(error, vim.log.levels.WARN)
    return
  end

  local win = Snacks.win(vim.tbl_extend("force", {
    title = " Code comment ",
    border = "rounded",
    enter = true,
    scratch_ft = "markdown",
    bo = { bufhidden = "wipe", modifiable = true },
    wo = { wrap = true, linebreak = true, breakindent = true },
  }, comment_window_options()))

  vim.keymap.set("n", "<CR>", function()
    submit(comment, win)
  end, { buffer = win.buf, desc = "Submit code comment" })
  vim.keymap.set("i", "<D-CR>", function()
    submit(comment, win)
  end, { buffer = win.buf, desc = "Submit code comment" })
  vim.keymap.set({ "n", "i" }, "<C-h>", function()
    leave_nvim("-L")
  end, { buffer = win.buf, desc = "Focus left tmux pane" })
  vim.keymap.set({ "n", "i" }, "<C-l>", function()
    leave_nvim("-R")
  end, { buffer = win.buf, desc = "Focus right tmux pane" })
  vim.keymap.set("n", "q", function()
    win:close()
  end, { buffer = win.buf, desc = "Cancel code comment" })
  vim.cmd.startinsert()
end

return {
  "folke/snacks.nvim",
  keys = {
    { "<leader>lc", open_comment, mode = { "n", "v" }, desc = "Add code comment to Pi" },
  },
}
