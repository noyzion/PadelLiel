import type { Metadata, Viewport } from 'next';
import { Assistant } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { Suspense } from 'react';
import { NavigationProgress } from '@/components/ui/navigation-progress';
import { ToastProvider } from '@/components/ui/toast';
import './globals.css';

const assistant = Assistant({
  subsets: ['hebrew', 'latin'],
  variable: '--font-assistant',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'אימוני פאדל לנשים כוכב יאיר', template: '%s · אימוני פאדל כוכב יאיר' },
  description: 'ניהול הרשמות לאימוני פאדל של הצוות שלנו - קהילת נשים בכוכב יאיר',
  robots: { index: false, follow: false },
  // Installable web app (the manifest is served from app/manifest.ts). iPhone Push needs the Home Screen install.
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'פאדל כוכב יאיר', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#012653',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={assistant.variable}>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[70] focus:rounded-control focus:bg-navy-900 focus:px-4 focus:py-2 focus:text-white"
        >
          דלגי לתוכן
        </a>
        <ToastProvider>
          <Suspense fallback={null}>
            <NavigationProgress />
          </Suspense>
          {children}
        </ToastProvider>
        <Analytics />
      </body>
    </html>
  );
}
