# Security Policy

## Supported versions

| Version | Supported | Network |
|---------|-----------|---------|
| 1.x     | ✅        | Casper Testnet (`casper-test`) |

See [SUPPORTED.md](SUPPORTED.md) for the full support matrix.

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, report them privately through one of:

- GitHub Security Advisories — use the **"Report a vulnerability"** button under
  the repository's **Security** tab (preferred).
- Email: **security@aifinpay.io**

Please include:

- A description of the vulnerability and its impact.
- Steps to reproduce (proof-of-concept where possible).
- Affected component(s): contract (`src/`), demo/SDK (`demo/`), or CI.

## Response targets

- **Acknowledgement:** within 72 hours.
- **Triage & severity assessment:** within 7 days.
- **Fix or mitigation plan:** communicated after triage, prioritized by severity.

We will keep you informed throughout and credit reporters who wish to be named
once a fix is released.

## Scope

In scope: the Casper smart contract, the demo/SDK/MCP code, and CI configuration
in this repository. Out of scope: third-party dependencies (report upstream) and
the public Casper testnet infrastructure.

## Automated security

This repository runs **CodeQL** static analysis, **Dependabot** dependency
alerts and updates, and **secret scanning with push protection**. All High or
greater severity alerts are triaged and resolved before release.
