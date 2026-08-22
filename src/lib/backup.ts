import type { Settings } from "./api";
import { DEFAULT_SETTINGS } from "./settingsDefaults";
import { normalizeFavorites, type FavoriteItem } from "./favorites";
import { normalizeHistory } from "./history";

/** Marker written into every bundle so an unrelated JSON file is rejected on import. */
export const BACKUP_KIND = "transanywhere.backup";
/** Bundle format version. Bump when the shape changes incompatibly. */
export const BACKUP_VERSION = 1;

/** Suggested file name for the save dialog, dated so backups don't overwrite each other. */
export function defaultBackupName(now = new Date()): string {
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  return `transanywhere-backup-${stamp}.json`;
}

/** Everything a backup carries: settings, the word book, and recent searches. */
export interface BackupPayload {
  settings: Settings;
  favorites: FavoriteItem[];
  history: string[];
}

/** An imported bundle. `settings` holds only the keys that survived validation. */
export interface ParsedBackup {
  settings: Partial<Settings>;
  favorites: FavoriteItem[];
  history: string[];
}

/**
 * Settings that are machine-specific and must not travel between installs.
 * `dbPath` points at a disk location that likely doesn't exist on the machine
 * restoring the backup, and a bad path breaks the dictionary on every launch.
 */
const LOCAL_ONLY_KEYS: ReadonlyArray<keyof Settings> = ["dbPath"];

/** String settings restricted to a fixed set of values (backend rejects the rest). */
const ALLOWED_VALUES: Partial<Record<keyof Settings, readonly string[]>> = {
  defaultAccentEn: ["us", "uk"],
  defaultAccentJa: ["us", "uk"],
  theme: ["light", "dark", "system"],
  translateTarget: ["ko", "en", "ja"],
  translateTargetAlt: ["ko", "en", "ja"],
  translateFallback: ["ko", "en", "ja"],
};

/**
 * Valid ranges for the numeric settings, mirroring `sanitize` in settings.rs.
 * An imported value is clamped rather than dropped, so a slightly-off backup
 * still restores something usable instead of silently reverting to a default.
 */
const NUMERIC_RANGES: Partial<Record<keyof Settings, readonly [number, number]>> = {
  suggestMinLength: [2, 10],
  suggestMaxResults: [5, 50],
  pronVolume: [0, 100],
  textScale: [80, 140],
};

/**
 * Largest word book a bundle may restore. The backend caps the bundle file at
 * 8MB, which still leaves room for more entries than localStorage can hold —
 * and a failed localStorage write is silent, so an over-long list would look
 * imported and then be gone on the next launch. Cap it here instead, where the
 * confirmation dialog can show the user the count actually being restored.
 */
export const FAVORITES_MAX = 5000;

/** Settings keys carried by a backup, in `Settings` declaration order. */
const PORTABLE_KEYS = (Object.keys(DEFAULT_SETTINGS) as Array<keyof Settings>).filter(
  (key) => !LOCAL_ONLY_KEYS.includes(key),
);

/** Serialize the current state as a pretty-printed bundle ready to write to disk. */
export function buildBackup(payload: BackupPayload, now = new Date()): string {
  const settings: Partial<Settings> = {};
  for (const key of PORTABLE_KEYS) {
    // The cast is needed because TS can't relate the key and value types across
    // a dynamic index; the value is copied verbatim from a typed Settings.
    (settings as Record<string, unknown>)[key] = payload.settings[key];
  }
  return JSON.stringify(
    {
      kind: BACKUP_KIND,
      version: BACKUP_VERSION,
      exportedAt: now.toISOString(),
      settings,
      favorites: payload.favorites,
      history: payload.history,
    },
    null,
    2,
  );
}

/**
 * Validate and normalize a bundle read from disk. Throws a user-facing message
 * when the file isn't a usable backup; individual malformed entries inside a
 * valid bundle are dropped rather than failing the whole import.
 */
export function parseBackup(text: string): ParsedBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("JSON 형식이 아닙니다");
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("백업 파일 형식이 아닙니다");
  }

  const bundle = raw as Record<string, unknown>;
  if (bundle.kind !== BACKUP_KIND) {
    throw new Error("TransAnywhere 백업 파일이 아닙니다");
  }
  if (typeof bundle.version !== "number") {
    throw new Error("백업 파일이 손상되었습니다 (version 없음)");
  }
  if (bundle.version > BACKUP_VERSION) {
    throw new Error("더 새로운 버전의 백업입니다. 앱을 업데이트해 주세요");
  }

  return {
    settings: pickSettings(bundle.settings),
    favorites: dedupeFavorites(normalizeFavorites(bundle.favorites)).slice(0, FAVORITES_MAX),
    history: normalizeHistory(bundle.history),
  };
}

/** Copy over the known setting keys whose value has the expected type/range. */
function pickSettings(raw: unknown): Partial<Settings> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const source = raw as Record<string, unknown>;
  const picked: Partial<Settings> = {};
  for (const key of PORTABLE_KEYS) {
    const value = source[key];
    if (typeof value !== typeof DEFAULT_SETTINGS[key]) {
      continue;
    }
    const allowed = ALLOWED_VALUES[key];
    if (allowed && !allowed.includes(value as string)) {
      continue;
    }
    const range = NUMERIC_RANGES[key];
    if (range) {
      const n = value as number;
      if (!Number.isFinite(n)) {
        continue;
      }
      (picked as Record<string, unknown>)[key] = Math.min(range[1], Math.max(range[0], n));
      continue;
    }
    (picked as Record<string, unknown>)[key] = value;
  }
  return picked;
}

/** Keep the first entry per term; the word book treats `term` as its identity. */
function dedupeFavorites(items: FavoriteItem[]): FavoriteItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.term)) {
      return false;
    }
    seen.add(item.term);
    return true;
  });
}
