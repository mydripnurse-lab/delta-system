import Image from "next/image";

import styles from "@/app/client-portal/clientPortal.module.css";

type Props = {
  accepted: boolean;
  name: string;
  photoUrl: string;
  publicTitle: string;
  credentials: string;
  compact?: boolean;
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "MD";
}

export default function ClientCareProfessional({ accepted, name, photoUrl, publicTitle, credentials, compact = false }: Props) {
  if (!accepted) {
    return (
      <div className={`${styles.careProfessionalPending} ${compact ? styles.careProfessionalCompact : ""}`}>
        <span aria-hidden="true">✦</span>
        <div><b>Matching your care professional</b><small>Their verified profile will appear as soon as the visit is accepted.</small></div>
      </div>
    );
  }

  return (
    <div className={`${styles.careProfessional} ${compact ? styles.careProfessionalCompact : ""}`}>
      <div className={styles.careProfessionalPhoto}>
        {photoUrl ? <Image src={photoUrl} alt={`Your My Drip Nurse care professional, ${name}`} fill sizes={compact ? "52px" : "80px"} /> : <span>{initials(name)}</span>}
      </div>
      <div className={styles.careProfessionalIdentity}>
        <span>Your care professional</span>
        <b>{name}</b>
        <small>{[publicTitle, credentials].filter(Boolean).join(" · ")}</small>
      </div>
      <em><i /> Verified professional</em>
    </div>
  );
}
