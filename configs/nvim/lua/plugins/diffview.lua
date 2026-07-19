return {
  {
    "sindrets/diffview.nvim",
    dependencies = { "nvim-lua/plenary.nvim" },
    opts = {
      keymaps = {
        file_panel = {
          ["q"] = "<cmd>DiffviewClose<cr>",
        },
      },
    },
    keys = {
      {
        "<leader>gc",
        function()
          local ok, lib = pcall(require, "diffview.lib")
          if ok and lib.get_current_view() then
            vim.cmd("DiffviewClose")
          else
            vim.cmd("DiffviewOpen")
          end
        end,
        desc = "Diffview: Toggle",
      },
    },
  },
  {
    "folke/which-key.nvim",
    optional = true,
    opts = {
      spec = {
        { "<leader>gc", desc = "Diffview: Toggle" },
      },
    },
  },
}
