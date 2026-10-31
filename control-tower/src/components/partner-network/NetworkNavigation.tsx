import Image from 'next/image';
import Link from 'next/link';
import styles from './network.module.css';

export function NetworkHeader({ directory = false }: { directory?: boolean }) {
  return <header className={styles.header}>
    <a className={styles.skip} href="#main-content">Skip to content</a>
    <div className={styles.headerInner}>
      <Link prefetch={false} href="/" aria-label="My Drip Nurse Partners home" className={styles.logo}><Image src="/mdn-logo.png" alt="My Drip Nurse" width={240} height={51} priority/><span>PARTNER NETWORK</span></Link>
      <nav aria-label="Partner network" className={styles.desktopNav}><Link prefetch={false} href="/#join">Join the network</Link><Link prefetch={false} href="/#how-it-works">How it works</Link><Link prefetch={false} href="/directory" aria-current={directory ? 'page' : undefined}>Directory</Link></nav>
      <Link prefetch={false} className={styles.signIn} href="/login">Log in <span aria-hidden="true">↗</span></Link>
      <details className={styles.mobileMenu}><summary>Menu <span aria-hidden="true">☰</span></summary><nav aria-label="Mobile partner network"><Link prefetch={false} href="/#join">Join the network</Link><Link prefetch={false} href="/#how-it-works">How it works</Link><Link prefetch={false} href="/directory">Directory</Link></nav></details>
    </div>
  </header>;
}
export function DirectoryNavigation({ active, clinicsAvailable = true }: { active: 'nurses' | 'clinics'; clinicsAvailable?: boolean }) {
  return <div className={styles.directoryBar}><span>THE MY DRIP NURSE DIRECTORY</span><nav aria-label="Directory categories"><Link prefetch={false} href="/directory" aria-current={active === 'nurses' ? 'page' : undefined}>Nurses</Link>{clinicsAvailable ? <Link prefetch={false} href="/directory/clinics" aria-current={active === 'clinics' ? 'page' : undefined}>Clinics</Link> : null}</nav></div>;
}
export function NetworkFooter() {
  return <footer className={styles.footer}><div><Image src="/mdn-logo.png" alt="My Drip Nurse" width={240} height={51}/><p>More connected professionals.<br/>Care closer to home.</p></div><nav aria-label="Footer"><Link prefetch={false} href="/directory">Directory</Link><Link prefetch={false} href="/login">Partner login</Link><a href="https://mydripnurse.com">Looking for care? ↗</a><a href="mailto:info@mydripnurse.com">Contact My Drip Nurse</a></nav><small>© {new Date().getFullYear()} My Drip Nurse</small></footer>;
}
