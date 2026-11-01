import styles from './clinicWebsite.module.css';

// Existing public My Drip Nurse testimonials, captured from its Bonjoro page.
// These are network reviews, never clinic-specific ratings or structured data.
const reviews = [
  { name: 'Joanna Walling', date: 'March 29, 2026', isoDate: '2026-03-29', quote: 'This was so easy to book and was so fast.' },
  { name: 'Josh Burton', date: 'September 27, 2025', isoDate: '2025-09-27', quote: 'AWESOME service! I had a great nurse that made the process super positive! Definitely recommend using this company! I will again!' },
  { name: 'Kailey Boyer', date: 'June 1, 2025', isoDate: '2025-06-01', quote: 'From the very beginning, the service was professional, warm, and completely personalized. I felt heard and cared for every step of the way. The nurse was incredibly kind, explained each part of the process, and made me feel totally comfortable.' },
];

export function ClinicNetworkReviews() {
  return <section className={styles.section} aria-labelledby="clinic-reviews-title">
    <div className={styles.sectionHeading}>
      <div><span className={styles.eyebrow}>Across the My Drip Nurse network</span><h2 id="clinic-reviews-title">Real stories. Thoughtful care.</h2></div>
      <p>Selected experiences shared with My Drip Nurse. These testimonials describe our network, not this individual clinic.</p>
    </div>
    <div className={styles.reviewGrid}>{reviews.map(review => <figure key={review.name} className={styles.reviewCard}>
      <blockquote><p>“{review.quote}”</p></blockquote>
      <figcaption><strong>{review.name}</strong><time dateTime={review.isoDate}>{review.date}</time></figcaption>
    </figure>)}</div>
    <a className={styles.reviewLink} href="https://www.bonjoro.com/pe/38b7a548-411d-46d8-a89c-6f207a22a7b8" target="_blank" rel="noopener noreferrer">Read all My Drip Nurse reviews <span aria-hidden="true">↗</span></a>
  </section>;
}
