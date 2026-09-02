//! Google Translate via the unofficial `translate_a/single` endpoint used in v1 BUtil.ahk.
//! Isolated here so the endpoint/parsing can be swapped if Google changes it.

use serde_json::Value;

const ENDPOINT: &str = "https://translate.googleapis.com/translate_a/single";

/// v1 used `client=gtx`, which Google now answers with 429 ("Sorry...") after a
/// handful of requests from the same IP. `dict-chrome-ex` returns the identical
/// `dj=1` JSON shape and is not rate-limited the same way.
const CLIENT: &str = "dict-chrome-ex";

/// Translate `text` from `sl` (use "auto") to `tl`. Returns the joined sentence translation.
pub async fn translate(text: &str, sl: &str, tl: &str) -> anyhow::Result<String> {
    let url = format!(
        "{ENDPOINT}?client={CLIENT}&dt=t&dt=bd&dj=1&source=input&sl={sl}&tl={tl}&q={}",
        urlencoding::encode(text)
    );

    let body = crate::http::CLIENT
        .get(&url)
        .send()
        .await?
        .error_for_status()?
        .text()
        .await?;
    let json: Value = serde_json::from_str(&body)?;

    let translation = json
        .get("sentences")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|s| s.get("trans").and_then(Value::as_str))
                .collect::<String>()
        })
        .unwrap_or_default();

    Ok(translation)
}
