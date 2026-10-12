import type { ReactNode } from 'react';
import { Brand } from '@/components/brand';
import { LogoutButton } from '@/components/logout-button';
import { NavLinks, type NavItem } from '@/components/nav-links';

/**
 * Trainee shell: sticky header (brand, desktop navigation, logout), centered content
 * (max 1100px) and a fixed bottom navigation on phones that respects the iPhone safe area.
 */
export function AppShell({ nav, children }: { nav: NavItem[]; children: ReactNode }) {
  return (
    <div className="min-h-dvh pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-12">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[68.75rem] items-center justify-between gap-4 px-4 sm:px-6">
          <Brand />
          <NavLinks items={nav} layout="inline" className="hidden md:block" />
          <LogoutButton />
        </div>
      </header>
      <main id="main" className="mx-auto max-w-[68.75rem] px-4 py-6 sm:px-6 md:py-8">
        {children}
      </main>
      <NavLinks
        items={nav}
        layout="tabs"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      />
    </div>
  );
}
