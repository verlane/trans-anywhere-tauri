import { useEffect, useState } from "react";
import { getSettings, saveSettings, type Settings } from "../lib/api";

const FALLBACK: Settings = {
  defaultAccent: "us",
  autoPlay: false,
  suggestMinLength: 2,
  suggestMaxResults: 20,
  targetLanguage: "ko",
  dbPath: "",
  hotkey: "Alt+W",
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
