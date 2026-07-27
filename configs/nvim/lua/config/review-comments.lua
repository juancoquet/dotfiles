local M = {}

local function socket_path()
  local workspace = vim.env.PIW_WORKSPACE_ID
  if not workspace or workspace == "" then
    return nil
  end
  local runtime = vim.env.XDG_RUNTIME_DIR
  if not runtime or runtime == "" then
    runtime = string.format("/tmp/pi-workspaces-%s", vim.uv.os_getuid())
  end
  return runtime .. "/runtime/workspace-" .. workspace .. ".sock"
end

local function target(buf, start_line, end_line)
  local path = vim.api.nvim_buf_get_name(buf)
  local side = nil
  local ok, view = pcall(require, "diffview.lib")
  view = ok and view.get_current_view() or nil
  if view and view.cur_entry then
    path = view.cur_entry.path
    for _, file in ipairs(view.cur_entry.layout:files()) do
      if file.bufnr == buf then
        side = file.symbol == "a" and "old" or "new"
        break
      end
    end
  end
  return {
    path = vim.fn.fnamemodify(path, ":."),
    startLine = start_line,
    endLine = end_line,
    selectedText = table.concat(vim.api.nvim_buf_get_lines(buf, start_line - 1, end_line, false), "\n"),
    side = side,
  }
end

local function send(comment)
  local path = socket_path()
  if not path then
    vim.notify("Pi workspace socket is unavailable outside a managed workspace", vim.log.levels.ERROR)
    return
  end
  local channel = vim.fn.sockconnect("pipe", path, {
    rpc = false,
    on_data = function(_, data)
      local response = table.concat(data, "")
      local ok, result = pcall(vim.json.decode, response)
      if not ok or not result.ok then
        vim.schedule(function()
          vim.notify((ok and result.error) or "Pi workspace socket rejected the review comment", vim.log.levels.ERROR)
        end)
      end
    end,
  })
  if channel <= 0 then
    vim.notify("Pi workspace socket is missing or stale; review comment was not added", vim.log.levels.ERROR)
    return
  end
  vim.fn.chansend(channel, vim.json.encode(comment) .. "\n")
end

function M.open(mode)
  local buf = vim.api.nvim_get_current_buf()
  local start_line, end_line
  if mode == "visual" then
    start_line = vim.fn.line("'<")
    end_line = vim.fn.line("'>")
    if start_line > end_line then
      start_line, end_line = end_line, start_line
    end
  else
    start_line = vim.api.nvim_win_get_cursor(0)[1]
    end_line = start_line
  end
  local comment = target(buf, start_line, end_line)
  local location = comment.startLine == comment.endLine and string.format("%s:%d", comment.path, comment.startLine)
    or string.format("%s:%d-%d", comment.path, comment.startLine, comment.endLine)
  local win = Snacks.win({
    title = "Review comment",
    footer = location .. "  Enter: submit  q: cancel",
    width = 0.7,
    height = 0.4,
    enter = true,
    bo = { filetype = "markdown" },
    keys = {
      q = "close",
      ["<CR>"] = { mode = "n", desc = "Submit", function(self)
        local text = table.concat(vim.api.nvim_buf_get_lines(self.buf, 0, -1, false), "\n")
        if text:match("^%s*$") then
          vim.notify("Review comment cannot be empty", vim.log.levels.ERROR)
          return
        end
        comment.comment = text
        self:close()
        send(comment)
      end },
      ["<D-CR>"] = { mode = "i", desc = "Submit", function(self)
        local text = table.concat(vim.api.nvim_buf_get_lines(self.buf, 0, -1, false), "\n")
        if text:match("^%s*$") then
          vim.notify("Review comment cannot be empty", vim.log.levels.ERROR)
          return
        end
        comment.comment = text
        self:close()
        send(comment)
      end },
    },
  })
  win:show()
  vim.cmd("startinsert")
end

vim.keymap.set("n", "<leader>lc", function() M.open("normal") end, { desc = "Review: Comment line" })
vim.keymap.set("x", "<leader>lc", function() M.open("visual") end, { desc = "Review: Comment range" })

return M
