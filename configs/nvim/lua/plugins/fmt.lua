return {
  "stevearc/conform.nvim",
  opts = function()
    local function choose_js_ts_formatter(bufnr)
      local filePath = vim.api.nvim_buf_get_name(bufnr)
      local prettierConfig = vim.fs.find({
        ".prettierrc",
        ".prettierrc.json",
        ".prettierrc.json5",
        ".prettierrc.yaml",
        ".prettierrc.yml",
        ".prettierrc.js",
        ".prettierrc.cjs",
        "prettier.config.js",
        "prettier.config.cjs",
        "prettier.config.mjs",
      }, { path = filePath, upward = true })

      if prettierConfig and #prettierConfig > 0 then
        return { "prettierd" }
      end

      if vim.fs.root(bufnr, { "biome.json", "biome.jsonc" }) then
        return { "biome" }
      end

      return { "prettierd" }
    end

    ---@type conform.setupOpts
    local opts = {
      default_format_opts = {
        timeout_ms = 3000,
        async = false, -- not recommended to change
        quiet = false, -- not recommended to change
        lsp_format = "fallback", -- not recommended to change
      },
      formatters_by_ft = {
        lua = { "stylua" },
        json = choose_js_ts_formatter,
        jsonc = choose_js_ts_formatter,
        json5 = choose_js_ts_formatter,
        javascript = choose_js_ts_formatter,
        javascriptreact = choose_js_ts_formatter,
        typescript = choose_js_ts_formatter,
        typescriptreact = choose_js_ts_formatter,
        svelte = { "prettierd" },
        html = { "prettierd" },
        python = { "ruff-lsp" },
        go = { "golines" },
      },
    }
    return opts
  end,
}
