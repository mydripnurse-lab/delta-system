# My Drip Nurse Local FAQ Engine

## Purpose

The Local FAQ Engine replaces the current static FAQ block on My Drip Nurse service landing pages. It identifies the service from the landing page path, resolves the city, county, and state from the location index, and renders a mobile-first accordion with matching `FAQPage` JSON-LD.

The service catalog in release `1.0.0` is a reviewed snapshot of the Google Sheet:

`https://docs.google.com/spreadsheets/d/1-NQjQ4c0_AhLMNld3GtrSP4mXCVH4heVqQdVtnbmcHk/edit`

## GHL installation

1. Open a service landing page in GHL.
2. Locate the existing Frequently Asked Questions section.
3. Remove or disable the existing accordion Custom HTML element so duplicate questions and schema are not published.
4. Add one Custom HTML/JavaScript element in the same position.
5. Paste the complete contents of `public/embeds/ghl-local-faq-engine.html`.
6. Publish first on a staging or test page.

The snippet must remain below the primary service information and booking CTA and before the footer.

## How matching works

The engine first compares `location.pathname` against each approved service `path`. If no exact path is found, it uses the page title, H1, and H2 text as a fallback. The fallback does not create medical facts; it only identifies an approved service record.

Location resolution follows this order:

1. Exact city, county, or state hostname in the tenant location index.
2. Recognized city, county, parish, or state subdomain.
3. Resolved GHL value `{{custom_values.county_name_and_state}}`.
4. No rendering when the location cannot be confirmed.

## UI isolation and accessibility

All selectors use the `mdn-local-faq` namespace and never target GHL elements, headings, buttons, forms, calendars, or navigation globally. Typography inherits the landing page font while layout, borders, spacing, and focus states remain local to the FAQ root.

The accordion uses native buttons, `aria-expanded`, `aria-controls`, labelled regions, keyboard activation, visible focus states, and reduced-motion support. Only one answer opens at a time to keep the mobile experience compact.

## Content and compliance behavior

Each page receives six FAQs, or seven when an additional service-specific clarification is required. Answers use the approved service description and ingredient list. Local answers only state that an appointment may be requested and that coverage, availability, and eligibility must be confirmed.

The engine does not invent availability, travel time, outcomes, providers, prices, landmarks, nearby areas, or medical claims.

## Schema behavior

The same final FAQ array renders both visible text and JSON-LD. The engine removes its previous schema before inserting one current script, preventing duplicate engine schema when GHL rerenders the block.

Google stopped displaying FAQ rich results in May 2026. The schema remains machine-readable, but no expanded FAQ result is promised. The visible answers remain the primary SEO, AEO, and GEO content.

## Debug mode

Temporarily add this attribute to the root element:

```html
data-debug="true"
```

Alternatively append `?mdnFaqDebug=1` to the page URL. The browser console will expose the resolved service, resolution source, confidence, location, and final FAQs. Remove debug mode before normal production use.

## Updating the service catalog

The Google Sheet is the editorial source. A service update should preserve these columns:

- `service_id`
- `service_name`
- `service_category`
- `path`
- `booking_url`
- `price`
- `vitamins`
- `approved_description`

After a path, ingredient list, or approved description changes, publish a new version of `mdn-local-faq-engine.js`. Runtime visitors never connect directly to Google Sheets, which avoids exposing credentials or making page rendering dependent on Google Sheets availability.

## Safe disable or removal

Remove the GHL Custom HTML element containing the engine snippet. The engine does not modify or persist changes to any other part of the page.
