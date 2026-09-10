# AiFinPay Casper Contract — Migration Plan: v3 → v4 (Splitter-Only)

**Status:** design spec
**Scope:** contract upgrade from v3 (current) to v4 (splitter-only, signed quotes, multi-route, RBAC)
**Pre-conditions:** EVM `B2BSplitterV14` architecture reviewed; backend signing service available
**Last updated:** 2026-09-10

---

## 1. Motivation

The current Casper contract (v3) is a **value-settlement-only** contract that works correctly for its original scope. However, comparing it against the EVM v1.4 architecture (`B2BSplitterV14.sol`) reveals security gaps that the v1.4 design was specifically built to close:

1. **No cryptographic quote integrity.** The caller supplies raw `route`, `merchant`, `gross_amount` parameters. A compromised SDK or frontend can manipulate any field after the backend publishes a quote. The EVM v1.4 closes this with EIP-712 signed quotes (`B2BSplitterV14.sol:199-226`).

2. **No signer/admin role separation.** A single `admin` key has full power — pause, unpause, set treasury, set admin, settle payments. EVM v1.4 orthogonalizes `ADMIN_ROLE`, `SIGN_OPERATOR_ROLE`, and `PAUSER_ROLE` (`B2BSplitterV14.sol:54-57, :341-350`).

3. **No per-payer monotonic nonce.** Uniqueness depends on the backend choosing unique `request_id` strings. The contract cannot enforce sequential ordering or detect replays across routes. EVM v1.4 uses `payerNonce[payer]` monotonic counter (`B2BSplitterV14.sol:79-80, :215-225`).

4. **No `gross_amount` verification.** The contract does not verify the payer actually sent the declared amount. EVM v1.4 checks `msg.value == grossAmount` (`B2BSplitterV14.sol:134`).

5. **Routes hardcoded.** Adding or disabling routes requires a full contract redeploy. EVM v1.4 supports runtime `configureRoute` / `disableRoute` / `enableRoute` (`Profiles.sol:75-108`).

6. **No IP Creator leg.** Only 2-way split (merchant + treasury). No royalty support. EVM v1.4 supports a configurable third leg (`B2BSplitterV14.sol:256-278`).

7. **No timelock governance.** Admin actions are instant. No delay between proposal and execution. EVM v1.4 uses a 48-hour `TimelockController`.

**v4 design principles** (mirroring EVM v1.4):

1. Splitter-only — no business logic on-chain.
2. Cryptographically signed quotes — backend signs, contract verifies.
3. One deployment, many routes — per-route profile storage.
4. Orthogonal RBAC — signer ≠ admin ≠ pauser.

---

## 2. Comparison: v3 (current) vs v4 (target) vs EVM v1.4

### 2.1 Feature matrix

| Feature | EVM v1.4 | Casper v3 (current) | Casper v4 (target) |
|---------|----------|---------------------|---------------------|
| **Quote signing** | EIP-712 by `SIGN_OPERATOR_ROLE` | None — raw params trusted | Ed25519/secp256k1 signed quote |
| **Role separation** | ADMIN / SIGN_OPERATOR / PAUSER | Single admin | ADMIN / SIGN_OPERATOR / PAUSER |
| **Nonce model** | Per-payer monotonic `payerNonce` | String `request_id` in dictionary | Per-payer monotonic nonce |
| **Replay protection** | Nonce + signature + routeId | `request_id` dictionary lookup | Nonce + signature + routeId |
| **Cross-chain replay** | Domain separator with `chainId` | Not prevented | Domain separator with `stateHash` |
| **Route config** | `configureRoute` / `disableRoute` / `enableRoute` | Hardcoded routes 1/2 | Per-route profile dictionary |
| **Split legs** | 3-way (merchant + treasury + IP creator) | 2-way (merchant + treasury) | 3-way (configurable) |
| **Fee caps** | `MAX_TREASURY_BPS=500`, `MAX_IP_CREATOR_BPS=100` | Hardcoded 1% | BPS-based with caps |
| **Per-route treasury** | `routeTreasury` override | Global only | Per-route treasury override |
| **Token whitelist** | `TokenList` satellite | Native CSPR only | Native CSPR only (no change) |
| **Pause** | ADMIN or PAUSER can pause; ADMIN-only unpause | Admin pauses/unpauses | ADMIN or PAUSER pause; ADMIN-only unpause |
| **Timelock** | 48h `TimelockController` | None | Optional (configurable) |
| **Expiry max-ahead** | Signer-chosen, no on-chain cap | 20 min enforced | 20 min enforced (retain) |
| **Payment storage** | Event-only | Full JSON in dictionary | Event-only (lighter) |
| **`gross_amount` check** | `msg.value == grossAmount` | Not checked | Transfer amount == gross_amount |
| **Self-payment guard** | Not explicit (signed payer binding) | Explicit `payer == merchant` | Explicit (retain) |

### 2.2 Error code mapping

| EVM v1.4 Error | Casper v3 Code | Casper v4 Code | Notes |
|----------------|----------------|----------------|-------|
| `ZeroAmount` | `ERR_INVALID_AMOUNT (106)` | `ERR_INVALID_AMOUNT (106)` | Retain |
| `ZeroMerchant` | `ERR_INVALID_WALLET (104)` | `ERR_INVALID_WALLET (104)` | Retain |
| `PaymentAlreadyProcessed` | `ERR_ALREADY_SETTLED (102)` | `ERR_ALREADY_SETTLED (102)` | Retain |
| `ZeroTreasury` | — | `ERR_ZERO_TREASURY (115)` | **Add** |
| `SignatureExpired` | `ERR_EXPIRED (112)` | `ERR_EXPIRED (112)` | Retain |
| `InvalidSigner` | — | `ERR_INVALID_SIGNER (116)` | **Add** |
| `InvalidSignature` | — | `ERR_INVALID_SIGNATURE (117)` | **Add** |
| `InvalidPayer` | — | `ERR_INVALID_PAYER (118)` | **Add** |
| `InvalidNonce` | — | `ERR_INVALID_NONCE (119)` | **Add** |
| `NonceAlreadyConsumed` | `ERR_ALREADY_SETTLED (102)` | `ERR_NONCE_CONSUMED (120)` | **Add** (distinct from replay) |
| `RouteDisabled` | `ERR_INVALID_ROUTE (110)` | `ERR_ROUTE_DISABLED (121)` | **Add** |
| `UnknownRoute` | `ERR_INVALID_ROUTE (110)` | `ERR_UNKNOWN_ROUTE (122)` | **Add** |
| `MerchantTransferFailed` | `ERR_TRANSFER_FAILED (108)` | `ERR_TRANSFER_FAILED (108)` | Retain |
| `IncorrectNativeValue` | — | `ERR_INCORRECT_AMOUNT (123)` | **Add** |
| `AdminEqualsSigner` | — | `ERR_ADMIN_EQUALS_SIGNER (124)` | **Add** |
| `MissingIPCreator` | — | `ERR_MISSING_IP_CREATOR (125)` | **Add** |
| `TreasuryFeeTooHigh` | — | `ERR_FEE_TOO_HIGH (126)` | **Add** |
| `IPCreatorFeeTooHigh` | — | `ERR_CREATOR_FEE_TOO_HIGH (127)` | **Add** |
| `ExpiryTooFar` | `ERR_EXPIRY_TOO_FAR (113)` | `ERR_EXPIRY_TOO_FAR (113)` | Retain |
| `Paused` | `ERR_PAUSED (111)` | `ERR_PAUSED (111)` | Retain |
| `Unauthorized` | `ERR_UNAUTHORIZED (103)` | `ERR_UNAUTHORIZED (103)` | Retain |
| `Overflow` | `ERR_OVERFLOW (109)` | `ERR_OVERFLOW (109)` | Retain |
| `FeeRoundsToZero` | `ERR_FEE_ROUNDS_TO_ZERO (114)` | `ERR_FEE_ROUNDS_TO_ZERO (114)` | Retain |

### 2.3 Entry point comparison

| EVM v1.4 Function | Casper v3 Entry Point | Casper v4 Entry Point | Change |
|--------------------|----------------------|----------------------|--------|
| `settleNative(Quote, sig)` | `pay()` | `settle_native(Quote, sig)` | **Rename + add signature** |
| `settleStable(Quote, sig)` | — | — | N/A (Casper: native only) |
| `pause()` | `set_paused(true)` | `pause()` | **Split into pause/unpause** |
| `unpause()` | `set_paused(false)` | `unpause()` | **Split into pause/unpause** |
| `setTreasury(addr)` | `set_treasury(addr)` | `set_treasury(addr)` | Retain |
| `setAdmin(addr)` | `set_admin(addr)` | `set_admin(addr)` | Retain |
| `grantSignerRole(addr)` | — | `grant_signer_role(addr)` | **Add** |
| `revokeSignerRole(addr)` | — | `revoke_signer_role(addr)` | **Add** |
| `grantPauserRole(addr)` | — | `grant_pauser_role(addr)` | **Add** |
| `revokePauserRole(addr)` | — | `revoke_pauser_role(addr)` | **Add** |
| `getPaymentCount()` | `get_payment_count()` | `get_payment_count()` | Retain |
| `payerNonce(addr)` | — | `get_payer_nonce(addr)` | **Add** |
| `quoteHash(quote)` | — | `quote_hash(quote)` | **Add** (off-chain helper) |
| `digest(quote)` | — | `digest(quote)` | **Add** (off-chain helper) |
| `configureRoute(...)` | — | `configure_route(...)` | **Add** |
| `disableRoute(id)` | — | `disable_route(id)` | **Add** |
| `enableRoute(id)` | — | `enable_route(id)` | **Add** |
| `getProfile(id)` | — | `get_profile(id)` | **Add** |
| `routeIds()` | — | `get_route_ids()` | **Add** |

---

## 3. Scope Changes

### 3.1 Removed from v3

| Item | Reason | Replacement |
|------|--------|-------------|
| `KEY_EVENTS` dictionary | On-chain event storage replaced by indexed events | Casper native `emit` / event system |
| `KEY_EVENT_COUNT` URef | No longer needed without dictionary events | Removed |
| `KEY_PAYMENT_COUNT` URef | Payment count derived from nonce state | Optional view function |
| `EP_GET_PAYMENT_COUNT` entry point | Replaced by `get_payer_nonce` / `get_payment_count` | Updated entry point |
| Hardcoded route 1/2 in `lib.rs` | Routes become admin-configurable | `Profiles` dictionary |

### 3.2 Added in v4

| Item | Purpose | EVM Equivalent |
|------|---------|----------------|
| `KEY_SIGNER` storage | Backend signer public key | `SIGN_OPERATOR_ROLE` |
| `KEY_PAUSER` storage | Pauser account hash | `PAUSER_ROLE` |
| `KEY_NONCES` dictionary | Per-payer monotonic nonce | `payerNonce` mapping |
| `KEY_CONSUMED_NONCES` dictionary | Nonce consumption tracking | `consumedNonce` mapping |
| `KEY_ROUTES` dictionary | Per-route profile storage | `Profiles` contract |
| `KEY_ROUTE_IDS` URef | Enumerable route ID list | `_routeIds` array |
| `QUOTE_DOMAIN_SEPARATOR` | Cross-chain replay prevention | `DOMAIN_SEPARATOR` |
| `settle_native(Quote, sig)` entry point | Signed settlement | `settleNative` |
| `grant_signer_role` entry point | Signer rotation | `grantSignerRole` |
| `revoke_signer_role` entry point | Signer revocation | `revokeSignerRole` |
| `grant_pauser_role` entry point | Pauser management | `grantPauserRole` |
| `revoke_pauser_role` entry point | Pauser revocation | `revokePauserRole` |
| `pause()` / `unpause()` entry points | Split pause control | `pause()` / `unpause()` |
| `configure_route(...)` entry point | Route economics config | `Profiles.configureRoute` |
| `disable_route(id)` / `enable_route(id)` | Route toggling | `Profiles.disableRoute` / `enableRoute` |
| `get_profile(id)` entry point | Read route profile | `Profiles.getProfile` |
| `get_route_ids()` entry point | List configured routes | `Profiles.routeIds` |
| `get_payer_nonce(addr)` entry point | Read payer nonce | `payerNonce(addr)` |
| `quote_hash(quote)` entry point | Off-chain digest computation | `quoteHash` |
| `digest(quote)` entry point | Full EIP-712 digest | `digest` |

### 3.3 Retained from v3

| Item | Notes |
|------|-------|
| `split_gross` logic in `lib.rs` | Extended to 3-way; BPS-based |
| `validate_expiry` with 20-min cap | Retain on-chain max-ahead enforcement |
| `require_identifier` validation | Retain for `request_id` / `order_id` |
| `parse_account` | Retain |
| `self-payment guard` | Retain |
| `ERR_*` codes (stable) | Retained; new codes added |

---

## 4. Architecture: v4 Contract

### 4.1 Component diagram

```
                         ┌──────────────────────────────────────────────────────┐
                         │              AiFinPay Casper v4                      │
                         │       (splitter-only multi-route payment router)      │
                         │                                                      │
   Backend signer ──────┐ │   RBAC {                                           │
   (SIGN_OPERATOR_KEY)  │ │       ADMIN        : governance account             │
   off-chain, Ed25519   │ │       SIGN_OPERATOR: backend hot key (KMS)          │
   or secp256k1         │ │       PAUSER       : emergency pause key            │
   ─────────────────────┘│                                                      │
                         │   Signed quote verification                          │
                         │   Pausable                                           │
                         │                                                      │
                         │   settle_native(Quote, signature)                    │
                         │       ✓ signature verification                       │
                         │       ✓ deadline (valid_until_ms)                    │
                         │       ✓ payerNonce monotonic                         │
                         │       ✓ gross_amount == transfer amount              │
                         │       ✓ profile(route) economics                     │
                         │       ✓ self-payment guard                           │
                         │       ✓ mark nonce consumed                          │
                         └───────┬───────────────────────────┬─────────────────┘
                                 │                           │
                  route economics│              per-payer nonces
                     (read-only) │              (read-write)
                                 ▼                           ▼
                         ┌──────────────┐          ┌──────────────────┐
                         │   Routes     │          │   Nonces         │
                         │  dictionary  │          │  dictionary      │
                         └──────────────┘          └──────────────────┘
                                 │
                     2-3 atomic transfers
                                 ▼
                         ┌──────────────────────────────────────────────────────┐
                         │  Merchant wallet  │  Treasury / route treasury     │
                         └──────────────────────────────────────────────────────┘
```

### 4.2 Roles (Casper-native)

| Role | Storage Key | Holder | Powers |
|------|-------------|--------|--------|
| `ADMIN` | `KEY_ADMIN` (account hash) | Governance multisig / deployer | Grant/revoke roles, unpause, set treasury, configure routes |
| `SIGN_OPERATOR` | `KEY_SIGNER` (account hash) | Backend hot key (KMS) | Sign quotes only — no admin, no pause |
| `PAUSER` | `KEY_PAUSER` (account hash) | Emergency response key | Pause only — cannot unpause, cannot admin |

**Separation guarantee:** Constructor enforces `admin != signer` and `admin != pauser` and `signer != pauser`. The `grant_signer_role` and `grant_pauser_role` entry points enforce no role overlap.

### 4.3 Storage layout

```
Casper v4 Contract
  URef              KEY_ADMIN          (account hash string)
  URef              KEY_SIGNER         (account hash string)
  URef              KEY_PAUSER         (account hash string)
  URef              KEY_TREASURY       (account hash string)
  bool              KEY_PAUSED
  URef              KEY_NONCES         (dictionary: account_hash → u64)
  URef              KEY_CONSUMED       (dictionary: "hash(account,nonce)" → bool)
  Dictionary        KEY_ROUTES         (dictionary: route_id → RouteProfile JSON)
  URef              KEY_ROUTE_IDS      (json array of configured route IDs)
  URef              KEY_QUOTE_DOMAIN   (domain separator for quote verification)
  URef              KEY_PAYMENT_COUNT  (total settlement counter)
```

### 4.4 Quote struct (Casper-native)

```rust
struct Quote {
    payer: String,           // "account-hash-..." — must match caller
    merchant: String,        // "account-hash-..." — non-zero
    gross_amount: U512,      // total amount in motes
    route: u8,               // route profile selector
    request_id: String,      // unique payment identifier
    valid_until_ms: u64,     // block-time expiry, max 20 min ahead
    nonce: u64,              // must equal payerNonce[caller]
}
```

Signature is computed over `keccak256(domain_separator ++ quote_fields)` and verified against `KEY_SIGNER`.

---

## 5. Migration Phases

### Phase 0 — Design spec (current)

**Status:** This document.

**Goal:** Align on the v4 design before any code lands.

**Done when:** Design reviewed by backend engineer and Casper contract engineer.

### Phase 1 — Implement v4 contract alongside v3

**Goal:** Add v4 entry points and storage alongside existing v3 code. Both versions coexist temporarily.

**Commits:**
- `feat: add v4 storage keys and RBAC helpers (require_signer, require_pauser, require_admin_or_pauser)`
- `feat: add v4 route profile storage (configure_route, disable_route, enable_route, get_profile)`
- `feat: add v4 nonce storage (get_payer_nonce, mark_nonce_consumed)`
- `feat: add v4 quote verification (verify_quote, quote_hash, digest)`
- `feat: add v4 settle_native entry point with signed quote`
- `feat: add v4 role management entry points (grant_signer_role, revoke_signer_role, etc.)`
- `feat: add v4 pause/unpause entry points (split from set_paused)`
- `test: add v4 unit tests (quote verification, replay, RBAC, routes, settle)`
- `feat: extend lib.rs split_gross to 3-way BPS-based with fee caps`

**Done when:**
- `cargo test` passes with both v3 and v4 tests green.
- v4 `settle_native` rejects unsigned quotes.
- v4 `settle_native` rejects expired quotes.
- v4 `settle_native` rejects replayed nonces.
- v4 `settle_native` rejects self-payment.
- v4 `settle_native` splits correctly for route 1 (99/1/0) and route 2 (100/0/0).
- v4 `grant_signer_role` rejects if signer == admin.
- v4 `configure_route` rejects if `treasury_bps > 500`.
- v4 `pause` callable by PAUSER or ADMIN; `unpause` callable by ADMIN only.

### Phase 2 — Backend signing integration

**Goal:** Backend produces signed quotes; SDK submits them to v4 contract.

**Commits:**
- `feat: backend signing service produces Ed25519/secp256k1 signed quotes`
- `feat: SDK receives signed quotes and submits to settle_native`
- `test: E2E test — backend signs, SDK submits, contract settles`

**Done when:**
- Backend can produce a valid signature for a quote.
- Contract recovers the signer and verifies it matches `KEY_SIGNER`.
- Full E2E flow works on `casper-test`.

### Phase 3 — Remove v3 entry points

**Goal:** Clean removal of legacy v3 surface. This is the destructive phase.

**Commits:**
- `chore: remove v3 pay() entry point`
- `chore: remove v3 set_paused() entry point (replaced by pause/unpause)`
- `chore: remove KEY_EVENTS dictionary and event_count URef`
- `chore: remove hardcoded route 1/2 from lib.rs (replaced by Profiles)`
- `test: remove v3-only tests`
- `docs: update ARCHITECTURE.md for v4`

**Done when:**
- `cargo test` passes.
- `cargo clippy` passes.
- No references to v3 `pay()` entry point remain in contract code.
- v3 tests are removed.

### Phase 4 — Testnet deployment and verification

**Goal:** Deploy v4 to `casper-test` with full RBAC bootstrap.

**Commits:**
- `chore: deploy v4 to casper-test`
- `chore: verify contract hash and named keys`
- `docs: update deployment records`

**Done when:**
- Contract is deployed and verified on `casper-test`.
- Admin, signer, and pauser are separate accounts.
- Both routes are configured at deployment.
- Settlement starts paused; unpaused after E2E verification.

### Phase 5 — Production deployment

**Goal:** Deploy v4 to Casper mainnet with multisig governance.

**Commits:**
- `chore: deploy v4 to casper-mainnet`
- `chore: transfer admin to multisig`
- `chore: grant SIGN_OPERATOR to production KMS key`
- `docs: update canonical contract hash and named keys`

**Done when:**
- Contract is deployed and verified on Casper mainnet.
- Admin is a multisig.
- Signer is a KMS-backed key.
- Treasury is the production multisig.
- E2E flow works with production backend.

---

## 6. Detailed Comparison: Entry Point Behavior

### 6.1 Settlement

**EVM v1.4 (`settleNative`):**
```solidity
function settleNative(Quote calldata _quote, bytes calldata _signature)
    external payable nonReentrant whenNotPaused
{
    IProfiles.RouteProfile memory profile = _verifyQuote(_quote, _signature);
    if (_quote.token != address(0)) revert InvalidTokenForNative();
    if (msg.value != _quote.grossAmount) revert IncorrectNativeValue(_quote.grossAmount, msg.value);
    (uint256 merchantAmt, uint256 treasuryAmt, uint256 ipAmt) = _splitGross(_quote.grossAmount, profile, _quote.ipCreator);
    // ... transfers ...
}
```

**Casper v3 (`pay`):**
```rust
pub extern "C" fn pay() {
    if read_bool(KEY_PAUSED) { runtime::revert(ERR_PAUSED); }
    let route: u8 = runtime::get_named_arg(ARG_ROUTE);
    let merchant_raw: String = runtime::get_named_arg(ARG_MERCHANT);
    let gross: U512 = runtime::get_named_arg(ARG_GROSS_AMOUNT);
    let request_id: String = runtime::get_named_arg(ARG_REQUEST_ID);
    let valid_until_ms: u64 = runtime::get_named_arg(ARG_VALID_UNTIL_MS);
    // ... no signature check ...
    // ... split and transfer ...
}
```

**Casper v4 (`settle_native`):**
```rust
pub extern "C" fn settle_native() {
    if read_bool(KEY_PAUSED) { runtime::revert(ERR_PAUSED); }

    // 1. Read signed quote from args
    let quote = Quote::from_args();
    let signature: Vec<u8> = runtime::get_named_arg(ARG_SIGNATURE);

    // 2. Verify signature against KEY_SIGNER
    verify_quote(&quote, &signature);

    // 3. Validate fields
    let caller = runtime::get_caller();
    if quote.payer != caller.to_formatted_string() { runtime::revert(ERR_INVALID_PAYER); }
    if quote.gross_amount.is_zero() { runtime::revert(ERR_INVALID_AMOUNT); }
    validate_expiry(quote.valid_until_ms);

    // 4. Resolve route profile
    let profile = get_profile(quote.route);

    // 5. Check nonce
    let payer_hash = caller;
    let current_nonce = get_payer_nonce(&payer_hash);
    if quote.nonce != current_nonce { runtime::revert(ERR_INVALID_NONCE); }

    // 6. Mark nonce consumed (CEI — before transfers)
    mark_nonce_consumed(&payer_hash, current_nonce);

    // 7. Split and transfer
    let (merchant_amount, treasury_amount, creator_amount) = split_gross_bps(
        quote.gross_amount, &profile
    );

    let merchant = parse_account(&quote.merchant);
    let treasury = resolve_treasury(&profile);

    system::transfer_to_account(merchant, merchant_amount, None)
        .unwrap_or_revert_with(ERR_TRANSFER_FAILED);
    if !treasury_amount.is_zero() {
        system::transfer_to_account(treasury, treasury_amount, None)
            .unwrap_or_revert_with(ERR_TRANSFER_FAILED);
    }
    if !creator_amount.is_zero() {
        let creator = parse_account(&quote.ip_creator);
        system::transfer_to_account(creator, creator_amount, None)
            .unwrap_or_revert_with(ERR_TRANSFER_FAILED);
    }

    // 8. Emit event
    emit_payment_settled(&quote, merchant_amount, treasury_amount, creator_amount);
}
```

### 6.2 RBAC

**EVM v1.4:**
```solidity
function grantRole(bytes32 _role, address _account) public override {
    if (_role == SIGN_OPERATOR_ROLE) {
        if (hasRole(ADMIN_ROLE, _account) || hasRole(PAUSER_ROLE, _account)) revert AdminEqualsSigner();
    } else if (_role == ADMIN_ROLE) {
        if (hasRole(SIGN_OPERATOR_ROLE, _account) || hasRole(PAUSER_ROLE, _account)) revert AdminEqualsSigner();
    } else if (_role == PAUSER_ROLE) {
        if (hasRole(SIGN_OPERATOR_ROLE, _account)) revert PauserEqualsSigner();
    }
    super.grantRole(_role, _account);
}
```

**Casper v4:**
```rust
fn require_role_separation(admin: &str, signer: &str, pauser: &str, target: &str, role: &str) {
    match role {
        "signer" => {
            if target == admin || target == pauser {
                runtime::revert(ERR_ADMIN_EQUALS_SIGNER);
            }
        }
        "admin" => {
            if target == signer || target == pauser {
                runtime::revert(ERR_ADMIN_EQUALS_SIGNER);
            }
        }
        "pauser" => {
            if target == signer {
                runtime::revert(ERR_ADMIN_EQUALS_SIGNER);
            }
        }
        _ => {}
    }
}
```

---

## 7. Backend Migration

### 7.1 Backend signing service

The backend must:

1. **Hold a signing keypair** (Ed25519 or secp256k1) in a KMS/HSM.
2. **Register the public key** with the contract via `grant_signer_role(pubkey)`.
3. **For each quote:**
   - Authenticate the payer (JWT / signed auth header).
   - Verify business policy (KYC, AML, daily limits) — all in backend DB.
   - Read the route profile from the contract (or cache) to confirm economics.
   - Assign `nonce = payerNonce(payer)` by reading from the contract via RPC.
   - Set `valid_until_ms = now + quote_ttl(route)` (recommended: 15 min for agent-x402, 1 hour for merchant-aifp1).
   - Compute `request_id` (unique, unpredictable).
   - Sign the quote fields with the hot key.
   - Return `{quote, signature}` to the SDK.

### 7.2 Backend must not

- Sign a quote whose `payer` the backend did not authenticate.
- Sign a quote whose `gross_amount` differs from the price the SDK quoted.
- Sign a quote whose `route` is not configured or is disabled.
- Sign with a key whose `SIGN_OPERATOR` role has been revoked.
- Sign a quote with `valid_until_ms = 0` or `valid_until_ms < now`.

### 7.3 Nonce management

The backend must maintain a `payer_nonce` table synced with `payerNonce(payer)` on-chain. When a settlement succeeds, the backend increments the local nonce. If a settlement reverts with `ERR_INVALID_NONCE`, the backend re-fetches the on-chain nonce and retries.

---

## 8. SDK Migration

| Old SDK surface | New SDK surface |
|-----------------|-----------------|
| `client.pay(route, merchant, amount, request_id, valid_until_ms)` | `client.settle_native(quote, signature)` |
| Client constructs quote locally | Client receives pre-signed quote from backend |
| No signature required | Signature is mandatory |

The SDK version is bumped from `3.x` to `4.0`. Breaking change documented in `CHANGELOG.md`.

---

## 9. Risk Register

| Risk | Mitigation |
|------|------------|
| Breaking existing v3 integrations | v4 is a new contract hash; v3 can coexist during transition |
| Backend signing key compromised | `revoke_signer_role(old)` + `grant_signer_role(new)` via admin; `pause()` during rotation |
| Admin key lost | Contract becomes ungovernable but settlements continue (if signer is separate) |
| Nonce out of sync | Backend re-fetches `payerNonce` from contract; quote is re-issued |
| Profile change mid-flight | Settlement uses current profile at settlement time (same as EVM v1.4 §5.4) |
| Casper-specific: `system::transfer_to_account` failure | Atomic revert; nonce not consumed; payer can retry |
| Casper-specific: no reentrancy guard needed | `system::transfer_to_account` is atomic on Casper; no callback path |

---

## 10. What v4 Does Not Solve

1. **Fee-on-transfer tokens.** Not applicable — Casper native CSPR has no transfer fee.
2. **Storage growth.** `KEY_NONCES` and `KEY_CONSUMED` grow linearly with unique payers. Out of scope for v4.
3. **Profile-bound digest.** Quote settles with current profile, not profile at signing time. Future v4.x: bind profile to digest.
4. **Storage pruning.** `KEY_CONSUMED` is monotonic. Future v4.x: TTL-based purge.
5. **Cross-chain settlement.** Casper v4 is Casper-only. Cross-chain routing is a separate concern.

---

## 11. Error Code Registry (v4)

```rust
// Retained from v3
const ERR_MISSING_KEY: u16 = 1;
const ERR_ALREADY_SETTLED: u16 = 102;
const ERR_UNAUTHORIZED: u16 = 103;
const ERR_INVALID_WALLET: u16 = 104;
const ERR_INVALID_IDENTIFIER: u16 = 105;
const ERR_INVALID_AMOUNT: u16 = 106;
const ERR_SELF_PAYMENT: u16 = 107;
const ERR_TRANSFER_FAILED: u16 = 108;
const ERR_OVERFLOW: u16 = 109;
const ERR_INVALID_ROUTE: u16 = 110;
const ERR_PAUSED: u16 = 111;
const ERR_EXPIRED: u16 = 112;
const ERR_EXPIRY_TOO_FAR: u16 = 113;
const ERR_FEE_ROUNDS_TO_ZERO: u16 = 114;

// Added in v4
const ERR_ZERO_TREASURY: u16 = 115;
const ERR_INVALID_SIGNER: u16 = 116;
const ERR_INVALID_SIGNATURE: u16 = 117;
const ERR_INVALID_PAYER: u16 = 118;
const ERR_INVALID_NONCE: u16 = 119;
const ERR_NONCE_CONSUMED: u16 = 120;
const ERR_ROUTE_DISABLED: u16 = 121;
const ERR_UNKNOWN_ROUTE: u16 = 122;
const ERR_INCORRECT_AMOUNT: u16 = 123;
const ERR_ADMIN_EQUALS_SIGNER: u16 = 124;
const ERR_MISSING_IP_CREATOR: u16 = 125;
const ERR_FEE_TOO_HIGH: u16 = 126;
const ERR_CREATOR_FEE_TOO_HIGH: u16 = 127;
```

---

## 12. Timeline (Indicative)

| Phase | Duration | Notes |
|-------|----------|-------|
| Phase 0 (design spec) | 1 week | Current document |
| Phase 1 (v4 contract code) | 2-3 weeks | Includes 3-way split, RBAC, route profiles, nonce storage |
| Phase 2 (backend signing) | 1-2 weeks | Backend + SDK integration |
| Phase 3 (remove v3) | 0.5 weeks | Destructive cleanup |
| Phase 4 (testnet) | 0.5 weeks | Deploy + E2E verification |
| Phase 5 (production) | 0.5 weeks | Mainnet deploy + multisig bootstrap |

Total: 5-7 weeks.

---

— End of migration plan —
