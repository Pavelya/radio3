import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Radio 2525 - Admin Portal',
  description: 'Admin portal for AI Radio 2525',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
