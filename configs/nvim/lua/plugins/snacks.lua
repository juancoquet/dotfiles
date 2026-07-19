return {
  "snacks.nvim",
  opts = {
    scroll = { enabled = false },
    input = {},    -- Required for opencode.nvim ask()
    terminal = {}, -- Required for opencode.nvim provider
    dashboard = {
      preset = {
        pick = function(cmd, opts)
          return LazyVim.pick(cmd, opts)()
        end,
        header = [[neovim

        ]],
      },
    },
    picker = {
      sources = {
        explorer = {
          layout = {
            layout = {
              position = "right",
              width = 60,
            },
          },
          win = {
            list = {
              wo = {
                number = true,
                relativenumber = true,
              },
            },
          },
        },
      },
    },
  },
}
