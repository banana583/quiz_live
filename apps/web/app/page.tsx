import Link from 'next/link';

const features = [
  ['Комнаты по коду', 'Участники подключаются с телефона или компьютера за несколько секунд.'],
  ['Вопросы в реальном времени', 'Ведущий управляет показом вопросов, а ответы принимаются только во время раунда.'],
  ['Автоматический лидерборд', 'Система считает баллы и показывает итоговые места после завершения игры.'],
];

export default function Home() {
  return (
    <main>
      <section className="hero container">
        <div className="hero-copy">
          <h1>Проведи квиз, который захочется повторить.</h1>
          <p className="lead">
            Создавай вопросы, приглашай участников по коду комнаты и следи за результатами без перезагрузки страницы.
          </p>
          <div className="row hero-actions">
            <Link className="btn btn-large" href="/create">Создать квиз</Link>
            <Link className="btn btn-secondary btn-large" href="/join">Войти по коду</Link>
          </div>
        </div>

        <div className="hero-preview card">
          <div className="preview-top">
            <span className="status-dot" /> Комната открыта
          </div>
          <p className="muted">Код комнаты</p>
          <div className="code">A7K2QX</div>
          <div className="mini-card">
            <span>Участников</span>
            <strong>12</strong>
          </div>
          <div className="mini-card">
            <span>Вопросов</span>
            <strong>10</strong>
          </div>
        </div>
      </section>

      <section className="container section">
        <div className="section-heading">
          <span className="eyebrow">Как это работает</span>
          <h2>Три шага до готовой игры</h2>
        </div>
        <div className="grid feature-grid">
          {features.map(([title, text], index) => (
            <article className="card feature-card" key={title}>
              <span className="feature-number">0{index + 1}</span>
              <h3>{title}</h3>
              <p className="muted">{text}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
