"use client";

import Link from "next/link";
import { LEGAL } from "@/lib/legal";
import { SERVICES } from "@/lib/services";
import { footerProduct, founders, site } from "@/lib/site";
import { useContact } from "./Contact";
import Logo from "./Logo";
import s from "./Footer.module.css";

/** linkBase "/" on other pages, so the homepage section links (#plan, …) point back to the homepage. */
export default function Footer({ linkBase = "" }: { linkBase?: string }) {
  const openContact = useContact();
  return (
    <footer className={`theme-dark ${s.footer}`}>
      <div className={`container ${s.top}`}>
        <div className={s.brand}>
          <Logo height={22} />
          <p>Bike and auto rickshaw advertising for local brands, run by verified riders and tracked every day.</p>
          <div id="founders" className={s.founders} aria-labelledby="founders-title">
            <h2 id="founders-title">Founded by</h2>
            <ul>
              {founders.map((f) => (
                <li key={f.name}>
                  <span className={s.initials} aria-hidden="true">
                    {f.name
                      .split(" ")
                      .map((w) => w[0])
                      .join("")}
                  </span>
                  <span>
                    <b>{f.name}</b>
                    <em>{f.role}</em>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <nav className={s.cols} aria-label="Footer">
          <div>
            <h2>Product</h2>
            <ul>
              {footerProduct.map((l) => (
                <li key={l.href}>
                  <a href={`${linkBase}${l.href}`}>{l.label}</a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2>Services</h2>
            <ul>
              {SERVICES.map((sv) => (
                <li key={sv.slug}>
                  <Link href={`/${sv.slug}`}>{sv.h1}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2>Company</h2>
            <ul>
              <li>
                <a href={`${linkBase}#product`}>About</a>
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
        <p>© 2026 Flex Riders · Based in {LEGAL.address}</p>
        <p>Product visuals show demonstration data.</p>
      </div>
    </footer>
  );
}
