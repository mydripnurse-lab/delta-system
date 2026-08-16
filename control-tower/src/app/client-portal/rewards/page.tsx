import Link from "next/link";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";

import { getAuthenticatedClient } from "@/lib/clientPortalAuth";
import { getClientReferralSummary } from "@/lib/clientReferrals";
import { getClientVisitRewardSummary } from "@/lib/clientRewards";

import styles from "../clientPortal.module.css";

export const dynamic = "force-dynamic";

function Milestones({ goal, completed }: { goal: number; completed: number }) {
  return (
    <div className={styles.rewardCardMilestones} aria-label={`${completed} of ${goal} milestones complete`}>
      {Array.from({ length: goal }, (_, index) => (
        <span key={index} className={index < completed ? styles.rewardCardMilestoneComplete : ""}>{index + 1}</span>
      ))}
    </div>
  );
}

export default async function ClientRewardsPage() {
  const account = await getAuthenticatedClient();
  if (!account) redirect("/login?next=/rewards");
  const [invitations, visits, nadVisits] = await Promise.all([
    getClientReferralSummary(account.id),
    getClientVisitRewardSummary(account.id, "wellness"),
    getClientVisitRewardSummary(account.id, "nad_family"),
  ]);
  const availableRewards = Number(invitations.rewardStatus === "available") + visits.availableRewards + nadVisits.availableRewards;

  return (
    <div className={`${styles.pageShell} ${styles.rewardsPage}`}>
      <section className={styles.rewardsHero}>
        <div>
          <span className={styles.eyebrow}>My Drip Nurse Rewards</span>
          <h1>Wellness that gives back.</h1>
          <p>Build progress every time you return and every time someone you invite joins Care. Your rewards are tracked automatically.</p>
        </div>
        <aside className={availableRewards ? styles.rewardsAvailableSummary : styles.rewardsProgressSummary}>
          <small>{availableRewards ? "Ready to use" : "Rewards journey"}</small>
          <strong>{availableRewards || "3"}</strong>
          <span>{availableRewards ? `reward${availableRewards === 1 ? "" : "s"} available` : "ways to earn"}</span>
        </aside>
      </section>

      <section className={styles.rewardProgramGrid} aria-label="Available rewards programs">
        <Link href="/rewards/invitations" className={styles.rewardProgramCard}>
          <header>
            <div className={styles.rewardProgramIcon} aria-hidden="true">✦</div>
            <span className={invitations.rewardStatus === "available" ? styles.rewardReadyPill : styles.rewardActivePill}>
              {invitations.rewardStatus === "available" ? "Reward ready" : "Active"}
            </span>
          </header>
          <div className={styles.rewardProgramCopy}>
            <small>Share care</small>
            <h2>Invite friends.<br />Unlock your next discount.</h2>
            <p>Ten verified Care registrations unlock {invitations.discountPercentageLabel} off your next eligible appointment.</p>
          </div>
          <div className={styles.rewardProgramProgress}>
            <div><span>Verified registrations</span><strong>{invitations.registeredCount}<small> / {invitations.goal}</small></strong></div>
            <div className={styles.rewardCardRing} style={{ "--reward-progress": `${invitations.percent * 3.6}deg` } as CSSProperties}><span>{invitations.percent}%</span></div>
          </div>
          <Milestones goal={invitations.goal} completed={invitations.registeredCount} />
          <footer><span>{invitations.rewardStatus === "available" ? `${invitations.discountPercentageLabel} off is ready` : `${invitations.remainingCount} registrations to go`}</span><b>Open reward →</b></footer>
        </Link>

        <Link href="/rewards/visits" className={`${styles.rewardProgramCard} ${styles.rewardVisitsCard}`}>
          <header>
            <div className={styles.rewardProgramIcon} aria-hidden="true">◎</div>
            <span className={visits.availableRewards ? styles.rewardReadyPill : styles.rewardActivePill}>
              {visits.availableRewards ? `${visits.availableRewards} ready` : "Always earning"}
            </span>
          </header>
          <div className={styles.rewardProgramCopy}>
            <small>Everyday wellness</small>
            <h2>Complete visits.<br />Earn free care.</h2>
            <p>Every {visits.goal} completed non-NAD appointments unlocks one free non-NAD visit. NAD+ and NAD+ Boost progress in their own program.</p>
          </div>
          <div className={styles.rewardProgramProgress}>
            <div><span>Visits this cycle</span><strong>{visits.cycleCompletedVisits}<small> / {visits.goal}</small></strong></div>
            <div className={styles.rewardCardRing} style={{ "--reward-progress": `${visits.percent * 3.6}deg` } as CSSProperties}><span>{visits.percent}%</span></div>
          </div>
          <Milestones goal={visits.goal} completed={visits.cycleCompletedVisits} />
          <footer><span>{visits.availableRewards ? "Your free visit is ready" : `${visits.remainingVisits} visit${visits.remainingVisits === 1 ? "" : "s"} to go`}</span><b>Open reward →</b></footer>
        </Link>

        <Link href="/rewards/nad" className={`${styles.rewardProgramCard} ${styles.rewardNadCard}`}>
          <header>
            <div className={styles.rewardProgramIcon} aria-hidden="true">N+</div>
            <span className={nadVisits.availableRewards ? styles.rewardReadyPill : styles.rewardActivePill}>
              {nadVisits.availableRewards ? `${nadVisits.availableRewards} ready` : "Premium progress"}
            </span>
          </header>
          <div className={styles.rewardProgramCopy}>
            <small>NAD+ care</small>
            <h2>Build your rhythm.<br />Unlock an NAD+ visit.</h2>
            <p>Every {nadVisits.goal} completed NAD+ or NAD+ Boost visits unlocks one free eligible NAD-family visit. Your next cycle then starts automatically.</p>
          </div>
          <div className={styles.rewardProgramProgress}>
            <div><span>NAD+ visits this cycle</span><strong>{nadVisits.cycleCompletedVisits}<small> / {nadVisits.goal}</small></strong></div>
            <div className={styles.rewardCardRing} style={{ "--reward-progress": `${nadVisits.percent * 3.6}deg` } as CSSProperties}><span>{nadVisits.percent}%</span></div>
          </div>
          <Milestones goal={nadVisits.goal} completed={nadVisits.cycleCompletedVisits} />
          <footer><span>{nadVisits.availableRewards ? "Your NAD+ reward is ready" : `${nadVisits.remainingVisits} NAD+ visit${nadVisits.remainingVisits === 1 ? "" : "s"} to go`}</span><b>Open reward →</b></footer>
        </Link>
      </section>

      <section className={styles.rewardsPromise}>
        <span aria-hidden="true">✓</span>
        <div><small>Simple by design</small><strong>No codes to remember.</strong><p>Eligible rewards are applied automatically when you book. Your care professional’s payment is never reduced.</p></div>
      </section>
    </div>
  );
}
