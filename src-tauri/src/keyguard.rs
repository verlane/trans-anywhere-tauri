//! Guards the held hotkey key's hardware auto-repeat during the long-press
//! action.
//!
//! While the user still holds e.g. Alt+W, the copy simulation must release
//! Alt logically — and from that instant the held W auto-repeats as plain
//! text into whatever has focus. A WH_KEYBOARD_LL hook proved unreliable
//! here: its verdicts are ignored whenever the hook chain misses the
//! LowLevelHooksTimeout, so repeats it "swallowed" still reached the input.
//! Instead, the bare key (and Ctrl+key) is temporarily registered as a
//! global shortcut for the duration of the hold: RegisterHotKey consumes
//! matching keystrokes in the kernel before they are ever posted to a
//! window — the same mechanism that already keeps Alt+W repeats silent.

/// The hotkey's main (non-modifier) key: the last '+'-separated segment of
/// strings like "Alt+W" / "ctrl+shift+F5", normalized to uppercase so it can
/// be re-registered as a bare shortcut ("W", "Ctrl+W").
pub fn main_key_token(hotkey: &str) -> Option<String> {
    let _ = hotkey;
    unimplemented!("main_key_token not implemented yet")
}

/// Windows virtual-key code for the hotkey's main key, used to poll the
/// physical key state. Returns None for keys this table doesn't cover
/// (the guard then falls back to a fixed delay, not an error).
pub fn main_key_vk(hotkey: &str) -> Option<u32> {
    let key = main_key_token(hotkey)?;
    match key.as_bytes() {
        [c @ b'A'..=b'Z'] | [c @ b'0'..=b'9'] => Some(*c as u32),
        _ => match key.as_str() {
            "SPACE" => Some(0x20),
            "INSERT" => Some(0x2D),
            "DELETE" => Some(0x2E),
            "HOME" => Some(0x24),
            "END" => Some(0x23),
            "PAGEUP" => Some(0x21),
            "PAGEDOWN" => Some(0x22),
            _ => {
                // F1..F24 -> VK_F1 (0x70) ..
                let n: u32 = key.strip_prefix('F')?.parse().ok()?;
                if (1..=24).contains(&n) {
                    Some(0x70 + n - 1)
                } else {
                    None
                }
            }
        },
    }
}

/// Block until the key is physically released, or `timeout` elapses.
/// vk == 0 (unknown key) falls back to a short fixed wait.
#[cfg(windows)]
pub fn wait_until_released(vk: u32, timeout: std::time::Duration) {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
    const POLL: std::time::Duration = std::time::Duration::from_millis(8);
    if vk == 0 {
        std::thread::sleep(std::time::Duration::from_secs(2).min(timeout));
        return;
    }
    let start = std::time::Instant::now();
    while start.elapsed() < timeout {
        // SAFETY: GetAsyncKeyState is a stateless read of the async key table.
        let down = unsafe { GetAsyncKeyState(vk as i32) as u16 & 0x8000 != 0 };
        if !down {
            return;
        }
        std::thread::sleep(POLL);
    }
}

/// Non-Windows fallback: no async key state API is wired up, so give the
/// user a moment to let go before the guards are dropped.
#[cfg(not(windows))]
pub fn wait_until_released(_vk: u32, timeout: std::time::Duration) {
    std::thread::sleep(std::time::Duration::from_secs(2).min(timeout));
}

#[cfg(test)]
mod tests {
    use super::{main_key_token, main_key_vk};

    #[test]
    fn token_is_last_segment_uppercased() {
        assert_eq!(main_key_token("Alt+W").as_deref(), Some("W"));
        assert_eq!(main_key_token("ctrl+shift+f5").as_deref(), Some("F5"));
        assert_eq!(main_key_token("Alt+Space").as_deref(), Some("SPACE"));
    }

    #[test]
    fn token_of_blank_hotkey_is_none() {
        assert_eq!(main_key_token(""), None);
        assert_eq!(main_key_token("Alt+"), None);
        assert_eq!(main_key_token("  "), None);
    }

    #[test]
    fn maps_letter_main_key_case_insensitively() {
        assert_eq!(main_key_vk("Alt+W"), Some(0x57));
        assert_eq!(main_key_vk("alt+w"), Some(0x57));
        assert_eq!(main_key_vk("Ctrl+Shift+a"), Some(0x41));
    }

    #[test]
    fn maps_digits_and_function_keys() {
        assert_eq!(main_key_vk("Alt+1"), Some(0x31));
        assert_eq!(main_key_vk("Ctrl+F5"), Some(0x70 + 4));
        assert_eq!(main_key_vk("F12"), Some(0x70 + 11));
    }

    #[test]
    fn unknown_or_empty_keys_yield_none() {
        // 모르는 키는 가드만 생략하고 기능은 계속 동작해야 하므로 None.
        assert_eq!(main_key_vk("Alt+OEM_3"), None);
        assert_eq!(main_key_vk(""), None);
        assert_eq!(main_key_vk("Alt+F99"), None);
    }
}
