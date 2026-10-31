export type StaffSelection = { mode: 'all' | 'include' | 'exclude'; ids: string[] };
export const staffSelected = (selection: StaffSelection, id: string) => selection.mode === 'all' || (selection.mode === 'include' ? selection.ids.includes(id) : !selection.ids.includes(id));
export function toggleStaff(selection: StaffSelection, id: string): StaffSelection {
    const mode = selection.mode === 'all' ? 'exclude' : selection.mode;
    const ids = selection.ids.includes(id) ? selection.ids.filter(value => value !== id) : [...selection.ids, id];
    return mode === 'exclude' && !ids.length ? { mode: 'all', ids: [] } : { mode, ids };
}
// A deterministic starting color, with collision resolution across the clinic's roster.
// Stored as a browser display preference, never as booking or authorization data.
const palette = ['#2563eb','#a21caf','#047857','#c2410c','#7c3aed','#be123c','#0e7490','#4d7c0f','#b45309','#4338ca','#a16207','#0f766e'];
export function assignStaffColors(previous: Record<string,string>, ids: string[]) {
    const colors:Record<string,string> = {};
    const used = new Set<string>();
    for (const [id,color] of Object.entries(previous)) {
        if (/^(?:[a-f0-9-]{36}|unassigned)$/.test(id) && /^#[a-f0-9]{6}$/.test(color) && !used.has(color)) { colors[id]=color; used.add(color); }
    }
    for (const id of [...new Set(ids)].sort()) {
        if (colors[id]) continue;
        let hash=2166136261;
        for (const char of id) hash=Math.imul(hash^char.charCodeAt(0),16777619)>>>0;
        let color='';
        for(let offset=0;offset<palette.length;offset++) {
            const candidate=palette[(hash+offset)%palette.length];
            if(!used.has(candidate)){color=candidate;break;}
        }
        // Odd step visits every 24-bit RGB value before repeating.
        for(let offset=0;!color;offset++) {
            const value=(hash+Math.imul(offset,0x9e3779))&0xffffff;
            const r=value>>16,g=(value>>8)&255,b=value&255;
            const candidate='#'+value.toString(16).padStart(6,'0');
            if(Math.max(r,g,b)-Math.min(r,g,b)>=45 && (r*299+g*587+b*114)/1000<160 && !used.has(candidate))color=candidate;
        }
        colors[id]=color;used.add(color);
    }
    return colors;
}
