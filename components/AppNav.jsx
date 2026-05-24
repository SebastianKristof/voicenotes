"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AppNav() {
  const pathname = usePathname();

  const isActive = (href) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname?.startsWith(`${href}/`);
  };

  return (
    <nav className="app-nav">
      <Link className={`nav-link ${isActive("/") ? "active" : ""}`} href="/">
        Главная
      </Link>
      <Link className={`nav-link ${isActive("/settings") ? "active" : ""}`} href="/settings">
        Настройки
      </Link>
    </nav>
  );
}
