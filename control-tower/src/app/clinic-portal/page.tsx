import { renderClinicPortal } from './renderClinicPortal';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Clinic workspace | My Drip Nurse', robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ clinic?: string; appointment?: string }> }) { return renderClinicPortal(searchParams); }
