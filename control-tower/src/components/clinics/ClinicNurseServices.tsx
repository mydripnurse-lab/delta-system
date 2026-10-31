import Link from 'next/link';
import { publicClinics } from '@/lib/clinics';
import { publicClinicServices, publicClinicTeam } from '@/lib/clinicBooking';
import type { PublicPartnerProfile } from '@/lib/partnerProfiles';
import { clinicCovers } from '@/lib/clinicPolicy';
import { ClinicPublicServices } from './ClinicPublicServices';
import styles from './clinic.module.css';

export async function ClinicNurseServices({ profile }: { profile: PublicPartnerProfile }) {
    const sections = await Promise.all((profile.clinics || []).map(async affiliation => {
        const [clinics, services, team] = await Promise.all([
            publicClinics(affiliation.slug), publicClinicServices(affiliation.id), publicClinicTeam(affiliation.id),
        ]);
        const clinic = clinics[0], nurse = team.find(member => member.id === profile.id);
        if (!clinic || !nurse) return null;
        const coverage = [...new Map([
            ...nurse.coverage.filter(r => clinicCovers(clinic.coverage, r)),
            ...clinic.coverage.filter(r => clinicCovers(nurse.coverage, r)),
        ].map(r => [r.id, r])).values()];
        return <section key={clinic.id} className={styles.card}>
            <h2>{clinic.name}</h2><Link href={`/clinics/${clinic.slug}`}>About this clinic →</Link>
            <ClinicPublicServices clinicId={clinic.id} partnerId={profile.id} coverage={coverage} services={services}/>
        </section>;
    }));
    return <>{sections}{!sections.some(Boolean) ? <p className={styles.empty}>No clinic is accepting bookings through this profile right now.</p> : null}</>;
}
