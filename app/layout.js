import "./globals.css";

export const metadata = {
  title: "Voice to Post",
  description: "Transcribe voice notes and generate social posts.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
