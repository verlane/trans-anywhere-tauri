import { useEffect, useState } from "react";
import { getSettings, saveSettings, type Settings } from "../lib/api";

const FALLBACK: Settings = {
  defaultAccentEn: "us",
  defaultAccentJa: "us",
  autoPlay: false,
  suggestMinLength: 2,
  suggestMaxResults: 20,
  translateTarget: "en",
  translateTargetAlt: "ja",
  toggleHotkey: "Shift+Enter",
  minimizeToTray: false,
  alwaysOnTop: false,
  dbPath: "",
  hotkey: "Alt+W",
  pronVolume: 100,
  theme: "system",
  textScale: 100,
};

interface UseSettings {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  loaded: boolean;
}

/** Load settings once and persist every change (optimistic in-memory update). */
export function useSettings(): UseSettings {
  const [settings, setSettings] = useState<Settings>(FALLBACK);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSettings()
      .then((s) => {
        if (!cancelled) {
          setSettings(s);
          setLoaded(true);
        }
      })
      .catch(() => setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, []);

  function update(patch: Partial<Settings>) {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next).catch(() => {});
      return next;
    });
  }

  return { settings, update, loaded };
}
