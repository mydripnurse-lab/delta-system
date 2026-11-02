'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useId, useRef, useState } from 'react';
import site from './clinicWebsite.module.css';
import styles from './clinicPublicTeam.module.css';

type TeamMember = {
    id: string; slug: string; href: string; name: string; photo: string;
    credentials: string; publicTitle: string; area: string;
};
const PAGE_SIZE = 6;

export function ClinicPublicTeam({ team }: { team: TeamMember[] }) {
    const [requestedPage, setPage] = useState(1);
    const heading = useRef<HTMLHeadingElement>(null);
    const id = useId();
    const pages = Math.max(1, Math.ceil(team.length / PAGE_SIZE));
    const page = Math.min(requestedPage, pages);
    const start = (page - 1) * PAGE_SIZE;
    const visible = team.slice(start, start + PAGE_SIZE);

    function navigate(next: number) {
        setPage(Math.max(1, Math.min(next, pages)));
        heading.current?.focus({ preventScroll: true });
        if (heading.current && heading.current.getBoundingClientRect().top < 0) {
            heading.current.scrollIntoView({ block: 'start' });
        }
    }

    if (!team.length) return null;
    return <section className={`${site.section} ${styles.section}`} id="team" aria-labelledby={`${id}-title`}>
        <div className={styles.heading}>
            <div><span className={site.eyebrow}>The people behind your care</span><h2 ref={heading} tabIndex={-1} id={`${id}-title`}>Meet your care team.</h2></div>
            <p>Get to know your local professionals and find the right person for your next visit.</p>
        </div>
        <ul className={styles.grid} id={`${id}-results`}>
            {visible.map(nurse => <li key={nurse.id}>
                <Link prefetch={false} className={styles.card} href={nurse.href}>
                    <div className={styles.portrait}>
                        {nurse.photo ? <Image unoptimized src={nurse.photo} width={420} height={460} loading="lazy" alt={nurse.name}/> : <span className={styles.initials} aria-hidden="true">{nurse.name.split(/\s+/).slice(0, 2).map(n => n[0]).join('')}</span>}
                        {nurse.credentials ? <span className={styles.credentials}>{nurse.credentials}</span> : null}
                    </div>
                    <div className={styles.details}>
                        <h3>{nurse.name}</h3>
                        {nurse.publicTitle ? <p className={styles.profession}>{nurse.publicTitle}</p> : null}
                        {nurse.area ? <p className={styles.area}>{nurse.area}</p> : null}
                        <span className={styles.link}>View profile <span aria-hidden="true">↗</span></span>
                    </div>
                </Link>
            </li>)}
        </ul>
        {pages > 1 ? <nav className={styles.pagination} aria-label="Care team pages">
            <button type="button" onClick={() => navigate(page - 1)} disabled={page === 1} aria-label="Previous team page" aria-controls={`${id}-results`}><span aria-hidden="true">←</span><span className={styles.direction}>Previous</span></button>
            <p aria-live="polite" aria-atomic="true">Page {page} of {pages}<small>{start + 1}–{Math.min(start + PAGE_SIZE, team.length)} of {team.length} professionals</small></p>
            <button type="button" onClick={() => navigate(page + 1)} disabled={page === pages} aria-label="Next team page" aria-controls={`${id}-results`}><span className={styles.direction}>Next</span><span aria-hidden="true">→</span></button>
        </nav> : null}
    </section>;
}
