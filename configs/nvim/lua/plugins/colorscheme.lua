return {
  -- add kanso colorscheme
  {
    "webhooked/kanso.nvim",
    lazy = true,
    opts = {
      compile = false,
      undercurl = true,
      commentStyle = { italic = true },
      functionStyle = {},
      keywordStyle = { italic = true },
      statementStyle = {},
      typeStyle = {},
      disableItalics = false,
      transparent = false,
      dimInactive = false,
      terminalColors = true,
      colors = {
        palette = {},
        theme = { zen = {}, pearl = {}, ink = {}, all = {} },
      },
      theme = "zen",
      background = {
        dark = "zen",
        light = "pearl",
      },
    },
  },

  -- Configure LazyVim to load kanso-zen
  {
    "LazyVim/LazyVim",
    opts = {
      colorscheme = "kanso-zen",
    },
  },
}
