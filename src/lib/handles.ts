export function normalizeHandle(handle: string): string {
  return handle.trim().toLowerCase();
}

export function isValidHandle(handle: string): boolean {
  return /^[a-z0-9_]{3,40}$/.test(normalizeHandle(handle));
}