import { notFound, redirect } from 'next/navigation';
import ClinicReferralLanding from '@/app/clinics/[slug]/become-a-partner/page';
import ClinicHome, { generateMetadata as homeMetadata } from '@/app/clinics/[slug]/page';
import ClinicServices, { generateMetadata as servicesMetadata } from '@/app/clinics/[slug]/services/page';
import ClinicService, { generateMetadata as serviceMetadata } from '@/app/clinics/[slug]/services/[serviceSlug]/page';
import { requirePublicClinicDomain } from '@/lib/clinicDomainRequest';
import { PARTNER_ORIGIN } from '@/lib/clinicDomainPolicy';

type Props = { params: Promise<{ host: string; path?: string[] }>; searchParams: Promise<{ nurse?: string }> };
async function resolve(props: Props) {
    const { host, path = [] } = await props.params;
    const clinic = await requirePublicClinicDomain(host);
    const params = Promise.resolve({ slug: clinic.slug, serviceSlug: path[1] || '' });
    if (path.length === 1 && path[0] === 'become-a-partner') return { kind: 'referral', params, clinic };
    if (path.length === 0) return { kind: 'home', params, clinic };
    if (path.length === 1 && path[0] === 'login') return { kind: 'login', params, clinic };
    if (path[0] === 'services' && path.length <= 2 && (!path[1] || /^[a-z0-9-]+$/.test(path[1]))) return { kind: path.length === 1 ? 'services' : 'service', params, clinic };
    notFound();
}
export async function generateMetadata(props: Props) {
    const route = await resolve(props);
    if (route.kind === 'referral') return { title: 'Become a Partner | My Drip Nurse', robots: { index: false, follow: true } };
    if (route.kind === 'home') return homeMetadata(route);
    if (route.kind === 'services') return servicesMetadata(route);
    if (route.kind === 'service') return serviceMetadata({ params: route.params, searchParams: props.searchParams });
    return { robots: { index: false, follow: false } };
}
export default async function Page(props: Props) {
    const route = await resolve(props);
    if (route.kind === 'referral') return <ClinicReferralLanding params={route.params}/>;
    if (route.kind === 'login') redirect(`${PARTNER_ORIGIN}/clinic-login/${route.clinic.slug}`);
    if (route.kind === 'home') return <ClinicHome params={route.params}/>;
    if (route.kind === 'services') return <ClinicServices params={route.params}/>;
    return <ClinicService params={route.params} searchParams={props.searchParams}/>;
}
