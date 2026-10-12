import type { ReactNode } from 'react';
import { Brand, VenueLogo } from '@/components/brand';
import { LogoutButton } from '@/components/logout-button';
import { NavLinks, type NavItem } from '@/components/nav-links';

/**
 * Coach shell: same identity as the trainee app with less decoration and more room for data.
 * Sidebar on desktop, compact header + bottom tabs on phones.
 */
export function AdminShell({ nav, name, children }: { nav: NavItem[]; name: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[16.5rem_1fr]">
      <aside className="hidden border-e border-line bg-surface md:sticky md:top-0 md:flex md:h-dvh md:flex-col md:justify-between md:p-5">
        <div className="flex flex-col gap-8">
          <Brand href="/admin" />
          <NavLinks items={nav} layout="side" />
        </div>
        <div className="flex flex-col gap-3 border-t border-line pt-4">
          <VenueLogo size="md" className="mx-2" />
          <p className="px-2 text-small text-muted">
            מחוברת: <span className="font-semibold text-navy-900">{name}</span>
          </p>
          <LogoutButton variant="secondary" />
        </div>
      </aside>

      <div className="min-w-0 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-12">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line bg-surface/95 px-4 backdrop-blur md:hidden">
          <Brand href="/admin" />
          <LogoutButton />
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
      </div>

      <NavLinks
        items={nav}
        layout="tabs"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      />
    </div>
  );
}
