import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'AI Radio 2525 - Broadcasting from the Future',
  description: 'Experience radio from the year 2525. AI-generated content, 24/7 live stream.',
  keywords: 'ai radio, future radio, ai music, 2525, streaming radio',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
