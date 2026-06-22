import { open } from "@tauri-apps/plugin-dialog";
import type { Accent, Settings, ThemeMode } from "../lib/api";
import { captureHotkey, prettyHotkey } from "../lib/hotkey";
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

const THEMES: ReadonlyArray<[ThemeMode, string]> = [
  ["light", "라이트"],
  ["dark", "다크"],
  ["system", "시스템"],
];

// Bounds for the numeric settings. Kept in sync with `sanitize` in settings.rs.
const LIMITS = {
  suggestMinLength: { min: 2, max: 10, default: 2 },
  suggestMaxResults: { min: 5, max: 50, default: 20 },
  pronVolume: { min: 0, max: 100 },
  textScale: { min: 80, max: 140 },
} as const;

interface SegmentRowProps<T extends string> {
  label: string;
  options: ReadonlyArray<[T, string]>;
  value: T;
  onSelect: (value: T) => void;
}

function SegmentRow<T extends string>({ label, options, value, onSelect }: SegmentRowProps<T>) {
  return (
    <div className="settings__row">
      <span className="settings__label">{label}</span>
      <div className="settings__segment">
        {options.map(([optionValue, optionLabel]) => (
          <button
            key={optionValue}
            type="button"
            className={
              value === optionValue ? "settings__seg settings__seg--active" : "settings__seg"
            }
            onClick={() => onSelect(optionValue)}
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

interface HotkeyRowProps {
  label: string;
  value: string;
  onChange: (hotkey: string) => void;
}

function HotkeyRow({ label, value, onChange }: HotkeyRowProps) {
  return (
    <label className="settings__row">
      <span className="settings__label">{label}</span>
      <div className="settings__hotkey-box">
        <input
          type="text"
          className="settings__hotkey"
          readOnly
          value={prettyHotkey(value)}
          placeholder="클릭 후 키 입력"
          onKeyDown={(e) => {
            e.preventDefault();
            if (e.key === "Backspace" || e.key === "Delete") {
              onChange("");
              return;
            }
            const hk = captureHotkey(e);
            if (hk) {
              onChange(hk);
            }
          }}
        />
      </div>
    </label>
  );
}

interface LangRowProps {
  label: string;
  value: string;
  onChange: (code: string) => void;
}

function LangRow({ label, value, onChange }: LangRowProps) {
  return (
    <label className="settings__row">
      <span className="settings__label">{label}</span>
      <select className="settings__select" value={value} onChange={(e) => onChange(e.target.value)}>
        {LANGUAGES.map(([code, optionLabel]) => (
          <option key={code} value={code}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
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

        <SegmentRow
          label="테마"
          options={THEMES}
          value={settings.theme}
          onSelect={(theme) => update({ theme })}
        />

        <SegmentRow
          label="영어 기본 발음"
          options={EN_ACCENTS}
          value={settings.defaultAccentEn}
          onSelect={(accent) => update({ defaultAccentEn: accent })}
        />

        <SegmentRow
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
          <span className="settings__label">항상 위에 표시</span>
          <input
            type="checkbox"
            className="settings__check"
            checked={settings.alwaysOnTop}
            onChange={(e) => update({ alwaysOnTop: e.target.checked })}
          />
        </label>

        <label className="settings__row">
          <span className="settings__label">최소화 시 트레이로 숨기기</span>
          <input
            type="checkbox"
            className="settings__check"
            checked={settings.minimizeToTray}
            onChange={(e) => update({ minimizeToTray: e.target.checked })}
          />
        </label>

        <label className="settings__row">
          <span className="settings__label">발음 볼륨</span>
          <div className="settings__slider-box">
            <input
              type="range"
              className="settings__slider"
              min={LIMITS.pronVolume.min}
              max={LIMITS.pronVolume.max}
              value={settings.pronVolume}
              onChange={(e) => update({ pronVolume: Number(e.target.value) })}
            />
            <span className="settings__slider-value">{settings.pronVolume}%</span>
          </div>
        </label>

        <label className="settings__row">
          <span className="settings__label">본문 글자 크기</span>
          <div className="settings__slider-box">
            <input
              type="range"
              className="settings__slider"
              min={LIMITS.textScale.min}
              max={LIMITS.textScale.max}
              step={5}
              value={settings.textScale}
              onChange={(e) => update({ textScale: Number(e.target.value) })}
            />
            <span className="settings__slider-value">{settings.textScale}%</span>
          </div>
        </label>

        <label className="settings__row">
          <span className="settings__label">자동완성 최소 글자수</span>
          <input
            type="number"
            className="settings__number"
            min={LIMITS.suggestMinLength.min}
            max={LIMITS.suggestMinLength.max}
            value={settings.suggestMinLength}
            onChange={(e) =>
              update({
                suggestMinLength: clampInt(
                  e.target.value,
                  LIMITS.suggestMinLength.min,
                  LIMITS.suggestMinLength.max,
                  LIMITS.suggestMinLength.default,
                ),
              })
            }
          />
        </label>

        <label className="settings__row">
          <span className="settings__label">자동완성 최대 결과수</span>
          <input
            type="number"
            className="settings__number"
            min={LIMITS.suggestMaxResults.min}
            max={LIMITS.suggestMaxResults.max}
            value={settings.suggestMaxResults}
            onChange={(e) =>
              update({
                suggestMaxResults: clampInt(
                  e.target.value,
                  LIMITS.suggestMaxResults.min,
                  LIMITS.suggestMaxResults.max,
                  LIMITS.suggestMaxResults.default,
                ),
              })
            }
          />
        </label>

        <HotkeyRow
          label="전역 단축키 (창 열기)"
          value={settings.hotkey}
          onChange={(hk) => update({ hotkey: hk })}
        />

        <HotkeyRow
          label="번역 토글 단축키"
          value={settings.toggleHotkey}
          onChange={(hk) => update({ toggleHotkey: hk })}
        />

        <LangRow
          label="기본 번역 대상"
          value={settings.translateTarget}
          onChange={(code) => update({ translateTarget: code })}
        />

        <LangRow
          label="보조 번역 대상 (토글)"
          value={settings.translateTargetAlt}
          onChange={(code) => update({ translateTargetAlt: code })}
        />

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

        <div className="settings__row settings__row--stack settings__help">
          <span className="settings__label">단축키 &amp; 사용법</span>
          <dl className="settings__help-keys">
            {(
              [
                [prettyHotkey(settings.hotkey), "창 열기 (짧게: 표시 / 길게: 선택영역 검색)"],
                [prettyHotkey(settings.toggleHotkey), "보조 언어로 번역"],
                ["Enter", "검색 / 번역"],
                ["Ctrl+Enter", "입력창 줄바꿈"],
                ["Alt+J / Alt+K", "결과 설명 아래 / 위로 스크롤"],
                ["↑ ↓ / Del", "히스토리 이동 / 삭제"],
                ["Esc / ↓", "히스토리 닫기 / 다시 열기"],
              ] as ReadonlyArray<[string, string]>
            ).map(([key, desc]) => (
              <div className="settings__help-row" key={desc}>
                <dt>
                  <kbd className="settings__kbd">{key}</kbd>
                </dt>
                <dd className="settings__help-desc">{desc}</dd>
              </div>
            ))}
          </dl>
          <ul className="settings__help-list">
            <li>영어 단어 → 영한사전 (미국 / 영국 발음)</li>
            <li>일본어 단어 → 일한사전 (여성 / 남성, 녹음 없으면 TTS)</li>
            <li>한국어·문장 → 번역 (입력 언어가 대상과 같으면 자동 회피)</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
