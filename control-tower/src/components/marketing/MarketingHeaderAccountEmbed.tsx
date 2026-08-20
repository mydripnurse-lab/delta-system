import ClientProfileAvatar from "@/components/client/ClientProfileAvatar";
import styles from "./marketingHeaderAccountEmbed.module.css";

type HeaderAccount = {
  fullName: string;
  email: string;
  photoUrl: string;
  photoUpdatedAt: string;
};

export default function MarketingHeaderAccountEmbed({ account, returnTo }: { account: HeaderAccount | null; returnTo?: string }) {
  const loginHref = `https://care.mydripnurse.com/login${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`;
  if (!account) {
    return <div className={styles.root} data-mdn-header-account-embed="true">
      <a className={styles.login} href={loginHref} target="_top">Log in</a>
    </div>;
  }

  const firstName = account.fullName.trim().split(/\s+/)[0] || "My Care";
  return <div className={styles.root} data-mdn-header-account-embed="true">
    <a className={styles.account} href="https://care.mydripnurse.com" target="_top" aria-label={`Open ${firstName}'s Client Portal`}>
      <ClientProfileAvatar
        className={styles.avatar}
        fullName={account.fullName}
        photoUrl={account.photoUrl}
        photoUpdatedAt={account.photoUpdatedAt}
        sizes="44px"
      />
      <span><strong>{firstName}</strong><small>Client Portal</small></span>
      <b aria-hidden="true">→</b>
    </a>
  </div>;
}
