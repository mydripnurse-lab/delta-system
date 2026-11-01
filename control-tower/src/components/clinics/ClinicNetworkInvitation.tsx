import Image from 'next/image';
import Link from 'next/link';
import styles from './clinicNetworkInvitation.module.css';

export function ClinicNetworkInvitation({ clinicName, href }: { clinicName: string; href: string }) {
    return <section className={styles.invitation} aria-labelledby="clinic-network-title">
        <div className={styles.photo}>
            <Image src="/clinic-assets/clinic-network-team.webp" alt="Nurses and a clinic owner collaborating on mobile care planning" width={1200} height={800} sizes="(max-width: 760px) 100vw, 600px" unoptimized />
        </div>
        <div className={styles.content}>
            <span className={styles.eyebrow}>Grow with our network</span>
            <h2 id="clinic-network-title">Your expertise.<br />More connections.</h2>
            <p>Bring your care to more people. Join My Drip Nurse through {clinicName} and build your presence in our network across the USA &amp; Puerto Rico.</p>
            <div className={styles.audience}><span>Independent nurses</span><span>Clinics &amp; care teams</span></div>
            <Link className={styles.action} href={href} prefetch={false}>Become a Partner <span aria-hidden="true">→</span></Link>
        </div>
    </section>;
}
