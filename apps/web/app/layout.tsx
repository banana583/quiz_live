import './globals.css';
import NavBar from '../components/NavBar';

export const metadata = {
  title: 'Quiz Live',
  description: 'Платформа для квизов в реальном времени',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <NavBar />
        {children}
      </body>
    </html>
  );
}
