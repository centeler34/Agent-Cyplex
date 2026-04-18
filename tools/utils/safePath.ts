import path from 'node:path'

/**
 * Resolves `userInput` under `baseDir` and returns the absolute path only if
 * it stays within `baseDir`. Returns null when the input would escape via
 * `..`, symlink shenanigans, absolute paths, or embedded NUL bytes.
 *
 * Use this anywhere an untrusted string (a CLI arg, a remote response, a
 * caught error message, etc.) is about to be passed to `fs.*` as a file path.
 */
export function safePathUnder(baseDir: string, userInput: string): string | null {
  if (typeof userInput !== 'string' || userInput.length === 0) return null
  if (userInput.indexOf('\0') !== -1) return null
  const base = path.resolve(baseDir)
  const resolved = path.resolve(base, userInput)
  if (resolved !== base && !resolved.startsWith(base + path.sep)) return null
  return resolved
}

/**
 * Asserts that `candidate` sits inside `baseDir`. Throws if not.
 * Use when the path was derived internally but may have been influenced by
 * untrusted input upstream.
 */
export function assertPathUnder(baseDir: string, candidate: string): string {
  const resolved = safePathUnder(baseDir, candidate)
  if (resolved === null) {
    throw new Error(`path escapes base directory: ${baseDir}`)
  }
  return resolved
}

/**
 * Produces a filesystem-safe basename from arbitrary text (e.g. an error
 * message or a user-supplied label). Strips path separators, NUL bytes,
 * control chars, leading dots; truncates to 128 bytes.
 */
export function sanitizeBasename(raw: string, fallback = 'untitled'): string {
  if (typeof raw !== 'string') return fallback
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\x00-\x1f/\\]/g, '_').replace(/^\.+/, '').trim()
  if (cleaned.length === 0) return fallback
  return cleaned.slice(0, 128)
}
