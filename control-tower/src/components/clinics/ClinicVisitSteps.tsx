import styles from './clinicVisitSteps.module.css';

const steps = [
    {
        title: 'Choose your care',
        description: 'Explore services and see pricing for your area. Your address determines the final price and deposit before payment.',
        icon: <><path d="M12 3c-2.5 3.2-6 7.2-6 11a6 6 0 0 0 12 0c0-3.8-3.5-7.8-6-11Z"/><path d="M9 14a3 3 0 0 0 3 3"/></>,
    },
    {
        title: 'Connect with your team',
        description: 'Request a time that works for you. Your assigned professional reviews and accepts the appointment.',
        icon: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18m-13 5 3 3 5-5"/></>,
    },
    {
        title: 'Keep everything in My Care',
        description: 'Follow appointment updates in your secure portal. The clinic collects the remaining balance and any voluntary tip directly.',
        icon: <><rect x="5" y="2" width="14" height="20" rx="3"/><path d="M10 5h4m-3 14h2m-4-8 2 2 4-4"/></>,
    },
];

export function ClinicVisitSteps() {
    return (
        <section className={styles.section} aria-labelledby="clinic-visit-steps-title">
            <header className={styles.heading}>
                <span className={styles.eyebrow}>A thoughtful experience</span>
                <h2 id="clinic-visit-steps-title">Your next visit,<br className={styles.mobileBreak}/> made simple.</h2>
            </header>
            <ol className={styles.steps} role="list">
                {steps.map((step, index) => (
                    <li className={styles.card} key={step.title}>
                        <div className={styles.marker} aria-hidden="true">
                            <span className={styles.icon}>
                                <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" focusable="false">{step.icon}</svg>
                            </span>
                            <span className={styles.number}>0{index + 1}</span>
                        </div>
                        <div className={styles.copy}><h3>{step.title}</h3><p>{step.description}</p></div>
                    </li>
                ))}
            </ol>
        </section>
    );
}
