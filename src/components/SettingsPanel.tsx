import { open } from "@tauri-apps/plugin-dialog";
import type { Accent, Settings } from "../lib/api";
import "./SettingsPanel.css";

interface SettingsPanelProps {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  onClose: () => void;
}

const LANGUAGES: ReadonlyArray<[string, string]> = [
  ["ko", "한국어"],
  ["en", "English"],
  ["ja", "日本語"],
];

// us -> slot1 (media1), uk -> slot2 (media2). Labels differ per dictionary.
const EN_ACCENTS: ReadonlyArray<[Accent, string]> = [
  ["us", "미국식"],
  ["uk", "영국식"],
];

const JA_ACCENTS: ReadonlyArray<[Accent, string]> = [
  ["us", "여성"],
  ["uk", "남성"],
];

interface AccentRowProps {
  label: string;
  options: ReadonlyArray<[Accent, string]>;
  value: Accent;
  onSelect: (accent: Accent) => void;
}

function AccentRow({ label, options, value, onSelect }: AccentRowProps) {
  return (
    <div className="settings__row">
      <span className="settings__label">{label}</span>
      <div className="settings__segment">
        {options.map(([accent, optionLabel]) => (
          <button
            key={accent}
            type="button"
            className={
              value === accent ? "settings__seg settings__seg--active" : "settings__seg"
            }
            onClick={() => onSelect(accent)}
          >
            {optionLabel}
          </button>
        ))}
      </div>
    </div>
  );
}

function clampInt(value: string, min: number, max: number, fallback: number): number {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, n));
}

/** Build a Tauri accelerator string (e.g. "Alt+W") from a keydown, or null. */
function captureHotkey(e: React.KeyboardEvent): string | null {
  const key = e.key;
  if (key === "Control" || key === "Alt" || key === "Shift" || key === "Meta") {
    return null;
  }
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Control");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Super");
  if (parts.length === 0) {
    return null; // a global shortcut needs at least one modifier
  }
  parts.push(key.length === 1 ? key.toUpperCase() : key);
  return parts.join("+");
}

export function SettingsPanel({ settings, update, onClose }: SettingsPanelProps) {
  async function pickDb() {
    const path = await open({
      multiple: false,
      filters: [{ name: "SQLite DB", extensions: ["db", "sqlite"] }],
    });
    if (typeof path === "string") {
      update({ dbPath: path });
    }
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <aside className="settings" onClick={(e) => e.stopPropagation()}>
        <header className="settings__head">
          <h2 className="settings__title">설정</h2>
          <button type="button" className="settings__close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </header>

        <AccentRow
          label="영어 기본 발음"
          options={EN_ACCENTS}
          value={settings.defaultAccentEn}
          onSelect={(accent) => update({ defaultAccentEn: accent })}
        />

        <AccentRow
          label="일본어 기본 발음"
          options={JA_ACCENTS}
          value={settings.defaultAccentJa}
          onSelect={(accent) => update({ defaultAccentJa: accent })}
        />

        <label className="settings__row">
          <span className="settings__label">발음 자동재생</span>
          <input
            type="checkbox"
            className="settings__check"
            checked={settings.autoPlay}
            onChange={(e) => update({ autoPlay: e.target.checked })}
          />
        </label>

        <label className="settings__row">
          <span className="settings__label">자동완성 최소 글자수</span>
          <input
            type="number"
            className="settings__number"
            min={1}
            max={10}
            value={settings.suggestMinLength}
            onChange={(e) => update({ suggestMinLength: clampInt(e.target.value, 1, 10, 2) })}
          />
        </label>

        <label className="settings__row">
          <span className="settings__label">자동완성 최대 결과수</span>
          <input
            type="number"
            className="settings__number"
            min={1}
            max={50}
            value={settings.suggestMaxResults}
            onChange={(e) => update({ suggestMaxResults: clampInt(e.target.value, 1, 50, 20) })}
          />
        </label>

        <label className="settings__row">
          <span className="settings__label">전역 단축키</span>
          <div className="settings__hotkey-box">
            <input
              type="text"
              className="settings__hotkey"
              readOnly
              value={settings.hotkey || "(없음)"}
              placeholder="클릭 후 키 입력"
              onKeyDown={(e) => {
                e.preventDefault();
                if (e.key === "Backspace" || e.key === "Delete") {
                  update({ hotkey: "" });
                  return;
                }
                const hk = captureHotkey(e);
                if (hk) {
                  update({ hotkey: hk });
                }
              }}
            />
          </div>
        </label>

        <label className="settings__row">
          <span className="settings__label">번역 대상 언어</span>
          <select
            className="settings__select"
            value={settings.targetLanguage}
            onChange={(e) => update({ targetLanguage: e.target.value })}
          >
            {LANGUAGES.map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <div className="settings__row settings__row--stack">
          <span className="settings__label">사전 DB 위치</span>
          <code className="settings__path">
            {settings.dbPath || "기본 위치 (앱 데이터 폴더)"}
          </code>
          <div className="settings__db-actions">
            <button type="button" className="settings__btn" onClick={pickDb}>
              찾아보기…
            </button>
            {settings.dbPath && (
              <button
                type="button"
                className="settings__btn settings__btn--ghost"
                onClick={() => update({ dbPath: "" })}
              >
                기본값으로
              </button>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
