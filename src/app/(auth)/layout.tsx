import { Brand } from '@/components/brand';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center bg-canvas px-5 pb-14 pt-12 sm:pt-16">
      <header className="mb-9 sm:mb-10">
        <Brand href="/login" stacked />
      </header>
      <main id="main" className="w-full max-w-md">
        <div className="rounded-card border border-line bg-surface p-6 shadow-lift sm:p-8">{children}</div>
      </main>
    </div>
  );
}
