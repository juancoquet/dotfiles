return {
  "neovim/nvim-lspconfig",
  ---@class PluginLspOpts
  opts = {
    ---@type lspconfig.options
    inlay_hints = { enabled = false },
    servers = {
      pyright = { enabled = false },
      basedpyright = {
        root_markers = { ".basedpyright", "pyproject.toml", "pyrightconfig.json", ".git" },
        settings = {
          basedpyright = {
            analysis = {
              typeCheckingMode = "strict",
              diagnosticMode = "workspace",
              inlayHints = {
                variableTypes = true,
                functionReturnTypes = true,
              },
            },
          },
        },
      },
      rust_analyzer = {},
      biome = {},
      ts_ls = {},
      gopls = {
        settings = {
          gopls = {
            completeUnimported = true,
            analyses = {
              unusedparams = true,
            },
            buildFlags = { "-tags=unit,integration" },
          },
        },
      },
    },
  },
}
