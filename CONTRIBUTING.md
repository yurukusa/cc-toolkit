# Contributing to cc-toolkit

Thanks for your interest in contributing.

## Reporting Bugs

Open an Issue with steps to reproduce, expected behavior, and actual behavior.

## Suggesting New Tools

Open an Issue describing the tool, its use case, and example usage.

## Pull Requests

1. Fork the repository.
2. Create a feature branch from `main` (e.g. `feat/my-new-tool`).
3. Make your changes and commit.
4. Open a Pull Request against `main`.

## Code Conventions

- **ESM only** -- use `import`/`export`, not `require`.
- **Zero dependencies** -- only Node.js standard library modules are allowed.
- **Node 18+** -- you may use any API available in Node 18 and later.
- Each tool lives in its own directory under `packages/<tool-name>/`.
- The CLI entry point must be named `cli.mjs`.
- The tool's `package.json` must include a `bin` field pointing to `cli.mjs`.

## Example Structure

```
packages/my-tool/
  cli.mjs         # entry point (starts with #!/usr/bin/env node)
  package.json    # name, version, bin, etc.
```

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
