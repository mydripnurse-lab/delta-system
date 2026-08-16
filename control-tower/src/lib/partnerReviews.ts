import { ensureClientPortalSchema } from "@/lib/clientPortalAuth";
import { getDbPool } from "@/lib/db";

export type PartnerReviewSummary = {
  averageRating: number;
  reviewCount: number;
};

export type PublicPartnerReview = {
  id: string;
  rating: number;
  comment: string;
  reviewerDisplayName: string;
  createdAt: string;
};

export async function getPartnerReviewSummaries(profileIds: string[]) {
  const summaries = new Map<string, PartnerReviewSummary>();
  if (!profileIds.length || !process.env.DATABASE_URL) return summaries;
  await ensureClientPortalSchema();
  const result = await getDbPool().query<{ partner_profile_id: string; average_rating: string; review_count: string }>(
    `select partner_profile_id::text,
            round(avg(rating)::numeric, 1)::text as average_rating,
            count(*)::text as review_count
       from app.appointment_reviews
      where is_published = true and partner_profile_id::text = any($1::text[])
      group by partner_profile_id`,
    [profileIds],
  );
  result.rows.forEach((row) => summaries.set(row.partner_profile_id, {
    averageRating: Number(row.average_rating), reviewCount: Number(row.review_count),
  }));
  return summaries;
}

export async function getPublicPartnerReviews(profileId: string) {
  const empty = { summary: { averageRating: 0, reviewCount: 0 }, reviews: [] as PublicPartnerReview[] };
  if (!profileId || !process.env.DATABASE_URL) return empty;
  await ensureClientPortalSchema();
  const pool = getDbPool();
  const [summary, reviews] = await Promise.all([
    pool.query<{ average_rating: string | null; review_count: string }>(
      `select round(avg(rating)::numeric, 1)::text as average_rating, count(*)::text as review_count
         from app.appointment_reviews where partner_profile_id = $1::uuid and is_published = true`, [profileId]),
    pool.query<{ id: string; rating: number; comment: string; reviewer_display_name: string; created_at: string }>(
      `select id::text, rating, comment, reviewer_display_name, created_at::text
         from app.appointment_reviews
        where partner_profile_id = $1::uuid and is_published = true and comment <> ''
        order by created_at desc limit 6`, [profileId]),
  ]);
  return {
    summary: { averageRating: Number(summary.rows[0]?.average_rating || 0), reviewCount: Number(summary.rows[0]?.review_count || 0) },
    reviews: reviews.rows.map((row) => ({ id: row.id, rating: row.rating, comment: row.comment, reviewerDisplayName: row.reviewer_display_name, createdAt: row.created_at })),
  };
}
