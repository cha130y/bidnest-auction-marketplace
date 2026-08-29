/**
 * Fisher–Yates shuffle — returns a new array, the input is left untouched.
 *
 * Not `.sort(() => Math.random() - 0.5)`: that trick's comparator calls are
 * not uniform across positions, so some orderings come up more often than
 * others. This one is unbiased.
 */
export function shuffle<T>(items: T[]): T[] {
  const result = [...items]

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }

  return result
}
