// ── Storage keys ─────────────────────────────────────────────────────────────
pub const KEY_PAYMENTS: &str = "payments";
pub const KEY_EVENTS: &str = "events";
pub const KEY_PAYMENT_COUNT: &str = "payment_count";
pub const KEY_EVENT_COUNT: &str = "event_count";
pub const KEY_ADMIN: &str = "admin";
pub const KEY_TREASURY: &str = "treasury";
pub const KEY_PAUSED: &str = "paused";
pub const KEY_CONTRACT_HASH: &str = "aifinpay_casper_v3_hash";
pub const KEY_CONTRACT_VERSION: &str = "aifinpay_casper_v3_version";

// ── Entry points ──────────────────────────────────────────────────────────────
pub const EP_PAY: &str = "pay";
pub const EP_SET_PAUSED: &str = "set_paused";
pub const EP_SET_TREASURY: &str = "set_treasury";
pub const EP_SET_ADMIN: &str = "set_admin";
pub const EP_GET_PAYMENT_COUNT: &str = "get_payment_count";

// ── Arguments ────────────────────────────────────────────────────────────────
pub const ARG_ROUTE: &str = "route";
pub const ARG_MERCHANT: &str = "merchant";
pub const ARG_GROSS_AMOUNT: &str = "gross_amount";
pub const ARG_REQUEST_ID: &str = "request_id";
pub const ARG_VALID_UNTIL_MS: &str = "valid_until_ms";
pub const ARG_PAUSED: &str = "paused";
pub const ARG_TREASURY: &str = "treasury";
pub const ARG_ADMIN: &str = "admin";

pub const EXPIRY_MAX_AHEAD_MS: u64 = 20 * 60 * 1000;
