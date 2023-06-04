export function saveToLocalStorage(key: string, value: any): void {
  try {
    const serializedValue = JSON.stringify(value);
    localStorage.setItem(key, serializedValue);
  } catch (error) {
    console.error('Error saving to local storage', error);
  }
}

export function readFromLocalStorage<T>(key: string, defaultValue: T): T {
  try {
    const serializedValue = localStorage.getItem(key);
    if (serializedValue === null) {
      return defaultValue;
    }
    return JSON.parse(serializedValue);
  } catch (error) {
    console.error('Error reading from local storage', error);

    return defaultValue;
  }
}

export function formatDuration(duration: number): string {
  if (duration < 1000) {
    return `${duration}ms`;
  }

  const seconds = duration / 1000;

  return `${seconds.toFixed(1)}s`;
}
