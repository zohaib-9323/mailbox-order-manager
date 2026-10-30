import Link from "next/link";
import type { SessionUser } from "@/domain/user";
import { LogoutButton } from "./logout-button";

export function AppHeader({ user }: { user: SessionUser }) {
  const links =
    user.role === "admin"
      ? [{ href: "/admin/orders", label: "All orders" }]
      : [
          { href: "/orders", label: "My orders" },
          { href: "/orders/new", label: "New order" },
        ];

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-2 px-5 py-3">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-[15px] font-semibold tracking-tight">Mailbox Orders</span>
          <span className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">internal</span>
        </Link>
        <nav className="flex gap-5 text-sm">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="text-ink-muted hover:text-ink">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <span className="text-sm text-ink-muted">
            {user.name}
            <span className="ml-2 rounded border border-line px-1.5 py-px font-mono text-[11px] uppercase text-ink-faint">
              {user.role}
            </span>
          </span>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
