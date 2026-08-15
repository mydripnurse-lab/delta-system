import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./partnerBrand.module.css";

const MDN_LOGO = "/mdn-logo.png";

type PartnerExperienceProps = {
  children: ReactNode;
  className?: string;
};

type PartnerNavItem = {
  href: string;
  label: string;
};

type PartnerHeaderProps = {
  navItems?: PartnerNavItem[];
  action?: PartnerNavItem;
  loginItems?: Array<PartnerNavItem & { note?: string }>;
};

export function PartnerExperience({ children, className = "" }: PartnerExperienceProps) {
  return <div className={`${styles.experience} ${className}`.trim()}>{children}</div>;
}

export function PartnerHeader({ navItems = [], action, loginItems = [] }: PartnerHeaderProps) {
  const partnerHomeHref = navItems.find((item) => item.label === "Home")?.href || "/";

  return (
    <header className={styles.header}>
      <div className={styles.shell}>
        <Link href={partnerHomeHref} className={styles.logoLink} aria-label="Home">
          <Image
            src={MDN_LOGO}
            alt="My Drip Nurse"
            title="My Drip Nurse mobile IV therapy"
            width={240}
            height={51}
            className={styles.logo}
            priority
          />
        </Link>

        {navItems.length ? (
          <nav className={styles.nav} aria-label="Site navigation">
            {navItems.map((item) => (
              <Link href={item.href} key={`${item.href}-${item.label}`}>
                {item.label}
              </Link>
            ))}
          </nav>
        ) : null}

        <div className={styles.headerActions}>
          {loginItems.length ? (
            <details className={styles.loginMenu}>
              <summary>Log in <span aria-hidden="true">⌄</span></summary>
              <div className={styles.loginMenuPanel}>
                <span className={styles.loginMenuEyebrow}>Choose your portal</span>
                {loginItems.map((item) => (
                  <Link href={item.href} key={`${item.href}-${item.label}`}>
                    <span>{item.label}</span>
                    {item.note ? <small>{item.note}</small> : null}
                    <b aria-hidden="true">→</b>
                  </Link>
                ))}
              </div>
            </details>
          ) : null}
          {action ? (
            <Link href={action.href} className={styles.headerAction}>
              {action.label}
              <span aria-hidden="true">→</span>
            </Link>
          ) : null}
        </div>

        {!action && !loginItems.length ? (
          <span className={styles.secureLabel}>
            <span aria-hidden="true">●</span>
            Secure onboarding
          </span>
        ) : null}
      </div>
    </header>
  );
}

export function PartnerFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.shell}>
        <div>
          <Image
            src={MDN_LOGO}
            alt="My Drip Nurse"
            title="My Drip Nurse mobile IV therapy"
            width={240}
            height={51}
            className={styles.footerLogo}
          />
          <p>Personalized care, powered by trusted local professionals.</p>
        </div>
        <div className={styles.footerContact}>
          <span>Care support</span>
          <a href="mailto:info@mydripnurse.com">info@mydripnurse.com</a>
        </div>
      </div>
    </footer>
  );
}
