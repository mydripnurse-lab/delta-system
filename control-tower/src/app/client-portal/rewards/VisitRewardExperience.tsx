import Link from "next/link";
import type { CSSProperties } from "react";

import type { ClientVisitRewardSummary } from "@/lib/clientRewards";

import styles from "../clientPortal.module.css";

type VisitRewardExperienceProps = {
  summary: ClientVisitRewardSummary;
  variant: "wellness" | "nad";
};

export default function VisitRewardExperience({ summary, variant }: VisitRewardExperienceProps) {
  const isNad = variant === "nad";
  const rewardTitle = summary.availableRewards
    ? `${summary.availableRewards} free ${isNad ? "NAD+ " : ""}visit reward${summary.availableRewards === 1 ? " is" : "s are"} ready.`
    : `${summary.remainingVisits} completed ${isNad ? "NAD+ " : ""}visit${summary.remainingVisits === 1 ? "" : "s"} to your next reward.`;

  return (
    <div className={`${styles.pageShell} ${styles.visitRewardsPage}`}>
      <Link href="/rewards" className={styles.rewardBackLink}>← All rewards</Link>
      <section className={styles.visitRewardHero}>
        <div className={styles.visitRewardCopy}>
          <span className={styles.eyebrow}>{isNad ? "NAD+ care rewards" : "Everyday wellness visits"}</span>
          <h1>{isNad ? "Your NAD+ rhythm earns more care." : "Your everyday care builds toward more care."}</h1>
          <p>
            {isNad
              ? `Complete ${summary.goal} NAD+ or NAD+ Boost appointments to unlock one free eligible NAD-family visit. The reward covers the appointment in full and your next cycle continues after you use it.`
              : `Complete ${summary.goal} eligible appointments other than NAD+ or NAD+ Boost to unlock one free non-NAD visit. The reward covers the appointment in full and your next cycle continues after you use it.`}
          </p>
          <div className={styles.visitRewardLifetime}>
            <div><small>Lifetime completed</small><strong>{summary.completedVisits}</strong></div>
            <div><small>Rewards earned</small><strong>{summary.earnedRewards}</strong></div>
            <div><small>Rewards used</small><strong>{summary.redeemedRewards}</strong></div>
          </div>
        </div>
        <div className={styles.visitRewardProgressCard}>
          <div className={styles.visitRewardProgressTop}>
            <div><small>Current cycle</small><strong>{summary.cycleCompletedVisits}<span> / {summary.goal}</span></strong></div>
            <div className={styles.rewardCardRing} style={{ "--reward-progress": `${summary.percent * 3.6}deg` } as CSSProperties}><span>{summary.percent}%</span></div>
          </div>
          <div className={styles.visitRewardTrack} aria-label={`${summary.cycleCompletedVisits} of ${summary.goal} visits complete`}>
            {Array.from({ length: summary.goal }, (_, index) => (
              <span key={index} className={index < summary.cycleCompletedVisits ? styles.visitRewardTrackComplete : ""}>
                <i aria-hidden="true">{index < summary.cycleCompletedVisits ? "✓" : index + 1}</i>
                <small>{index + 1 === summary.goal ? "Reward" : `Visit ${index + 1}`}</small>
              </span>
            ))}
          </div>
          <div className={summary.availableRewards ? styles.visitRewardReadyState : styles.visitRewardProgressState}>
            <span aria-hidden="true">✦</span><div><small>{summary.availableRewards ? "Unlocked" : "Your progress"}</small><strong>{rewardTitle}</strong></div>
          </div>
        </div>
      </section>

      <section className={styles.visitRewardDetails}>
        <article><span>01</span><div><small>Eligible care only</small><h2>Complete your appointment.</h2><p>Only completed {isNad ? "NAD+ and NAD+ Boost" : "non-NAD"} visits count. Cancelled or unfinished appointments do not change your progress.</p></div></article>
        <article><span>02</span><div><small>Automatic progress</small><h2>We track every milestone.</h2><p>Your progress updates automatically after the care professional completes the visit.</p></div></article>
        <article><span>03</span><div><small>Ready when you are</small><h2>Use your free visit.</h2><p>The reward covers your next eligible {isNad ? "NAD-family" : "non-NAD"} appointment. My Drip Nurse funds your care professional’s normal payment after completion.</p></div></article>
      </section>

      <section className={styles.visitRewardCta}>
        <div><span className={styles.eyebrow}>{summary.availableRewards ? "Reward ready" : `Next milestone · ${summary.nextMilestone} completed visits`}</span><h2>{summary.availableRewards ? `Choose your next ${isNad ? "NAD+" : "wellness"} moment.` : "Keep your wellness rhythm going."}</h2></div>
        <Link href="/book">{summary.availableRewards ? "Book my free visit" : "Book my next visit"}<span>→</span></Link>
      </section>
    </div>
  );
}
