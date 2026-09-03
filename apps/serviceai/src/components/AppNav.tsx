"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/command", label: "Command Center" },
  { href: "/voice", label: "Voice" },
  { href: "/messaging", label: "Messaging" },
  { href: "/journeys", label: "Journeys" },
  { href: "/knowledge", label: "Knowledge" },
  { href: "/bridge", label: "Data Bridge" },
];

export function AppNav() {
  const pathname = usePathname();
  return (
    <header className="topnav">
      <div className="brand">
        <strong>Service AI</strong>
        <span>Platform · Summit Comfort HVAC</span>
      </div>
      <nav className="nav-links">
        {LINKS.map((l) => {
          const active =
            pathname === l.href ||
            (l.href !== "/command" && pathname.startsWith(l.href));
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
