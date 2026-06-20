//! Google Translate via the unofficial `translate_a/single` endpoint used in v1 BUtil.ahk.
//! Isolated here so the endpoint/parsing can be swapped if Google changes it.

use serde_json::Value;

const ENDPOINT: &str = "https://translate.googleapis.com/translate_a/single";

/// Translate `text` from `sl` (use "auto") to `tl`. Returns the joined sentence translation.
pub async fn translate(text: &str, sl: &str, tl: &str) -> anyhow::Result<String> {
    let url = format!(
        "{ENDPOINT}?client=gtx&dt=t&dt=bd&dj=1&source=input&sl={sl}&tl={tl}&q={}",
        urlencoding::encode(text)
    );

    let body = crate::http::CLIENT.get(&url).send().await?.text().await?;
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
