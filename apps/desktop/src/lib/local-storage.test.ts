import { beforeEach, describe, expect, it, vi } from "vitest";
import { setLocalStorageItem } from "./local-storage";

describe("localStorage persistence helper", () => {
  let storage: Map<string, string>;

  beforeEach(() => {
    storage = new Map([["narview.githubPrCache.v1", "large cached diff payload"]]);
    vi.restoreAllMocks();
  });

  it("clears bulky cache data and retries smaller state writes after quota errors", () => {
    const setItem = vi.fn((key: string, value: string) => {
      if (key === "narview.reviewQueueState.v1" && storage.has("narview.githubPrCache.v1")) {
        throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      }

      storage.set(key, value);
    });

    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem,
        removeItem: (key: string) => storage.delete(key),
        clear: () => storage.clear(),
      },
    });

    expect(setLocalStorageItem("narview.reviewQueueState.v1", '{"version":1}')).toBe(true);
    expect(storage.get("narview.reviewQueueState.v1")).toBe('{"version":1}');
    expect(storage.has("narview.githubPrCache.v1")).toBe(false);
    expect(setItem).toHaveBeenCalledTimes(2);
  });
});
