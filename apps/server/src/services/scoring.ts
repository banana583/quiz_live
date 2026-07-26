export function score(base: number, responseMs: number, limitMs: number, correct: boolean) {
  const speed = Math.max(0.2, 1 - responseMs / limitMs);
  return correct ? Math.round(base * (0.5 + 0.5 * speed)) : 0;
}