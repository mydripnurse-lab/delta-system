import { createHash } from 'node:crypto';
// A cheap per-instance guard before authentication/registration reads. This is
// deliberately not a distributed guarantee; retain the platform firewall too.
const buckets = new Map<string, {
    count: number;
    expiresAt: number;
}>();
export function consumeClinicRequestBudget(request: Request, scope: string, limit = 30, windowMs = 600000, now = Date.now()) {
    const address = request.headers.get('x-vercel-forwarded-for') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
    const key = createHash('sha256').update(`${scope}:${address}`).digest('hex');
    const previous = buckets.get(key);
    if (previous && previous.expiresAt > now) {
        if (previous.count >= limit)
            return false;
        previous.count++;
        return true;
    }
    if (buckets.size >= 10000) {
        for (const [key, value] of buckets)
            if (value.expiresAt <= now)
                buckets.delete(key);
        if (buckets.size >= 10000)
            return false;
    }
    buckets.set(key, { count: 1, expiresAt: now + windowMs });
    return true;
}
