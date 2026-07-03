//! Pure decision logic for the long-press copy-selection flow.
//!
//! Extracted from the global-shortcut handler in `lib.rs` so the
//! clipboard-polling behavior is unit-testable without a real clipboard
//! or keyboard. Port note: v1 (`Class_HotKey.ahk`) relied on AutoHotkey's
//! `ClipWait`, which polls instead of sleeping a fixed interval — this
//! module restores that behavior.

use std::time::{Duration, Instant};

/// Result of waiting for the simulated Ctrl+C to land in the clipboard.
#[derive(Debug, PartialEq, Eq)]
pub enum CopyWait {
    /// The foreground app copied this non-empty selection.
    Copied(String),
    /// The clipboard still held the sentinel (or nothing usable) at timeout.
    NothingSelected,
}

/// Poll `read` every `interval` until it yields text that is neither the
/// sentinel nor blank, or until `timeout` elapses. Read failures (`None`,
/// e.g. the clipboard is transiently locked by another process) are retried.
pub fn wait_for_copy(
    mut read: impl FnMut() -> Option<String>,
    sentinel: &str,
    timeout: Duration,
    interval: Duration,
) -> CopyWait {
    let deadline = Instant::now() + timeout;
    loop {
        if let Some(text) = read() {
            if text != sentinel && !text.trim().is_empty() {
                return CopyWait::Copied(text);
            }
        }
        if Instant::now() >= deadline {
            return CopyWait::NothingSelected;
        }
        std::thread::sleep(interval);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    const SENTINEL: &str = "\u{1}__test_sentinel__\u{1}";
    const TIMEOUT: Duration = Duration::from_millis(30);
    const INTERVAL: Duration = Duration::from_millis(1);

    /// Build a reader that returns the scripted values in order, then
    /// repeats the last one forever. Also counts how many reads happened.
    fn scripted_reader<'a>(
        script: Vec<Option<&'static str>>,
        calls: &'a Cell<usize>,
    ) -> impl FnMut() -> Option<String> + 'a {
        move || {
            let i = calls.get();
            calls.set(i + 1);
            let idx = i.min(script.len() - 1);
            script[idx].map(String::from)
        }
    }

    #[test]
    fn copied_text_is_returned_immediately() {
        let calls = Cell::new(0);
        let read = scripted_reader(vec![Some("hello")], &calls);
        assert_eq!(
            wait_for_copy(read, SENTINEL, TIMEOUT, INTERVAL),
            CopyWait::Copied("hello".into())
        );
        assert_eq!(calls.get(), 1);
    }

    #[test]
    fn sentinel_until_timeout_means_nothing_selected() {
        let calls = Cell::new(0);
        let read = scripted_reader(vec![Some(SENTINEL)], &calls);
        assert_eq!(
            wait_for_copy(read, SENTINEL, TIMEOUT, INTERVAL),
            CopyWait::NothingSelected
        );
        // Must actually have polled, not given up after one fixed read.
        assert!(
            calls.get() > 1,
            "expected polling, got {} reads",
            calls.get()
        );
    }

    #[test]
    fn slow_app_copy_landing_after_several_polls_is_found() {
        let calls = Cell::new(0);
        let read = scripted_reader(
            vec![
                Some(SENTINEL),
                Some(SENTINEL),
                Some(SENTINEL),
                Some("selected text"),
            ],
            &calls,
        );
        assert_eq!(
            wait_for_copy(read, SENTINEL, TIMEOUT, INTERVAL),
            CopyWait::Copied("selected text".into())
        );
    }

    #[test]
    fn transient_read_failure_is_retried() {
        let calls = Cell::new(0);
        let read = scripted_reader(vec![None, None, Some("recovered")], &calls);
        assert_eq!(
            wait_for_copy(read, SENTINEL, TIMEOUT, INTERVAL),
            CopyWait::Copied("recovered".into())
        );
    }

    #[test]
    fn whitespace_only_copy_is_no_selection() {
        let calls = Cell::new(0);
        let read = scripted_reader(vec![Some("   \n\t ")], &calls);
        assert_eq!(
            wait_for_copy(read, SENTINEL, TIMEOUT, INTERVAL),
            CopyWait::NothingSelected
        );
    }

    #[test]
    fn polling_stops_as_soon_as_text_arrives() {
        let calls = Cell::new(0);
        let read = scripted_reader(vec![Some(SENTINEL), Some("fast")], &calls);
        assert_eq!(
            wait_for_copy(read, SENTINEL, TIMEOUT, INTERVAL),
            CopyWait::Copied("fast".into())
        );
        assert_eq!(calls.get(), 2, "should not keep polling after success");
    }
}
