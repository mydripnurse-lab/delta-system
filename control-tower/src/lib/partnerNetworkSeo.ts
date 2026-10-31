import { PARTNER_SITE_ORIGIN } from './partnerSeo';

// Shared by the visible FAQ and JSON-LD; no database reads are required.
export const partnerNetworkFaqs = [['How does My Drip Nurse help my practice grow?','We provide visibility through our online presence across the United States and Puerto Rico, help attract traffic and connect local demand with appointment opportunities. Actual results depend on demand, your service areas, availability and approval status.'],['Can I join if I already have a My Drip Nurse account?','Yes. Log in with your existing account. Nurses can register a clinic from their portal without creating a second nurse profile or losing their appointment history.'],['Can a clinic invite nurses who are already in the network?','Yes. Existing nurses can accept an invitation to link their account to a clinic while keeping their website, availability and history.'],['Who reviews applications?','My Drip Nurse reviews clinics and independent nurses. An approved clinic is responsible for reviewing and authorizing its team members.'],['Can I refer other nurses or clinics?','Eligible external referrals can earn commissions under the affiliate program. A clinic’s own team does not generate affiliate commissions.'],['Where can clients find us?','Published profiles appear in the directory, with separate views for nurses and clinics. Listings depend on approval, publication and applicable profile consent.']] as const;

export const partnerNetworkDescription = 'Grow your nursing practice or clinic with My Drip Nurse. Gain visibility, attract traffic and connect with appointment opportunities through our presence across the United States and Puerto Rico.';

export const partnerNetworkStructuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://mydripnurse.com/#organization',
      name: 'My Drip Nurse',
      url: 'https://mydripnurse.com',
      logo: `${PARTNER_SITE_ORIGIN}/mdn-logo.png`,
    },
    {
      '@type': 'WebSite',
      '@id': `${PARTNER_SITE_ORIGIN}/#website`,
      url: PARTNER_SITE_ORIGIN,
      name: 'My Drip Nurse Partners',
      inLanguage: 'en-US',
      publisher: { '@id': 'https://mydripnurse.com/#organization' },
    },
    {
      '@type': ['WebPage', 'FAQPage'],
      '@id': `${PARTNER_SITE_ORIGIN}/#webpage`,
      url: PARTNER_SITE_ORIGIN,
      name: 'Join our Nurse & Clinic Network | My Drip Nurse Partners',
      description: partnerNetworkDescription,
      inLanguage: 'en-US',
      isPartOf: { '@id': `${PARTNER_SITE_ORIGIN}/#website` },
      about: { '@id': 'https://mydripnurse.com/#organization' },
      mainEntity: partnerNetworkFaqs.map(([question, answer]) => ({
        '@type': 'Question',
        name: question,
        acceptedAnswer: { '@type': 'Answer', text: answer },
      })),
    },
  ],
};
