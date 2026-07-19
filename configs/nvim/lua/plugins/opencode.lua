return {
  "NickjvandyKe/opencode.nvim",
  lazy = false, -- Load immediately so autocmd registers
  dependencies = {
    -- Required for `ask()` and `select()` - you already have snacks.nvim
    "folke/snacks.nvim",
  },
  keys = {
    { "<leader>la", function() require("opencode").ask("@this: ", { submit = true }) end, mode = { "n", "x" }, desc = "Ask opencode..." },
    { "<leader>le", function() require("opencode").select() end, mode = { "n", "x" }, desc = "Select opencode action..." },
    { "<C-p>", function() require("opencode").toggle() end, mode = { "n", "t" }, desc = "Toggle opencode" },
    { "<leader>lp", function() return require("opencode").operator("@this ") end, mode = { "n", "x" }, desc = "Add range to opencode", expr = true },
    { "<leader>ll", function() return require("opencode").operator("@this ") .. "_" end, mode = "n", desc = "Add line to opencode", expr = true },
    { "<leader>lu", function() require("opencode").command("session.half.page.up") end, mode = "n", desc = "Scroll opencode up" },
    { "<leader>ld", function() require("opencode").command("session.half.page.down") end, mode = "n", desc = "Scroll opencode down" },
  },
  config = function()
    ---@type opencode.Opts
    vim.g.opencode_opts = {
      -- Add custom configuration here if needed
    }

    -- Required for `opts.events.reload`
    vim.o.autoread = true

    -- Register which-key group
    local ok, wk = pcall(require, "which-key")
    if ok then
      wk.add({
        { "<leader>l", group = "AI" },
      })
    end

    -- Stop opencode when quitting Neovim
    vim.api.nvim_create_autocmd("VimLeavePre", {
      callback = function()
        pcall(function()
          require("opencode").stop()
        end)
      end,
    })
  end,
}
