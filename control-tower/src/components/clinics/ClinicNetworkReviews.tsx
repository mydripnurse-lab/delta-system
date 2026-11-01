import { PartnerTestimonials } from '@/components/partner/PartnerTestimonials';
import styles from './clinicWebsite.module.css';

// Reuse the live My Drip Nurse embed; never attribute network ratings to a clinic.
export function ClinicNetworkReviews() {
  return <div className={styles.networkReviews}><PartnerTestimonials/></div>;
}
