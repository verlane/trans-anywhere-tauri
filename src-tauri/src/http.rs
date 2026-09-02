//! Shared reqwest client so connections and TLS sessions are reused across
//! lookups instead of being rebuilt on every request.

use std::sync::LazyLock;
use std::time::Duration;

/// reqwest sends no User-Agent by default, which the scraped endpoints treat as
/// bot traffic. Identify as a browser like v1 did.
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
     (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

pub static CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(Duration::from_secs(10))
        .build()
        .expect("failed to build shared http client")
});
