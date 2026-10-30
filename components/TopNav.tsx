"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NotificationBell } from "@/components/NotificationBell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ScanProgress } from "@/components/ScanProgress";
import { signOut } from "@/app/actions";

const LINKS = [
  { href: "/", label: "Dashboard", icon: "◆" },
  { href: "/console", label: "Scan Console", icon: "🛰️" },
  { href: "/notifications", label: "Notifications", icon: "🔔" },
];

export function TopNav({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center gap-3 px-4 sm:px-6">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-fuchsia text-sm shadow-[0_0_20px_var(--color-accent-glow)]">
            🛡️
          </span>
          <span className="hidden text-sm font-bold tracking-tight sm:block">
            Cyber<span className="gradient-text">Recon</span>
          </span>
        </Link>

        {/* Nav */}
        <nav className="ml-2 flex items-center gap-1">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                isActive(l.href)
                  ? "bg-accent/15 text-accent"
                  : "text-muted-dim hover:bg-surface-hover hover:text-foreground"
              }`}
            >
              <span className="text-[11px]">{l.icon}</span>
              <span className="hidden sm:block">{l.label}</span>
            </Link>
          ))}
        </nav>

        {/* Right */}
        <div className="ml-auto flex items-center gap-2">
          <ScanProgress />
          <ThemeToggle />
          <NotificationBell userEmail={userEmail} />
          <div className="hidden items-center gap-2 rounded-lg border border-white/5 bg-surface px-2.5 py-1.5 lg:flex">
            <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 text-emerald-400" />
            <span className="max-w-[160px] truncate text-xs text-muted">{userEmail}</span>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              title="Sign out"
              className="rounded-lg border border-white/5 px-3 py-1.5 text-xs text-muted-dim transition-colors hover:border-white/10 hover:text-foreground"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
