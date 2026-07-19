return {
  "ThePrimeagen/99",
  config = function()
    local _99 = require("99")

    _99.setup({
      model = "openrouter/anthropic/claude-opus-4",
      md_files = {
        "AGENT.md",
      },
    })

    vim.keymap.set("n", "<leader>lf", function()
      _99.fill_in_function()
    end, { desc = "99: Fill in function" })

    vim.keymap.set("v", "<leader>lv", function()
      _99.visual()
    end, { desc = "99: Visual AI action" })

    vim.keymap.set("n", "<leader>ls", function()
      _99.stop_all_requests()
    end, { desc = "99: Stop all requests" })
  end,
}
