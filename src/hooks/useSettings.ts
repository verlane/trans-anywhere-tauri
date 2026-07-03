import { useEffect, useState } from "react";
import { getSettings, saveSettings, type Settings } from "../lib/api";

const FALLBACK: Settings = {
  defaultAccentEn: "us",
  defaultAccentJa: "us",
  autoPlay: false,
  suggestMinLength: 2,
  suggestMaxResults: 20,
  translateTarget: "ko",
  translateTargetAlt: "ja",
  translateFallback: "en",
  minimizeToTray: false,
  alwaysOnTop: false,
  dbPath: "",
  hotkey: "Alt+W",
  pronVolume: 100,
  theme: "system",
  textScale: 100,
  hoverPreview: true,
};

interface UseSettings {
  settings: Settings;
  /** Apply and persist a change. Resolves to an error message, or null on success. */
  update: (patch: Partial<Settings>) => Promise<string | null>;
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

  // The save runs outside the setState updater — React requires updaters to be
  // pure, and StrictMode invokes them twice in dev (double-saving every change).
  function update(patch: Partial<Settings>): Promise<string | null> {
    const next = { ...settings, ...patch };
    setSettings(next);
    return saveSettings(next).then(
      () => null,
      (e) => String(e),
    );
  }

  return { settings, update, loaded };
}
