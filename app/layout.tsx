import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'DutyTime — Make every hour count', description: 'Your working day, beautifully in view.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
