import Image from 'next/image';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { serializeStructuredData } from '@/lib/partnerSeo';
import styles from './clinicPartnerInvitation.module.css';

const benefits = [
    { icon: 'visibility', title: 'Be easier to discover.', text: 'Introduce your practice with a professional website, service pages and a directory presence that helps clients find care in the areas you cover.' },
    { icon: 'appointments', title: 'Connect with appointment opportunities.', text: 'My Drip Nurse works to attract visitors and connect requests with available nurses based on the client’s address, service and preferred time.' },
    { icon: 'schedule', title: 'Make room for your schedule.', text: 'Choose your services, coverage and hours. Review appointment requests and accept the visits that fit your availability.' },
    { icon: 'team', title: 'Bring your team together.', text: 'Clinic owners can invite nurses, assign services and coordinate appointments from one workspace, with a calendar built for the whole team.' },
    { icon: 'brand', title: 'Let your brand lead.', text: 'Clinics can personalize their website and portal with their logo and colors. Connected nurses share the clinic’s branding while keeping their own profiles.' },
    { icon: 'network', title: 'Grow your connections.', text: 'Invite eligible independent nurses and clinics through the affiliate program. Qualifying external referrals can earn commissions; your own clinic team is excluded.' },
] as const;
type IconName = typeof benefits[number]['icon'];
function Icon({ name }: { name: IconName }) {
    const paths: Record<IconName, ReactNode> = {
        visibility: <><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01M7 13h5M7 16h9"/></>,
        appointments: <><path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z"/><path d="M9 10h6M12 7v6"/></>,
        schedule: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 11h18m-13 5 3 2 5-4"/></>,
        team: <><circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v3"/></>,
        brand: <><path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/></>,
        network: <><circle cx="12" cy="5" r="3"/><circle cx="5" cy="19" r="3"/><circle cx="19" cy="19" r="3"/><path d="m10.5 8-4 8m7-8 4 8M8 19h8"/></>,
    };
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
function Arrow() { return <span aria-hidden="true">↗</span>; }

export function ClinicPartnerInvitation({ name, home, referral, canonical }: { name: string; home: string; referral: string; canonical: string }) {
    const faqs = [
        { question: `How is ${name} involved?`, answer: `${name} is inviting you to join the My Drip Nurse network through its referral link. You apply as an independent nurse or clinic, not as a member of ${name}’s staff. Eligible referrals may earn the referring clinic a commission.` },
        { question: 'What happens after I apply?', answer: 'My Drip Nurse reviews your application before approval. Once approved, complete your profile, services, coverage and availability so clients can discover your practice and request appointments.' },
        { question: 'How are appointment requests matched?', answer: 'Available nurses are shown based on the client’s service address, selected service and appointment time. The assigned nurse reviews and accepts or declines the request. Appointment availability and volume vary; joining does not guarantee bookings.' },
        { question: 'Can a clinic use its own branding?', answer: 'Yes. Clinics can add their logo and colors to their website and portal, manage their nursing team and assign services. Nurses connected to the clinic inherit its branding while maintaining individual profiles and availability.' },
        { question: 'What if I already have an account?', answer: 'Sign in with your existing My Drip Nurse account. You do not need a duplicate account. Your profile, website, availability and history remain with you, and this invitation does not replace an existing referral attribution.' },
        { question: 'Can I refer other nurses or clinics?', answer: 'Yes. Eligible external referrals can earn commissions through the affiliate program. Nurses on your own clinic team do not generate affiliate commissions while they belong to your clinic.' },
    ];
    const nurse = `${referral}?type=nurse`;
    const clinic = `${referral}?type=clinic`;
    return <main id="clinic-content" className={styles.page}>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeStructuredData({ '@context': 'https://schema.org', '@type': 'FAQPage', url: canonical, name: `Join My Drip Nurse through ${name}`, mainEntity: faqs.map(item => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })) }) }}/>
        <section className={styles.hero} aria-labelledby="invitation-title">
            <div className={styles.container}>
                <Link href={home} className={styles.back}>← Back to {name}</Link>
                <div className={styles.heroGrid}>
                    <div>
                        <span className={styles.invitation}><span aria-hidden="true"/>An invitation from {name}</span>
                        <h1 id="invitation-title">Your care deserves<br/><em>more possibilities.</em></h1>
                        <p className={styles.intro}>Join My Drip Nurse through {name}. Build your visibility, connect with appointment opportunities and grow your practice within a network reaching across the United States and Puerto Rico.</p>
                        <div className={styles.actions}>
                            <Link prefetch={false} className={styles.primary} href={nurse}>Join as a nurse <Arrow/></Link>
                            <Link prefetch={false} className={styles.secondary} href={clinic}>Bring your clinic <Arrow/></Link>
                        </div>
                        <p className={styles.heroNote}>Your practice. Your schedule. A connected network.</p>
                    </div>
                    <div className={styles.visual}>
                        <Image src="/clinic-assets/mobile-iv-home.webp" alt="A nurse providing mobile IV care during a visit at home" width={1200} height={800} sizes="(max-width: 800px) 100vw, 45vw" unoptimized className={styles.photo}/>
                        <div className={styles.photoCaption}><Icon name="network"/><div><span>Connected through</span><strong>My Drip Nurse</strong><p>Invited by {name}</p></div></div>
                    </div>
                </div>
            </div>
        </section>
        <section className={`${styles.section} ${styles.container}`} aria-labelledby="benefits-title">
            <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>More than a listing</span><h2 id="benefits-title">Built around the way<br/>you deliver care.</h2></div><p>From helping clients discover you to keeping appointments organized, My Drip Nurse connects the pieces of your practice.</p></div>
            <div className={styles.benefits}>{benefits.map(item => <article key={item.icon}><span className={styles.icon}><Icon name={item.icon}/></span><h3>{item.title}</h3><p>{item.text}</p></article>)}</div>
        </section>
        <section className={styles.paths} aria-labelledby="paths-title"><div className={`${styles.section} ${styles.container}`}>
            <div className={styles.centerHeading}><span className={styles.eyebrow}>Find your place in the network</span><h2 id="paths-title">One network. Two ways to join.</h2><p>Whether you provide care independently or lead a clinic, there is a place to build your presence.</p></div>
            <div className={styles.roleCards}>
                <article><div className={styles.roleTitle}><span className={styles.icon}><Icon name="schedule"/></span><span className={styles.eyebrow}>For independent nurses</span></div><h3>Your expertise.<br/>Your next chapter.</h3><p>Focus on the care you provide, with tools that help clients find you and make it easier to manage your visits.</p><ul><li>A personal website and directory profile</li><li>Your services, coverage and availability</li><li>Appointment requests you can accept or decline</li><li>A portal for appointments and notifications</li></ul><Link prefetch={false} className={styles.primary} href={nurse}>Start my nurse application <Arrow/></Link></article>
                <article><div className={styles.roleTitle}><span className={styles.icon}><Icon name="team"/></span><span className={styles.eyebrow}>For clinics</span></div><h3>Your brand.<br/>A more connected team.</h3><p>Bring your clinic to the network with a branded presence and one place to coordinate your nursing team.</p><ul><li>A clinic website with your logo and colors</li><li>Individual websites for your connected nurses</li><li>Team services, coverage and scheduling tools</li><li>Appointment coordination and team insights</li></ul><Link prefetch={false} className={styles.primary} href={clinic}>Start my clinic application <Arrow/></Link></article>
            </div>
            <p className={styles.disclosure}>You are applying to My Drip Nurse through {name}’s external referral. This does not enroll you in the clinic’s staff. Applications are subject to review and approval.</p>
        </div></section>
        <section className={`${styles.section} ${styles.container}`} aria-labelledby="steps-title">
            <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>A clear path forward</span><h2 id="steps-title">From introduction<br/>to connection.</h2></div><p>{name} makes the introduction. My Drip Nurse helps you take the next step into the network.</p></div>
            <ol className={styles.steps}><li><span>01</span><h3>Tell us about your practice.</h3><p>Choose the nurse or clinic application and share your details and the areas you serve.</p></li><li><span>02</span><h3>Complete your review.</h3><p>My Drip Nurse reviews your application before your account is approved for activation.</p></li><li><span>03</span><h3>Build your presence.</h3><p>Complete your website, select your services and set your availability to connect with eligible appointment requests.</p></li></ol>
        </section>
        <section className={`${styles.section} ${styles.container} ${styles.faq}`} aria-labelledby="faq-title"><div><span className={styles.eyebrow}>Good to know</span><h2 id="faq-title">A few questions,<br/>answered.</h2></div><div>{faqs.map(item => <details key={item.question}><summary>{item.question}<span aria-hidden="true">+</span></summary><p>{item.answer}</p></details>)}</div></section>
        <section className={`${styles.container} ${styles.finalSection}`} aria-labelledby="join-title"><div className={styles.finalCard}><span className={styles.eyebrow}>Your invitation is here</span><h2 id="join-title">Take your next step<br/>with My Drip Nurse.</h2><p>Join through {name} and explore what a connected care network can offer your practice.</p><div className={styles.actions}><Link prefetch={false} className={styles.primary} href={nurse}>Join as a nurse <Arrow/></Link><Link prefetch={false} className={styles.secondary} href={clinic}>Bring your clinic <Arrow/></Link></div><small>Appointment opportunities depend on coverage, eligibility and availability. Booking volume is not guaranteed.</small></div></section>
    </main>;
}
