# Contributing to AiFinPay × Casper

Thanks for your interest in contributing! This repository is the Casper
settlement layer for the AiFinPay AI-agent payment protocol. Contributions of
all kinds are welcome — code, docs, examples, and issue reports.

## Ways to contribute

- **Report a bug** — open an issue with the Bug Report template.
- **Request a feature** — open an issue with the Feature Request template.
- **Report a vulnerability** — see [SECURITY.md](SECURITY.md). Do **not** open a
  public issue for security problems.
- **Improve docs or examples** — PRs welcome.
- **Contribute code** — see the workflow below.

## Development setup

```bash
# Rust toolchain (contract)
rustup target add wasm32-unknown-unknown
cargo build --release

# Node toolchain (demo / SDK / MCP)
cd demo && npm install
```

See the [README](README.md) Quick Start and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
for full setup, including funding a Casper testnet key.

## Pull request workflow

1. Fork the repo and create a feature branch: `git checkout -b feat/my-change`.
2. Make your change with clear, focused commits.
3. Run the checks locally before pushing:
   - `cargo fmt --all -- --check`
   - `cargo clippy --all-targets -- -D warnings`
   - `cargo build --release`
   - `cd demo && npm run lint` (if applicable)
4. Open a Pull Request against `main` and fill in the PR template.
5. CI (build, lint, CodeQL) must pass and at least one maintainer must approve.

## Commit style

We use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`,
`fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `ci:`.

## Code style

- **Rust:** `rustfmt` + `clippy` (no warnings).
- **JavaScript:** Prettier + ESLint (configs in the repo root).

## Code of Conduct

By participating, you agree to abide by our
[Code of Conduct](CODE_OF_CONDUCT.md).
