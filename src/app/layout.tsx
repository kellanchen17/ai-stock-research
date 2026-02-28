import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Stock Research',
  description: 'DCF valuation + AI carat ratings + AI stock screening',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
