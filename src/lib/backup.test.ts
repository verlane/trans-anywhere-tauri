import { describe, it, expect } from "vitest";
import {
  buildBackup,
  parseBackup,
  defaultBackupName,
  BACKUP_KIND,
  BACKUP_VERSION,
  FAVORITES_MAX,
} from "./backup";
import { DEFAULT_SETTINGS } from "./settingsDefaults";
import { HISTORY_MAX } from "./history";

const SAMPLE = {
  settings: { ...DEFAULT_SETTINGS, theme: "dark" as const, pronVolume: 40 },
  favorites: [{ term: "apple", gloss: "사과" }],
  history: ["apple", "banana"],
};

describe("buildBackup", () => {
  it("stamps the bundle kind and version so an unrelated JSON file is rejected on import", () => {
    const parsed = JSON.parse(buildBackup(SAMPLE));
    expect(parsed.kind).toBe(BACKUP_KIND);
    expect(parsed.version).toBe(BACKUP_VERSION);
  });

  it("carries settings, favorites and history", () => {
    const parsed = JSON.parse(buildBackup(SAMPLE));
    expect(parsed.settings.theme).toBe("dark");
    expect(parsed.favorites).toEqual([{ term: "apple", gloss: "사과" }]);
    expect(parsed.history).toEqual(["apple", "banana"]);
  });

  it("never exports the dictionary DB path (it points at another machine's disk)", () => {
    const parsed = JSON.parse(buildBackup({ ...SAMPLE, settings: { ...SAMPLE.settings, dbPath: "D:/x.db" } }));
    expect(parsed.settings.dbPath).toBeUndefined();
  });

  it("records an ISO export timestamp", () => {
    const parsed = JSON.parse(buildBackup(SAMPLE));
    expect(() => new Date(parsed.exportedAt).toISOString()).not.toThrow();
  });

  it("round-trips through parseBackup", () => {
    const result = parseBackup(buildBackup(SAMPLE));
    expect(result.settings.theme).toBe("dark");
    expect(result.settings.pronVolume).toBe(40);
    expect(result.favorites).toEqual(SAMPLE.favorites);
    expect(result.history).toEqual(SAMPLE.history);
  });
});

describe("defaultBackupName", () => {
  it("dates the file so successive backups don't overwrite each other", () => {
    expect(defaultBackupName(new Date(2026, 7, 22))).toBe("transanywhere-backup-20260822.json");
  });

  it("zero-pads the month and day", () => {
    expect(defaultBackupName(new Date(2026, 0, 3))).toBe("transanywhere-backup-20260103.json");
  });
});

describe("parseBackup", () => {
  function bundle(extra: Record<string, unknown>) {
    return JSON.stringify({ kind: BACKUP_KIND, version: BACKUP_VERSION, ...extra });
  }

  it("rejects malformed JSON", () => {
    expect(() => parseBackup("{ nope")).toThrow();
  });

  it("rejects a JSON file that is not a TransAnywhere backup", () => {
    expect(() => parseBackup(JSON.stringify({ hello: "world" }))).toThrow();
  });

  it("rejects a bundle from a newer app version", () => {
    expect(() =>
      parseBackup(JSON.stringify({ kind: BACKUP_KIND, version: BACKUP_VERSION + 1 })),
    ).toThrow();
  });

  it("accepts a bundle with no optional sections (all sections empty)", () => {
    const result = parseBackup(bundle({}));
    expect(result.settings).toEqual({});
    expect(result.favorites).toEqual([]);
    expect(result.history).toEqual([]);
  });

  it("keeps only known setting keys", () => {
    const result = parseBackup(bundle({ settings: { autoPlay: true, bogusKey: 1 } }));
    expect(result.settings).toEqual({ autoPlay: true });
  });

  it("drops setting values of the wrong type", () => {
    const result = parseBackup(bundle({ settings: { autoPlay: "yes", textScale: 120 } }));
    expect(result.settings).toEqual({ textScale: 120 });
  });

  it("drops setting values outside their allowed set", () => {
    const result = parseBackup(bundle({ settings: { theme: "rainbow", defaultAccentEn: "uk" } }));
    expect(result.settings).toEqual({ defaultAccentEn: "uk" });
  });

  it("drops a translation language the app has no option for", () => {
    const result = parseBackup(bundle({ settings: { translateTarget: "xx", translateTargetAlt: "ja" } }));
    expect(result.settings).toEqual({ translateTargetAlt: "ja" });
  });

  it("clamps out-of-range numeric settings instead of applying them raw", () => {
    // 범위를 벗어난 값이 그대로 적용되면 재시작 전까지 화면이 깨진다.
    const result = parseBackup(
      bundle({
        settings: { textScale: 99999, pronVolume: -50, suggestMaxResults: 999, suggestMinLength: 0 },
      }),
    );
    expect(result.settings).toEqual({
      textScale: 140,
      pronVolume: 0,
      suggestMaxResults: 50,
      suggestMinLength: 2,
    });
  });

  it("drops a non-finite number rather than clamping it", () => {
    expect(parseBackup(bundle({ settings: { textScale: NaN } })).settings).toEqual({});
  });

  it("caps the restored word book so a huge bundle can't overflow local storage", () => {
    const many = Array.from({ length: FAVORITES_MAX + 25 }, (_, i) => ({ term: `w${i}`, gloss: "" }));
    expect(parseBackup(bundle({ favorites: many })).favorites).toHaveLength(FAVORITES_MAX);
  });

  it("drops duplicate favorites, keeping the first occurrence", () => {
    const result = parseBackup(
      bundle({ favorites: [{ term: "a", gloss: "first" }, { term: "a", gloss: "second" }] }),
    );
    expect(result.favorites).toEqual([{ term: "a", gloss: "first" }]);
  });

  it("distinguishes a corrupt version field from a genuinely newer bundle", () => {
    const newer = JSON.stringify({ kind: BACKUP_KIND, version: BACKUP_VERSION + 1 });
    const corrupt = JSON.stringify({ kind: BACKUP_KIND, version: "1" });
    expect(() => parseBackup(newer)).toThrow(/업데이트/);
    expect(() => parseBackup(corrupt)).not.toThrow(/업데이트/);
    expect(() => parseBackup(corrupt)).toThrow();
  });

  it("ignores an imported dictionary DB path so a bad path can't break startup", () => {
    const result = parseBackup(bundle({ settings: { dbPath: "D:/gone.db", autoPlay: true } }));
    expect(result.settings).toEqual({ autoPlay: true });
  });

  it("migrates the legacy string[] word-book format", () => {
    const result = parseBackup(bundle({ favorites: ["apple", { term: "b", gloss: "비" }] }));
    expect(result.favorites).toEqual([
      { term: "apple", gloss: "" },
      { term: "b", gloss: "비" },
    ]);
  });

  it("drops malformed favorites instead of failing the whole import", () => {
    const result = parseBackup(bundle({ favorites: [{ gloss: "no term" }, 42, { term: "ok" }] }));
    expect(result.favorites).toEqual([{ term: "ok", gloss: "" }]);
  });

  it("keeps history strings only, trimmed and deduped", () => {
    const result = parseBackup(bundle({ history: ["a", 1, "  a  ", "", "b"] }));
    expect(result.history).toEqual(["a", "b"]);
  });

  it("caps history at the stored maximum", () => {
    const many = Array.from({ length: HISTORY_MAX + 10 }, (_, i) => `w${i}`);
    expect(parseBackup(bundle({ history: many })).history).toHaveLength(HISTORY_MAX);
  });

  it("treats non-array favorites/history as empty", () => {
    const result = parseBackup(bundle({ favorites: "nope", history: { a: 1 } }));
    expect(result.favorites).toEqual([]);
    expect(result.history).toEqual([]);
  });
});
