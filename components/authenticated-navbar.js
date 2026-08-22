"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigationItems = [
  ["Home", "/"],
  ["New problem", "/upload"],
  ["Pricing", "/pricing"],
  ["Profile", "/profile"],
];

export default function AuthenticatedNavbar() {
  const pathname = usePathname();

  return (
    <header className="authenticated-navbar">
      <Link className="wordmark" href="/" aria-label="CLIMB/COACH home">
        CLIMB<span>/</span>COACH
      </Link>
      <nav className="authenticated-navbar-links" aria-label="Account navigation">
        {navigationItems.map(([label, href]) => {
          const isActive = href === "/" ? pathname === "/" : pathname?.startsWith(href);
          return (
            <Link key={href} href={href} aria-current={isActive ? "page" : undefined}>
              {label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
