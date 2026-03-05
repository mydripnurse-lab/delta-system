# negative_keyword_guard

Goal:
- reduce wasted spend by continuously proposing negative keyword updates.

Signals:
- leakage terms from `/api/dashboard/ads/join` (`negativeIdeas`, `kwLeaks`).
- campaign loss profile from losers list.

Selection logic:
- prioritize high-click, zero-conversion terms.
- group by campaign and apply phrase negatives first.
- avoid overblocking without evidence.

Operation example:
- `add_campaign_negative_keywords`

