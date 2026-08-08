# AiFinPay × Casper — developer tasks
.DEFAULT_GOAL := help
.PHONY: help setup build fmt lint clippy test demo agent-demo mcp dashboard deploy keygen clean

WASM_TARGET := wasm32-unknown-unknown

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

setup: ## Install toolchains (Rust wasm target + Node deps)
	rustup toolchain install nightly-2025-02-04 --profile minimal
	rustup target add $(WASM_TARGET) --toolchain nightly-2025-02-04
	cd demo && npm install

build: ## Build contract and payer-session Wasm (release)
	cargo +nightly-2025-02-04 build --workspace --release --locked --target $(WASM_TARGET)

fmt: ## Format Rust code
	cargo fmt --all

lint: clippy ## Alias for clippy

clippy: ## Run clippy with warnings as errors
	cargo clippy --all-targets -- -D warnings

test: ## Run contract tests
	cargo test

keygen: ## Generate a Casper testnet keypair
	cd demo && node keygen.js

deploy: ## Deploy the contract to Casper testnet
	cd demo && node deploy.js

demo: ## Run the basic register + settle demo
	cd demo && node demo.js

agent-demo: ## Run the AI-agent-buys-compute demo (x402 -> Casper)
	cd demo && node agent-compute-demo.js

mcp: ## Start the Casper MCP server
	cd demo && node casper-mcp.mjs

dashboard: ## Serve the live dashboard
	cd demo && node serve-dashboard.js

clean: ## Remove build artifacts
	cargo clean
