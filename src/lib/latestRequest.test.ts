import { describe, it, expect } from "vitest";
import { createLatestRequestGuard } from "./latestRequest";

describe("createLatestRequestGuard", () => {
  it("keeps a request current while nothing newer begins", () => {
    const guard = createLatestRequestGuard();
    const id = guard.begin();
    expect(guard.isCurrent(id)).toBe(true);
  });

  it("marks an older request stale when a newer one begins", () => {
    // 단어 A 조회가 느리게 오는 사이 단어 B를 조회하면 A 응답은 버려져야 한다.
    const guard = createLatestRequestGuard();
    const a = guard.begin();
    const b = guard.begin();
    expect(guard.isCurrent(a)).toBe(false);
    expect(guard.isCurrent(b)).toBe(true);
  });

  it("invalidate makes the in-flight request stale", () => {
    // 입력을 비우면 진행 중이던 조회 응답이 결과창을 되살리면 안 된다.
    const guard = createLatestRequestGuard();
    const id = guard.begin();
    guard.invalidate();
    expect(guard.isCurrent(id)).toBe(false);
  });

  it("a request begun after invalidate is current again", () => {
    const guard = createLatestRequestGuard();
    guard.begin();
    guard.invalidate();
    const next = guard.begin();
    expect(guard.isCurrent(next)).toBe(true);
  });

  it("guards are independent instances", () => {
    const lookup = createLatestRequestGuard();
    const audio = createLatestRequestGuard();
    const id = lookup.begin();
    audio.begin();
    audio.invalidate();
    expect(lookup.isCurrent(id)).toBe(true);
  });
});
