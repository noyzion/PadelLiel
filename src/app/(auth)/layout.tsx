import { Brand } from '@/components/brand';

/**
 * Sign-in, registration and waiting screens. On a phone the form sits directly on the page (nothing to scroll past,
 * no box inside a box); from `sm` up it lives in a quiet card.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center bg-canvas px-5 pb-12 pt-10 sm:pt-16">
      <header className="mb-8 sm:mb-10">
        <Brand href="/login" stacked />
      </header>
      <main id="main" className="w-full max-w-sm sm:max-w-md">
        <div className="sm:rounded-card sm:border sm:border-line sm:bg-surface sm:p-8 sm:shadow-lift">{children}</div>
      </main>
    </div>
  );
}
