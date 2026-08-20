import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";

import type { ClientVisitRewardSummary } from "@/lib/clientRewards";
import type { MyDripNurseServiceDefinition } from "@/lib/myDripNurseServices";

import styles from "../clientPortal.module.css";

type VisitRewardExperienceProps = {
  summary: ClientVisitRewardSummary;
  variant: "wellness" | "nad";
  services: MyDripNurseServiceDefinition[];
};

export default function VisitRewardExperience({ summary, variant, services }: VisitRewardExperienceProps) {
  const isNad = variant === "nad";
  const eligibleServices = services.filter((service) => (
    isNad ? ["nad-plus", "nad-boost"].includes(service.id) : !["nad-plus", "nad-boost"].includes(service.id)
  ));
  const serviceCatalog = new Map(services.map((service) => [service.id, service]));
  const completedByService = summary.cycleVisits.reduce<Map<string, number>>((counts, visit) => {
    const slug = visit.serviceSlug.trim().toLowerCase();
    counts.set(slug, (counts.get(slug) || 0) + 1);
    return counts;
  }, new Map());
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
            {Array.from({ length: summary.goal }, (_, index) => {
              const visit = summary.cycleVisits[index];
              const catalogService = visit ? serviceCatalog.get(visit.serviceSlug.trim().toLowerCase()) : undefined;
              const imageUrl = visit?.serviceImageUrl || catalogService?.imageUrl;
              return (
                <span
                  key={visit?.id || index}
                  className={`${index < summary.cycleCompletedVisits ? styles.visitRewardTrackComplete : ""} ${visit ? styles.visitRewardTrackService : ""}`}
                  title={visit?.serviceName}
                >
                  <i aria-hidden="true">
                    {visit && imageUrl
                      ? <Image src={imageUrl} alt="" width={38} height={38} sizes="38px" />
                      : index < summary.cycleCompletedVisits ? "✓" : index + 1}
                  </i>
                  <small>{visit?.serviceName || (index + 1 === summary.goal ? "Reward" : `Visit ${index + 1}`)}</small>
                </span>
              );
            })}
          </div>
          <div className={summary.availableRewards ? styles.visitRewardReadyState : styles.visitRewardProgressState}>
            <span aria-hidden="true">✦</span><div><small>{summary.availableRewards ? "Unlocked" : "Your progress"}</small><strong>{rewardTitle}</strong></div>
          </div>
        </div>
      </section>

      <section className={styles.visitRewardEligible} aria-labelledby="eligible-reward-services">
        <header className={styles.visitRewardEligibleHeader}>
          <div>
            <span className={styles.eyebrow}>{isNad ? "NAD+ reward collection" : "Eligible wellness collection"}</span>
            <h2 id="eligible-reward-services">{isNad ? "Your eligible NAD+ care." : "Every eligible IV moves you forward."}</h2>
            <p>
              {isNad
                ? "Both NAD+ services build this reward and can be selected when your free visit is ready."
                : "Choose any service below. Every completed visit adds one step to this wellness reward."}
            </p>
          </div>
          <span>{eligibleServices.length} eligible service{eligibleServices.length === 1 ? "" : "s"}</span>
        </header>
        <div className={styles.visitRewardServiceGrid}>
          {eligibleServices.map((service) => {
            const completedCount = completedByService.get(service.id) || 0;
            return (
              <article
                key={service.id}
                className={`${styles.visitRewardService} ${completedCount ? styles.visitRewardServiceComplete : ""}`}
              >
                <div className={styles.visitRewardServiceImage}>
                  <Image src={service.imageUrl} alt={service.name} width={78} height={78} sizes="78px" />
                </div>
                <div className={styles.visitRewardServiceCopy}>
                  <small>{completedCount ? "Completed this cycle" : "Eligible service"}</small>
                  <strong>{service.name}</strong>
                  <span>{completedCount ? `${completedCount} visit${completedCount === 1 ? "" : "s"} earned progress` : "Completes one step"}</span>
                </div>
                <b aria-label={completedCount ? `${completedCount} completed this cycle` : "Eligible for this reward"}>
                  {completedCount ? `✓ ${completedCount}` : "+1"}
                </b>
              </article>
            );
          })}
        </div>
        <footer><span aria-hidden="true">✦</span><p><strong>Your wellness trail updates automatically.</strong> Completed services light up here and in your current reward cycle.</p></footer>
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
