const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
process.env.TZ='America/New_York';
const mod={exports:{}};
const source=fs.readFileSync(path.join(__dirname,'../src/lib/clinicCalendarView.ts'),'utf8');
new Function('exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(mod.exports);
const {calendarRange,calendarMonthCells,calendarDayKey,moveCalendar}=mod.exports;
const date=s=>new Date(s+'T12:00:00');
assert.equal(calendarDayKey(moveCalendar(date('2026-01-31'),'month',1)),'2026-02-01');
assert.equal(calendarDayKey(moveCalendar(date('2026-01-31'),'month',-1)),'2025-12-01');
for(const [day,count] of [['2024-02-20',29],['2026-02-20',28],['2026-10-31',31]]){
 const cells=calendarMonthCells(date(day));
 assert.equal(cells.length%7,0);assert.equal(cells.filter(Boolean).length,count);
 assert.equal(cells.findIndex(Boolean),new Date(day.slice(0,7)+'-01T12:00:00').getDay());
 assert.deepEqual(calendarRange(date(day),'month'),calendarRange(date(day),'list'));
 assert.deepEqual(calendarRange(date(day),'week'),calendarRange(date(day),'staff'));
}
for(const day of ['2026-03-10','2026-11-03']){
 const {from,to}=calendarRange(date(day),'week');
 assert.equal(from.getDay(),0);assert.equal(to.getDay(),0);
 assert.equal(from.getHours(),0);assert.equal(to.getHours(),0);
 assert.equal((to-from)/3600000,day.includes('-03-')?167:169);
}
const november=calendarRange(date('2026-11-20'),'month');
assert.equal((november.to-november.from)/3600000,721);
assert((november.to-november.from)/86400000<32,'Fits bounded appointment API');
console.log('PASS: month navigation, leap years, grid boundaries, shared view ranges and DST.');
