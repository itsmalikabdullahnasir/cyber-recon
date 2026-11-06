"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ScanProgress } from "@/components/ScanProgress";
import { ProfileMenu } from "@/components/ProfileMenu";
import dynamic from "next/dynamic";

const DeferredNotificationBell = dynamic(
  () => import("@/components/NotificationBell").then((module) => module.NotificationBell),
  { loading: () => null },
);
const DeferredWorkerStatus = dynamic(
  () => import("@/components/WorkerStatus").then((module) => module.WorkerStatus),
  { loading: () => null },
);

const LINKS = [
  { href: "/", label: "Dashboard", icon: "◆" },
  { href: "/console", label: "Scan Console", icon: "🛰️" },
  { href: "/pipeline", label: "Pipeline", icon: "🧩" },
  { href: "/notifications", label: "Notifications", icon: "🔔" },
  { href: "/audit", label: "Audit Log", icon: "🧾" },
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
          <DeferredWorkerStatus />
          <DeferredNotificationBell userEmail={userEmail} />
          <ProfileMenu userEmail={userEmail} />
        </div>
      </div>
    </header>
  );
}
