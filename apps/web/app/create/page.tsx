'use client';

import { ChangeEvent, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useRouter } from 'next/navigation';
import { getStoredUser } from '../../lib/auth';

type Option = { text: string; isCorrect: boolean };
type Question = { text: string; imageUrl: string; type: 'SINGLE' | 'MULTIPLE'; points: number; options: Option[] };

const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const categories = ['Общие знания', 'IT и технологии', 'Кино', 'Музыка', 'История', 'Наука', 'Спорт', 'Другое'];
const blankQuestion = (): Question => ({ text: '', imageUrl: '', type: 'SINGLE', points: 1000, options: [{ text: '', isCorrect: true }, { text: '', isCorrect: false }] });

export default function CreateQuiz() {
  const router = useRouter();
  const [quizId, setQuizId] = useState<string | null>(null);
  const [paramsReady, setParamsReady] = useState(false);
  const editing = Boolean(quizId);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(categories[0]);
  const [time, setTime] = useState(20);
  const [questions, setQuestions] = useState<Question[]>([blankQuestion()]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [accessChecked, setAccessChecked] = useState(false);
  const [loadingQuiz, setLoadingQuiz] = useState(Boolean(quizId));

  useEffect(() => {
    setQuizId(new URLSearchParams(window.location.search).get('id'));
    setParamsReady(true);
  }, []);

  useEffect(() => {
    if (!paramsReady) return;
    const token = localStorage.getItem('token');
    const user = getStoredUser();

    if (!token || !user) {
      router.replace(`/login?next=${encodeURIComponent(editing ? `/create?id=${quizId}` : '/create')}`);
      return;
    }
    if (user.role !== 'ORGANIZER') {
      router.replace('/dashboard');
      return;
    }
    setAccessChecked(true);
  }, [router, editing, quizId, paramsReady]);

  useEffect(() => {
    if (!accessChecked || !quizId) return;
    api(`/quizzes/${quizId}`)
      .then((quiz: any) => {
        setTitle(quiz.title || '');
        setDescription(quiz.description || '');
        setCategory(quiz.category || categories[0]);
        setTime(quiz.defaultTimeSec || 20);
        setQuestions((quiz.questions || []).map((q: any) => ({
          text: q.text,
          imageUrl: q.imageUrl || '',
          type: q.type,
          points: q.points,
          options: q.options.map((o: any) => ({ text: o.text, isCorrect: o.isCorrect })),
        })));
      })
      .catch((err: any) => setError(err.message))
      .finally(() => setLoadingQuiz(false));
  }, [accessChecked, quizId]);

  function patchQuestion(index: number, patch: Partial<Question>) {
    setQuestions(current => current.map((question, i) => i === index ? { ...question, ...patch } : question));
  }

  function patchOption(questionIndex: number, optionIndex: number, patch: Partial<Option>) {
    const question = questions[questionIndex];
    patchQuestion(questionIndex, { options: question.options.map((option, i) => i === optionIndex ? { ...option, ...patch } : option) });
  }

  function selectCorrect(questionIndex: number, optionIndex: number) {
    const question = questions[questionIndex];
    patchQuestion(questionIndex, {
      options: question.options.map((option, i) => ({
        ...option,
        isCorrect: question.type === 'SINGLE' ? i === optionIndex : i === optionIndex ? !option.isCorrect : option.isCorrect,
      })),
    });
  }

  function changeType(questionIndex: number, type: Question['type']) {
    const question = questions[questionIndex];
    patchQuestion(questionIndex, {
      type,
      options: type === 'SINGLE' ? question.options.map((option, i) => ({ ...option, isCorrect: i === 0 })) : question.options,
    });
  }

  function addOption(questionIndex: number) {
    patchQuestion(questionIndex, { options: [...questions[questionIndex].options, { text: '', isCorrect: false }] });
  }

  function removeOption(questionIndex: number, optionIndex: number) {
    const question = questions[questionIndex];
    if (question.options.length <= 2) return setError('У вопроса должно быть минимум два варианта ответа.');
    let options = question.options.filter((_, i) => i !== optionIndex);
    if (!options.some(option => option.isCorrect)) options = options.map((option, i) => ({ ...option, isCorrect: i === 0 }));
    patchQuestion(questionIndex, { options });
  }

  function removeQuestion(index: number) {
    if (questions.length === 1) return setError('В квизе должен остаться хотя бы один вопрос.');
    setQuestions(current => current.filter((_, i) => i !== index));
  }

  function uploadImage(questionIndex: number, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return setError('Можно загрузить только изображение.');
    if (file.size > MAX_IMAGE_SIZE) return setError('Размер изображения не должен превышать 8 МБ.');

    const reader = new FileReader();
    reader.onload = () => {
      patchQuestion(questionIndex, { imageUrl: String(reader.result || '') });
      setError('');
    };
    reader.onerror = () => setError('Не удалось прочитать изображение.');
    reader.readAsDataURL(file);
  }

  function validate() {
    if (title.trim().length < 3) return 'Название должно содержать минимум 3 символа.';
    if (!Number.isInteger(time) || time < 5 || time > 300) return 'Время на вопрос должно быть от 5 до 300 секунд.';
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.text.trim()) return `Заполните текст вопроса ${i + 1}.`;
      if (!Number.isInteger(q.points) || q.points < 100 || q.points > 5000) return `Баллы у вопроса ${i + 1} должны быть от 100 до 5000.`;
      if (q.options.some(option => !option.text.trim())) return `Заполните все варианты ответа у вопроса ${i + 1}.`;
      const correctCount = q.options.filter(option => option.isCorrect).length;
      if (correctCount === 0) return `У вопроса ${i + 1} нет правильного ответа.`;
      if (q.type === 'SINGLE' && correctCount !== 1) return `У вопроса ${i + 1} должен быть один правильный ответ.`;
      if (q.imageUrl && !q.imageUrl.startsWith('data:image/')) {
        try { new URL(q.imageUrl); } catch { return `У вопроса ${i + 1} указан некорректный URL изображения.`; }
      }
    }
    return '';
  }

  async function save() {
    if (saving) return;
    setError('');
    const validationError = validate();
    if (validationError) return setError(validationError);
    setSaving(true);
    try {
      await api(editing ? `/quizzes/${quizId}` : '/quizzes', {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify({ title: title.trim(), description: description.trim() || undefined, category, defaultTimeSec: time, questions }),
      });
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Не удалось сохранить квиз.');
      setSaving(false);
    }
  }

  if (!paramsReady || !accessChecked || loadingQuiz) {
    return <main className="container section"><div className="card center"><div className="loading"><span className="spinner" />{loadingQuiz ? 'Загружаем квиз…' : 'Проверяем доступ…'}</div></div></main>;
  }

  return (
    <main className="container section">
      <div className="page-header"><span className="eyebrow">Конструктор</span><h1>{editing ? 'Редактирование квиза' : 'Создание квиза'}</h1><p className="muted">Добавьте вопросы, варианты ответов и настройте правила игры.</p></div>

      <section className="card stack">
        <div className="form-grid">
          <label>Название<input className="input" value={title} placeholder="Например: Кино 2000-х" onChange={e => setTitle(e.target.value)} /></label>
          <label>Категория<select value={category} onChange={e => setCategory(e.target.value)}>{categories.map(item => <option key={item}>{item}</option>)}</select></label>
        </div>
        <label>Описание<textarea value={description} placeholder="Коротко расскажите участникам о квизе" onChange={e => setDescription(e.target.value)} /></label>
        <label>Время на вопрос, секунд<input className="input" type="number" min={5} max={300} value={time} onChange={e => setTime(Number(e.target.value))} /></label>
        <span className="field-hint">Допустимое значение: от 5 до 300 секунд.</span>
      </section>

      <div className="stack" style={{ marginTop: 20 }}>
        {questions.map((question, questionIndex) => (
          <section className="card question-editor" key={questionIndex}>
            <div className="question-toolbar">
              <div><span className="eyebrow">Вопрос {questionIndex + 1}</span><h2 style={{ margin: '6px 0 0' }}>Настройка вопроса</h2></div>
              <button className="btn btn-ghost btn-small" type="button" onClick={() => removeQuestion(questionIndex)}>Удалить вопрос</button>
            </div>

            <label>Текст вопроса<textarea value={question.text} placeholder="Введите вопрос" onChange={e => patchQuestion(questionIndex, { text: e.target.value })} /></label>
            <div className="form-grid">
              <label>Ссылка на изображение <span className="field-hint">Необязательно</span><input className="input" value={question.imageUrl.startsWith('data:image/') ? '' : question.imageUrl} placeholder="https://..." onChange={e => patchQuestion(questionIndex, { imageUrl: e.target.value })} /></label>
              <label>Изображение с устройства <span className="field-hint">PNG, JPG, GIF, WEBP — до 8 МБ</span><input className="input" type="file" accept="image/*" onChange={e => uploadImage(questionIndex, e)} /></label>
            </div>
            {question.imageUrl && <div><img className="image-preview" src={question.imageUrl} alt="Предпросмотр вопроса" /><button className="btn btn-ghost btn-small" type="button" style={{ marginTop: 10 }} onClick={() => patchQuestion(questionIndex, { imageUrl: '' })}>Убрать изображение</button></div>}

            <div className="form-grid">
              <label>Тип ответа<select value={question.type} onChange={e => changeType(questionIndex, e.target.value as Question['type'])}><option value="SINGLE">Один правильный ответ</option><option value="MULTIPLE">Несколько правильных</option></select></label>
              <label>Баллы<input className="input" type="number" min={100} max={5000} value={question.points} onChange={e => patchQuestion(questionIndex, { points: Number(e.target.value) })} /><span className="field-hint">От 100 до 5000 баллов.</span></label>
            </div>

            <div className="stack">
              {question.options.map((option, optionIndex) => (
                <div className="option" key={optionIndex}>
                  <input type={question.type === 'SINGLE' ? 'radio' : 'checkbox'} name={`correct-${questionIndex}`} checked={option.isCorrect} onChange={() => selectCorrect(questionIndex, optionIndex)} aria-label="Правильный ответ" />
                  <input className="input" value={option.text} placeholder={`Вариант ${optionIndex + 1}`} onChange={e => patchOption(questionIndex, optionIndex, { text: e.target.value })} />
                  <button className="btn btn-ghost btn-small remove-option" type="button" onClick={() => removeOption(questionIndex, optionIndex)}>Удалить</button>
                </div>
              ))}
            </div>
            <button className="btn btn-secondary btn-small" type="button" style={{ marginTop: 14 }} onClick={() => addOption(questionIndex)}>+ Добавить вариант</button>
          </section>
        ))}
      </div>

      {error && <div className="alert alert-error" style={{ marginTop: 18 }}>{error}</div>}
      <div className="editor-actions row-between">
        <button className="btn btn-secondary" type="button" onClick={() => setQuestions(current => [...current, blankQuestion()])}>+ Добавить вопрос</button>
        <button className="btn" type="button" disabled={saving} onClick={save}>{saving ? 'Сохраняем…' : editing ? 'Сохранить изменения' : 'Сохранить квиз'}</button>
      </div>
    </main>
  );
}
