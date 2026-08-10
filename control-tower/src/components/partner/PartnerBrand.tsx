import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./partnerBrand.module.css";

const MDN_LOGO =
  "https://assets.cdn.filesafe.space/K8GcSVZWinRaQTMF6Sb8/media/675a44c0da8c3978ab418ac1.png";

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
};

export function PartnerExperience({ children, className = "" }: PartnerExperienceProps) {
  return <div className={`${styles.experience} ${className}`.trim()}>{children}</div>;
}

export function PartnerHeader({ navItems = [], action }: PartnerHeaderProps) {
  const partnerHomeHref = navItems.find((item) => item.label === "Home")?.href || "/";

  return (
    <header className={styles.header}>
      <div className={styles.shell}>
        <Link href={partnerHomeHref} className={styles.logoLink} aria-label="Home">
          <Image
            src={MDN_LOGO}
            alt="My Drip Nurse"
            title="My Drip Nurse mobile IV therapy"
            width={170}
            height={76}
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

        {action ? (
          <Link href={action.href} className={styles.headerAction}>
            {action.label}
            <span aria-hidden="true">→</span>
          </Link>
        ) : (
          <span className={styles.secureLabel}>
            <span aria-hidden="true">●</span>
            Secure onboarding
          </span>
        )}
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
            width={150}
            height={67}
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
