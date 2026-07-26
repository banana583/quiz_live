interface Option {
  id: string;
  isCorrect: boolean;
}

interface Question {
  id: string;
  type: 'SINGLE' | 'MULTIPLE';
  points: number;
  timeLimit: number; // в секундах
  options: Option[];
}

export function validateAndScore(
  question: Question,
  selectedOptionIds: string[],
  responseMs: number
): { isCorrect: boolean; points: number } {
  // Защита от некорректного времени
  if (typeof responseMs !== 'number' || !Number.isFinite(responseMs) || responseMs < 0) {
    return { isCorrect: false, points: 0 };
  }

  const limitMs = question.timeLimit * 1000;

  // Проверка времени
  if (responseMs > limitMs) {
    return { isCorrect: false, points: 0 };
  }

  // Проверка правильности выбора
  const correctIds = question.options
    .filter(o => o.isCorrect)
    .map(o => o.id)
    .sort();
  const selected = [...new Set(selectedOptionIds)].sort();
  const isCorrect =
    correctIds.length === selected.length &&
    correctIds.every((id, i) => id === selected[i]);

  if (!isCorrect) {
    return { isCorrect: false, points: 0 };
  }

  // Расчёт очков с учётом скорости
  const speed = Math.max(0.2, 1 - responseMs / limitMs);
  const points = Math.round(question.points * (0.5 + 0.5 * speed));
  // Гарантируем, что points — конечное число (на случай, если speed = NaN)
  return { isCorrect: true, points: Number.isFinite(points) ? points : 0 };
}