import type { PartnerReviewSummary, PublicPartnerReview } from "@/lib/partnerReviews";

import styles from "./PartnerVerifiedReviews.module.css";

type Props = {
  summary: PartnerReviewSummary;
  reviews: PublicPartnerReview[];
};

function stars(rating: number) {
  return "★".repeat(Math.round(rating)) + "☆".repeat(Math.max(0, 5 - Math.round(rating)));
}

export function PartnerVerifiedReviews({ summary, reviews }: Props) {
  if (!summary.reviewCount) return null;

  return (
    <section className={styles.section} aria-labelledby="verified-patient-reviews">
      <div className={styles.shell}>
        <div className={styles.heading}>
          <div>
            <span>Verified patient experiences</span>
            <h2 id="verified-patient-reviews">Care, remembered.</h2>
            <p>Feedback is collected only after a completed My Drip Nurse visit.</p>
          </div>
          <div className={styles.score} aria-label={`${summary.averageRating} out of 5 from ${summary.reviewCount} reviews`}>
            <strong>{summary.averageRating.toFixed(1)}</strong>
            <span aria-hidden="true">{stars(summary.averageRating)}</span>
            <small>{summary.reviewCount} verified {summary.reviewCount === 1 ? "review" : "reviews"}</small>
          </div>
        </div>

        {reviews.length ? (
          <div className={styles.grid}>
            {reviews.map((review) => (
              <article key={review.id} className={styles.review}>
                <span className={styles.stars} aria-label={`${review.rating} out of 5 stars`}>{stars(review.rating)}</span>
                <blockquote>“{review.comment}”</blockquote>
                <footer>
                  <strong>{review.reviewerDisplayName}</strong>
                  <span>Verified patient</span>
                </footer>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
