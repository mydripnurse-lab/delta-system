// Local calendar dates: advancing by calendar days preserves boundaries across DST.
export type ClinicCalendarView = 'month' | 'week' | 'list' | 'staff';
export const calendarDayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export function shiftCalendarDay(date: Date, days: number) { const d = new Date(date); d.setDate(d.getDate()+days); return d; }
export function calendarRange(anchor: Date, view: ClinicCalendarView) {
    const from = new Date(anchor); from.setHours(0,0,0,0);
    if (view === 'week' || view === 'staff') from.setDate(from.getDate()-from.getDay());
    else from.setDate(1);
    const to = view === 'week' || view === 'staff' ? shiftCalendarDay(from,7) : new Date(from.getFullYear(),from.getMonth()+1,1);
    return { from, to };
}
export function moveCalendar(anchor: Date, view: ClinicCalendarView, direction: number) {
    return view === 'week' || view === 'staff' ? shiftCalendarDay(anchor,direction*7) : new Date(anchor.getFullYear(),anchor.getMonth()+direction,1);
}
export function calendarMonthCells(anchor: Date): (Date|null)[] {
    const {from,to}=calendarRange(anchor,'month');
    const count=new Date(to.getFullYear(),to.getMonth(),0).getDate();
    const cells: (Date|null)[]=Array.from({length:from.getDay()},()=>null);
    for(let i=0;i<count;i++)cells.push(shiftCalendarDay(from,i));
    while(cells.length%7)cells.push(null);
    return cells;
}
