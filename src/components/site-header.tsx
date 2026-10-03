import Link from "next/link";

function Logo() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
      <rect x="1" y="1" width="22" height="22" rx="5" className="fill-navy-900 stroke-navy-700" />
      <circle cx="12" cy="6.75" r="2" className="fill-ink-100" />
      <rect x="5" y="11" width="14" height="2" rx="1" className="fill-accent-500" />
      <circle cx="12" cy="17.25" r="2" className="fill-accent-300" />
    </svg>
  );
}

export function SiteHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="border-b border-navy-800 bg-navy-950">
      <div className="container-page flex h-12 items-center justify-between gap-4 sm:h-14">
        <Link href="/" className="flex items-center gap-2.5 text-white">
          <Logo />
          <span className="text-[15px] font-semibold tracking-tight">Коридор</span>
        </Link>
        {children}
      </div>
    </header>
  );
}
