import styles from "./partnerFaq.module.css";

export type PartnerFaqItem = {
  question: string;
  answer: string;
};

type PartnerFaqProps = {
  eyebrow?: string;
  title: string;
  introduction?: string;
  items: PartnerFaqItem[];
};

export function PartnerFaq({
  eyebrow = "Frequently asked questions",
  title,
  introduction,
  items,
}: PartnerFaqProps) {
  return (
    <section className={styles.section} aria-labelledby="partner-faq-title">
      <div className={styles.shell}>
        <div className={styles.heading}>
          <span>{eyebrow}</span>
          <h2 id="partner-faq-title">{title}</h2>
          {introduction ? <p>{introduction}</p> : null}
        </div>

        <div className={styles.list}>
          {items.map((item) => (
            <details key={item.question}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
