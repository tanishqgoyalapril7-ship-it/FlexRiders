"use client";

import Link from "next/link";
import { footerProduct, site } from "@/lib/site";
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
          <p>Local brand campaigns, run by verified riders and tracked every day.</p>
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
                <a href={site.brandUrl}>Brand Login</a>
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
      </div>
    </footer>
  );
}
