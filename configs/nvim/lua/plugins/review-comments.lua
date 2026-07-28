local function user_id()
  return vim.uv.os_get_passwd().uid
end

local function review_socket()
  local pane = vim.env.PI_REVIEW_OWNER_PANE
  local tmux_socket = vim.env.PI_REVIEW_TMUX_SOCKET
  if pane and pane:match("^%%%d+$") and tmux_socket then
    return string.format(
      "%s/.local/state/pi-review/%s-%s-%s.sock",
      vim.env.HOME,
      vim.fn.sha256(tmux_socket):sub(1, 16),
      user_id(),
      pane:sub(2)
    )
  end

  local tmux = vim.env.TMUX
  if not tmux then
    return nil, "Review comments require tmux"
  end

  local tmux_hash = vim.fn.sha256(tmux:match("^[^,]+")):sub(1, 16)
  local pattern = string.format(
    "%s/.local/state/pi-review/%s-%s-*.sock",
    vim.env.HOME,
    tmux_hash,
    user_id()
  )
  local sockets = vim.fn.glob(pattern, false, true)
  if #sockets == 1 then
    return sockets[1]
  end
  if #sockets > 1 then
    return nil, "Multiple Pi review sessions are active; open Neovim from the target Pi pane"
  end
  return nil, "No active Pi review session is available"
end

local function relative_path(path)
  local root = vim.fs.root(path, { ".git" }) or vim.uv.cwd()
  if not root then
    return path
  end

  local relative = vim.fs.relpath(root, path)
  return relative or path
end

local function diff_metadata(bufnr)
  local ok, lib = pcall(require, "diffview.lib")
  if not ok then
    return nil
  end

  local view = lib.get_current_view()
  local layout = view and view.cur_layout
  if not layout then
    return nil
  end

  for symbol, side in pairs({ a = "old", b = "new" }) do
    local window = layout[symbol]
    if window and window.file.bufnr == bufnr then
      return { path = window.file.absolute_path or window.file.path, side = side }
    end
  end
end

local function selection()
  local bufnr = vim.api.nvim_get_current_buf()
  local diff = diff_metadata(bufnr)
  local path = diff and diff.path or vim.api.nvim_buf_get_name(bufnr)
  if not path or path == "" then
    return nil, "Review comments require a file-backed buffer"
  end

  local start_line = vim.api.nvim_win_get_cursor(0)[1]
  local end_line = start_line
  if vim.fn.mode():find("[vV]") then
    start_line = vim.fn.line("'<")
    end_line = vim.fn.line("'>")
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

local function submit(comment, win)
  local text = table.concat(vim.api.nvim_buf_get_lines(win.buf, 0, -1, false), "\n")
  if text:match("^%s*$") then
    vim.notify("Review comment cannot be empty", vim.log.levels.WARN)
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
        vim.notify(message, level)
      end)
    end
  end

  timer:start(1500, 0, function()
    done("Pi did not accept the review comment", vim.log.levels.ERROR)
  end)
  client:connect(socket_path, function(error)
    if error then
      done("Could not connect to Pi: " .. error, vim.log.levels.ERROR)
      return
    end

    client:read_start(function(read_error, data)
      if read_error then
        done("Pi rejected the review comment: " .. read_error, vim.log.levels.ERROR)
        return
      end
      if not data then
        done("Pi closed the review-comment connection", vim.log.levels.ERROR)
        return
      end

      response = response .. data
      local line = response:match("^(.-)\n")
      if not line then
        return
      end
      local ok, reply = pcall(vim.json.decode, line)
      if ok and reply.ok == true then
        done("Review comment added to Pi's draft", vim.log.levels.INFO)
      else
        done("Pi rejected the review comment", vim.log.levels.ERROR)
      end
    end)
    client:write(vim.json.encode(comment) .. "\n")
  end)

  win:close()
end

local function leave_nvim(direction)
  vim.fn.system({ "tmux", "select-pane", direction })
end

local function open_comment()
  local comment, error = selection()
  if not comment then
    vim.notify(error, vim.log.levels.WARN)
    return
  end

  local win = Snacks.win({
    title = " Review comment ",
    border = "rounded",
    width = 0.6,
    height = 0.35,
    enter = true,
    scratch_ft = "markdown",
    bo = { bufhidden = "wipe", modifiable = true },
  })

  vim.keymap.set("n", "<CR>", function()
    submit(comment, win)
  end, { buffer = win.buf, desc = "Submit review comment" })
  vim.keymap.set("i", "<D-CR>", function()
    submit(comment, win)
  end, { buffer = win.buf, desc = "Submit review comment" })
  vim.keymap.set({ "n", "i" }, "<C-h>", function()
    leave_nvim("-L")
  end, { buffer = win.buf, desc = "Focus left tmux pane" })
  vim.keymap.set({ "n", "i" }, "<C-l>", function()
    leave_nvim("-R")
  end, { buffer = win.buf, desc = "Focus right tmux pane" })
  vim.keymap.set("n", "q", function()
    win:close()
  end, { buffer = win.buf, desc = "Cancel review comment" })
  vim.cmd.startinsert()
end

return {
  "folke/snacks.nvim",
  keys = {
    { "<leader>lc", open_comment, mode = { "n", "v" }, desc = "Add review comment to Pi" },
  },
}
