import { getRequestClinicTenant } from '@/lib/clinicDomainRequest';
import Image from 'next/image';
import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { publicClinics } from '@/lib/clinics';
import { clinicsEnabled, getClinicIdentity } from '@/lib/clinicAuth';
import { clinicLoginDestination } from '@/lib/clinicLogin';
import { clinicSiteAddress } from '@/lib/clinicDomains';
import { PARTNER_ORIGIN } from '@/lib/clinicDomainPolicy';
import { PartnerExperience } from '@/components/partner/PartnerBrand';
import { PartnerLoginForm } from '@/app/partner-login/PartnerLoginForm';
import styles from './clinicLogin.module.css';
export const metadata = { title: 'Team sign in | My Drip Nurse', robots: { index: false, follow: false } };
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
    if (!clinicsEnabled()) notFound();
    const { slug } = await params;
    const tenant = await getRequestClinicTenant();
    if (tenant && tenant.slug !== slug) notFound();
    if (!tenant && process.env.NODE_ENV === 'production' && (await headers()).get('host') !== 'partners.mydripnurse.com') redirect(`${PARTNER_ORIGIN}/clinic-login/${encodeURIComponent(slug)}`);
    const [clinic] = await publicClinics(slug);
    if (!clinic) notFound();
    const identity = await getClinicIdentity();
    if (identity) {
        const access = await clinicLoginDestination(slug, identity.email);
        if (access && (access.canManage || identity.partnerId === access.partnerId)) redirect(access.redirectTo);
    }
    const site = await clinicSiteAddress(clinic);
    return <PartnerExperience branding={clinic}><main className={styles.page}><div className={styles.card}>
        <Link href={site.home} className={styles.back}>← Back to website</Link>
        {clinic.logoUrl ? <Image src={clinic.logoUrl} alt={clinic.name} width={220} height={80} unoptimized className={styles.logo}/> : <h2>{clinic.name}</h2>}
        <span className={styles.eyebrow}>Your clinic. Your team.</span><h1>Welcome back.</h1><p>Sign in with your existing account. We’ll open your clinic or nurse workspace based on your role.</p>
        <PartnerLoginForm clinicSlug={clinic.slug}/><p className={styles.note}>Secure access powered by My Drip Nurse. Only accepted members of this clinic can continue.</p>
    </div></main></PartnerExperience>;
}
