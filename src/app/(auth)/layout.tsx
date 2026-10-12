import { Brand, CourtPattern, PadelRackets, VenueLogo } from '@/components/brand';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="relative overflow-hidden bg-ocean-50 pb-14 pt-8">
        <CourtPattern className="absolute -top-4 end-[-2rem] w-56 text-ocean-100 sm:w-72" />
        <PadelRackets className="absolute end-3 top-5 w-24 sm:end-[max(2rem,calc(50%-26rem))] sm:top-6 sm:w-40" />
        <CourtPattern className="absolute -bottom-10 start-[-3rem] hidden w-48 text-pink-100 sm:block" />
        <div className="relative mx-auto flex max-w-md flex-col items-center gap-5 px-5 text-center">
          <VenueLogo size="md" />
          <Brand href="/login" size="lg" stacked />
          <div className="flex flex-col gap-1">
            <p className="text-hero font-bold text-navy-900">נפגשות על המגרש 💗</p>
            <p className="text-body text-muted">האימונים, החברות והבוקר שלך, במקום אחד</p>
          </div>
        </div>
      </header>
      <main id="main" className="relative mx-auto -mt-8 w-full max-w-md px-5 pb-12">
        <div className="rounded-card border border-line bg-surface p-6 shadow-lift">{children}</div>
      </main>
    </div>
  );
}
