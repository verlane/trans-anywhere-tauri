//! Shared reqwest client so connections and TLS sessions are reused across
//! lookups instead of being rebuilt on every request.

use std::sync::LazyLock;
use std::time::Duration;

pub static CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .expect("failed to build shared http client")
});
