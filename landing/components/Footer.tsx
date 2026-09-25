"use client";

import Link from "next/link";
import { footerProduct, site } from "@/lib/site";
import { IconArrowRight, IconLock } from "./Icons";
import { useContact } from "./Contact";
import Logo from "./Logo";
import s from "./Footer.module.css";

export default function Footer() {
  const openContact = useContact();
  return (
    <footer className={`theme-dark ${s.footer}`}>
      <div className={`container ${s.top}`}>
        <div className={s.brand}>
          <Logo height={22} />
          <p>Rider management and payment tracking, in one connected platform.</p>
        </div>

        <nav className={s.cols} aria-label="Footer">
          <div>
            <h2>Product</h2>
            <ul>
              {footerProduct.map((l) => (
                <li key={l.href}>
                  <a href={l.href}>{l.label}</a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2>Company</h2>
            <ul>
              <li>
                <a href="#product">About</a>
              </li>
              <li>
                <button onClick={() => openContact("talk")}>Contact</button>
              </li>
              <li>
                <button onClick={() => openContact("support")}>Support</button>
              </li>
              <li>
                <Link href="/privacy">Privacy</Link>
              </li>
              <li>
                <Link href="/terms">Terms</Link>
              </li>
              <li>
                <Link href="/delete-account">Delete account</Link>
              </li>
            </ul>
          </div>
        </nav>
      </div>
      <div className={`container ${s.bottom}`}>
        <p>© 2026 Flex Riders. All rights reserved.</p>
        <p>Product visuals show demonstration data.</p>
        <a className={`btn btn-ghost btn-sm ${s.admin}`} href={site.adminUrl}>
          <IconLock size={15} aria-hidden="true" />
          Admin Login
          <IconArrowRight size={14} className="btn-arrow" aria-hidden="true" />
        </a>
      </div>
    </footer>
  );
}
