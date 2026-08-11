local function open_git_panel_with_first_diff()
  local panel = require("diffbandit").commit_panel()
  if panel then
    panel:goto_queue_file(1)
  end
end

local function toggle_git_panel()
  local state = require("diffbandit.state")
  local tabpage = vim.api.nvim_get_current_tabpage()
  local session = state.sessions[tabpage]
  if session then
    session:toggle_commit_panel()
    return
  end

  local panel = state.panels[tabpage]
  if panel then
    panel:toggle_commit_panel()
    return
  end

  require("diffbandit").commit_panel()
end

return {
  {
    "CoreyKaylor/diffbandit.nvim",
    init = function()
      local group = vim.api.nvim_create_augroup("DiffBanditCustomKeymaps", { clear = true })
      vim.api.nvim_create_autocmd({ "BufWinEnter", "TabEnter", "WinEnter" }, {
        group = group,
        callback = function()
          vim.defer_fn(function()
            local ok, state = pcall(require, "diffbandit.state")
            local tabpage = vim.api.nvim_get_current_tabpage()
            local session = ok and state.sessions[tabpage]
            local standalone_panel = ok and state.panels[tabpage]
            if not session and standalone_panel then
              for _, buf in ipairs({ standalone_panel.panel.nav_buf, standalone_panel.panel.commit_buf }) do
                if buf and vim.api.nvim_buf_is_valid(buf) then
                  vim.keymap.set("n", "q", function()
                    standalone_panel:close()
                  end, { buffer = buf, silent = true, desc = "Close DiffBandit" })
                end
              end
              return
            end
            if not session then
              return
            end

            local panel = session.panel or {}
            for _, buf in ipairs({ session.left_buf, session.right_buf, panel.nav_buf, panel.commit_buf }) do
              if buf and vim.api.nvim_buf_is_valid(buf) then
                pcall(vim.keymap.del, "n", "]c", { buffer = buf })
                pcall(vim.keymap.del, "n", "[c", { buffer = buf })
                pcall(vim.keymap.del, "n", "<Space>", { buffer = buf })
                vim.keymap.set("n", "q", function()
                  session:close()
                end, { buffer = buf, silent = true, desc = "Close DiffBandit" })
                vim.keymap.set("n", "]h", function()
                  session:goto_next_chunk()
                end, { buffer = buf, silent = true, desc = "Next diff hunk" })
                vim.keymap.set("n", "[h", function()
                  session:goto_prev_chunk()
                end, { buffer = buf, silent = true, desc = "Previous diff hunk" })
                vim.keymap.set("n", "<C-h>", function()
                  local panel_win = panel.nav_win
                  local panel_open = panel_win and vim.api.nvim_win_is_valid(panel_win)
                  if vim.api.nvim_get_current_win() == session.right_win then
                    vim.api.nvim_set_current_win(session.left_win)
                  elseif vim.api.nvim_get_current_win() == session.left_win and panel_open then
                    vim.api.nvim_set_current_win(panel_win)
                  else
                    vim.fn.system({ "tmux", "select-pane", "-L" })
                  end
                end, { buffer = buf, silent = true, desc = "Focus left pane or tmux pane" })
                vim.keymap.set("n", "<C-l>", function()
                  local panel_win = panel.nav_win
                  local panel_open = panel_win and vim.api.nvim_win_is_valid(panel_win)
                  if panel_open and vim.api.nvim_get_current_win() == panel_win then
                    vim.api.nvim_set_current_win(session.left_win)
                  elseif vim.api.nvim_get_current_win() == session.left_win then
                    vim.api.nvim_set_current_win(session.right_win)
                  else
                    vim.fn.system({ "tmux", "select-pane", "-R" })
                  end
                end, { buffer = buf, silent = true, desc = "Focus right pane or tmux pane" })
              end
            end
          end, 100)
        end,
      })
    end,
    opts = {
      ui = {
        status = { icons = "nerd" },
      },
      navigation = { snap_key = "]z" },
      actions = {
        keys = {
          toggle_stage = "s",
          apply_left = "y>",
          apply_right = "y<",
        },
      },
      git = {
        panel = {
          icons = "nerd",
          keys = { toggle_stage = "s" },
        },
      },
    },
    keys = {
      { "<leader>gc", open_git_panel_with_first_diff, desc = "DiffBandit: Git panel" },
      { "<leader>gf", "<cmd>DiffBanditGitCurrent<cr>", desc = "DiffBandit: Current-file diff" },
      { "<leader>gp", toggle_git_panel, desc = "DiffBandit: Toggle commit panel" },
      { "<leader>gb", "<cmd>DiffBanditGitCompare<cr>", desc = "DiffBandit: Compare branches" },
    },
  },
  {
    "folke/which-key.nvim",
    optional = true,
    opts = {
      spec = {
        { "<leader>gb", desc = "DiffBandit: Compare branches" },
        { "<leader>gc", desc = "DiffBandit: Git panel" },
        { "<leader>gf", desc = "DiffBandit: Current-file diff" },
        { "<leader>gp", desc = "DiffBandit: Toggle commit panel" },
      },
    },
  },
}
