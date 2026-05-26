const bulkyCacheStorageKeys = ["narview.githubPrCache.v1"];

export function setLocalStorageItem(key: string, value: string) {
  if (typeof window === "undefined") {
    return true;
  }

  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (error) {
    if (!isQuotaExceededError(error)) {
      console.warn(`Narview could not persist local state for ${key}.`, error);
      return false;
    }
  }

  for (const cacheKey of bulkyCacheStorageKeys) {
    if (cacheKey !== key) {
      try {
        window.localStorage.removeItem(cacheKey);
      } catch {
        // Best effort only; localStorage can be unavailable or quota-locked.
      }
    }
  }

  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (retryError) {
    console.warn(`Narview could not persist local state for ${key} after clearing cache.`, retryError);
    return false;
  }
}

function isQuotaExceededError(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")
  );
}
