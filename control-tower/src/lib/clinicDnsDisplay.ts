// Display-only DNS names. Provider records and verification keep their full names.
const cleanName = (name: string) => name.trim().toLowerCase().replace(/\.$/, '');

export function isDnsZoneForHost(hostname: string, zone: string): boolean {
    const host = cleanName(hostname);
    const domain = cleanName(zone);
    const labels = domain.split('.');
    return labels.length >= 2 && labels.every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
        && (host === domain || host.endsWith(`.${domain}`));
}

export function dnsHostForZone(recordName: string, zone: string): string {
    const name = cleanName(recordName);
    const domain = cleanName(zone);
    if (!isDnsZoneForHost(name, domain)) return recordName;
    return name === domain ? '@' : name.slice(0, -(domain.length + 1));
}
