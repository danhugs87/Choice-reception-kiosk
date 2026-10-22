// Integration tests with real clock/PIN functions and fake Sheets/services.
const fs=require('fs'),vm=require('vm'),crypto=require('crypto'),assert=require('assert/strict');
let now=Date.parse('2026-10-19T08:00:00Z'),held=false,appendFailure='',writeFailure='';
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
const propsMap=new Map([['STAFF_SPREADSHEET_ID','staff-id'],['STAFF_BREAK_POLICY','PAID_NO_DEDUCTION'],['STAFF_PIN_PEPPER','fake-pepper']]),tabs=new Map(),logs=[];
const props={getProperty:k=>propsMap.get(k),setProperty:(k,v)=>propsMap.set(k,v),deleteProperty:k=>propsMap.delete(k)};
function makeSheet(name,headers){const rows=[headers.slice()];const sheet={rows,getName:()=>name,getLastRow:()=>rows.length,getLastColumn:()=>rows[0].length,getDataRange:()=>({getValues:()=>rows.map(r=>r.slice())}),getRange(...args){let[r,c,n=1,m=1]=args;if(typeof r==='string'){const match=/([A-Z])(\d*)/.exec(r);r=Number(match[2]||1);c=match[1].charCodeAt(0)-64;}
  const range={getValues:()=>rows.slice(r-1,r-1+n).map(row=>row.slice(c-1,c-1+m)),setValues:values=>{if(writeFailure===name){writeFailure='';throw Error('Simulated write failure');}values.forEach((row,i)=>{rows[r-1+i]??=[];row.forEach((v,j)=>{rows[r-1+i][c-1+j]=v;});});return range;},setValue:value=>{if(writeFailure===name){writeFailure='';throw Error('Simulated write failure');}rows[r-1]??=[];rows[r-1][c-1]=value;return range;}};
  ['setBackground','setFontColor','setFontWeight','setNumberFormat','setWrap'].forEach(method=>range[method]=()=>range);return range;},appendRow:row=>{if(appendFailure===name){appendFailure='';throw Error('Simulated append failure');}rows.push(row.slice());},setFrozenRows(){},setColumnWidths(){}};tabs.set(name,sheet);return sheet;}
const ss={getId:()=>'staff-id',getOwner:()=>({getEmail:()=>'owner@example.test'}),getSheetByName:name=>tabs.get(name),insertSheet:name=>makeSheet(name,[])};
function parts(date,tz){return Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));}
function format(date,tz,pattern){const p=parts(date,tz);if(pattern==='yyyy-MM-dd')return `${p.year}-${p.month}-${p.day}`;if(pattern==='dd/MM/yyyy')return `${p.day}/${p.month}/${p.year}`;return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;}
function parse(text,tz,pattern){const a=text.match(/\d+/g).map(Number),desired=pattern.startsWith('yyyy')?Date.UTC(a[0],a[1]-1,a[2],a[3],a[4]):Date.UTC(a[2],a[1]-1,a[0],a[3],a[4]);let date=new Clock(desired);for(let i=0;i<3;i++){const p=parts(date,tz),shown=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute);date=new Clock(date.getTime()+desired-shown);}return date;}
const context={Date:Clock,console:{log:text=>logs.push(text),error:text=>logs.push(text)},ScriptApp:{AuthMode:{FULL:'full'},requireScopes(){}},SpreadsheetApp:{getActiveSpreadsheet:()=>ss,openById:()=>ss,flush(){}},Session:{getActiveUser:()=>({getEmail:()=>'owner@example.test'})},PropertiesService:{getScriptProperties:()=>props},LockService:{getScriptLock:()=>({waitLock(){assert(!held);held=true;},hasLock:()=>held,releaseLock(){held=false;}})},Utilities:{getUuid:()=>crypto.randomUUID(),Charset:{UTF_8:'utf8'},computeHmacSha256Signature:(value,key)=>Array.from(crypto.createHmac('sha256',key).update(value).digest()).map(v=>v>127?v-256:v),formatDate:format,parseDate:parse}};
vm.createContext(context);for(const name of ['Code.gs','Pins.gs','Clock.gs','StaffCorrections.gs'])vm.runInContext(fs.readFileSync(__dirname+'/'+name,'utf8'),context);
Object.entries(context.SC_HEADERS).forEach(([name,headings])=>makeSheet(name,headings));context.SC_STAFF.forEach(row=>tabs.get('Staff').rows.push(Array.from(row)));
const pins={dan:'293847',tracey:'384756',hayley:'475869',tara:'586971',louise:'697182'};
for(const id of Object.keys(pins))context.scStorePin_(id,pins[id],'owner',props,'fake-pepper',id==='dan');
context.setupStaffClockApp();assert(tabs.has('Operations'));
const call=(id,action,extra={})=>{const r=context.staffClockRequest({staffId:id,pin:pins[id],action,...extra});assert(!held);return r;};
const ok=(id,action,extra={})=>{const r=call(id,action,extra);assert.equal(r.status,'success',r.message);return r;};
const request=()=>crypto.randomUUID();
let listed=context.staffClockRequest({action:'listStaff'});assert.equal(listed.staff.length,5);assert.deepEqual(Object.keys(listed.staff[0]).sort(),['id','name']);
assert(ok('dan','login').mustChange);assert.equal(call('dan','clockIn',{requestId:request(),location:'Choice building'}).code,'CHANGE_PIN');
assert.equal(call('dan','changePin',{newPin:pins.tara}).status,'error');assert.equal(call('dan','changePin',{newPin:'123456'}).status,'error');ok('dan','changePin',{newPin:'918273'});const old=pins.dan;pins.dan='918273';assert.equal(context.staffClockRequest({action:'login',staffId:'dan',pin:old}).status,'error');assert(!ok('dan','login').mustChange);
let startId=request();let data=ok('dan','clockIn',{requestId:startId,location:'Choice building',note:''});assert(data.state.working);assert.equal(tabs.get('Shifts').rows.length,2);assert.equal(tabs.get('Work_Segments').rows.length,2);ok('dan','clockIn',{requestId:startId,location:'Choice building',note:''});assert.equal(tabs.get('Shifts').rows.length,2);
assert.equal(call('dan','clockIn',{requestId:request(),location:'Choice building'}).status,'error');
now+=2*3600000;data=ok('dan','changeLocation',{requestId:request(),location:'Off-site work',note:'Partner meeting'});assert.equal(data.week.recordedHours,2);assert.equal(data.state.location,'Off-site work');assert.equal(tabs.get('Shifts').rows.length,2);
now+=3600000;data=ok('dan','getState');assert.equal(data.week.recordedHours,2);assert.equal(data.week.ongoingHours,1);assert.equal(data.week.details.length,2);
now+=5*3600000;const outId=request();data=ok('dan','clockOut',{requestId:outId});assert(!data.state.working);assert.equal(data.week.recordedHours,8);assert.equal(data.week.ongoingHours,0);assert.equal(tabs.get('Shifts').rows[1][4],'Closed');ok('dan','clockOut',{requestId:outId});assert.equal(tabs.get('Shifts').rows.length,2);
assert.equal(call('tara','managementWeek',{role:'Management'}).status,'error');const team=ok('dan','managementWeek');assert.equal(team.summary.find(p=>p.name==='Dan').recordedHours,8);assert.equal(team.summary.find(p=>p.name==='Dan').recordedMinutes,480);assert.equal(team.summary.find(p=>p.name==='Dan').ongoingMinutes,0);
assert.equal(ok('tara','getState').week.recordedHours,0);assert.equal(call('tara','clockIn',{requestId:startId,location:'Choice building'}).status,'error');assert.equal(call('tara','clockIn',{requestId:request(),location:'Off-site work',note:''}).status,'error');
// Crash between creating a shift and its first segment; login recovers it.
now+=3600000;appendFailure='Work_Segments';const failedStart=request();assert.equal(call('tara','clockIn',{requestId:failedStart,location:'Working from home',note:'Admin'}).status,'error');assert.equal(context.scPendingOperations_(ss,'tara').length,1);data=ok('tara','login');assert(data.state.working);assert.equal(context.scPendingOperations_(ss,'tara').length,0);const taraSegments=()=>tabs.get('Work_Segments').rows.filter(r=>r[2]==='tara');assert.equal(taraSegments().length,1);
// Crash after closing the old location but before creating the new location.
now+=3600000;appendFailure='Work_Segments';assert.equal(call('tara','changeLocation',{requestId:request(),location:'Choice building',note:''}).status,'error');data=ok('tara','getState');assert.equal(data.state.location,'Choice building');assert.equal(taraSegments().length,2);assert.equal(taraSegments()[0][5].getTime(),taraSegments()[1][4].getTime());
// Crash after closing the segment but before closing the shift.
now+=3600000;writeFailure='Shifts';assert.equal(call('tara','clockOut',{requestId:request()}).status,'error');data=ok('tara','getState');assert(!data.state.working);assert.equal(data.week.recordedHours,2);
// Lost completion marker after all records were written; retry must not duplicate.
writeFailure='Operations';const markerId=request();assert.equal(call('hayley','clockIn',{requestId:markerId,location:'Choice building',note:'=formula-like note'}).status,'error');data=ok('hayley','clockIn',{requestId:markerId,location:'Choice building',note:'=formula-like note'});assert(data.state.working);assert.equal(tabs.get('Work_Segments').rows.filter(r=>r[2]==='hayley').length,1);assert.equal(data.state.note,'=formula-like note');ok('hayley','clockOut',{requestId:request()});
// London week boundaries include actual DST elapsed time, not fixed 168-hour weeks.
const autumn=context.scWeekBounds_('2026-10-21',new Clock()),spring=context.scWeekBounds_('2026-03-25',new Clock());assert.equal((autumn.end-autumn.start)/3600000,169);assert.equal((spring.end-spring.start)/3600000,167);
now=Date.parse('2026-10-25T23:30:00Z');ok('louise','clockIn',{requestId:request(),location:'Choice building'});now+=3600000;ok('louise','clockOut',{requestId:request()});assert.equal(ok('louise','getState',{weekDate:'2026-10-19'}).week.recordedHours,0.5);assert.equal(ok('louise','getState',{weekDate:'2026-10-26'}).week.recordedHours,0.5);
assert.equal(call('louise','getState',{weekDate:'2026-02-31'}).status,'error');
const taraRow=tabs.get('Staff').rows.find(r=>r[0]==='tara');taraRow[4]=false;assert.equal(call('tara','login').status,'error');taraRow[4]=true;
// Management correction: require evidence, preserve originals, recover partial writes.
context.setupStaffCorrections();
ok('tara','clockIn',{requestId:request(),location:'Choice building'});now+=2*3600000;ok('tara','changeLocation',{requestId:request(),location:'Working from home',note:'Admin'});now+=3600000;
let open=ok('dan','managementOpenShifts').shifts;assert.equal(open.length,1);const target=open[0].shiftId;
assert.equal(call('tara','managementOpenShifts',{role:'Management'}).status,'error');assert.equal(call('tara','closeMissedShift',{shiftId:target,role:'Management'}).status,'error');
const finish=new Clock(now-30*60000),finishText=format(finish,'Europe/London','dd/MM/yyyy HH:mm');
const correction={requestId:request(),shiftId:target,finishText,reason:'Confirmed finish with staff member'};
const audit=tabs.get('Corrections').rows,originalAuditLength=audit.length;
for(const bad of [{finishText:''},{finishText:'31/02/2026 12:00'},{finishText:format(new Clock(now+3600000),'Europe/London','dd/MM/yyyy HH:mm')},{finishText:format(new Clock(now-4*3600000),'Europe/London','dd/MM/yyyy HH:mm')},{reason:'x'}]){assert.equal(call('dan','closeMissedShift',{...correction,requestId:request(),...bad}).status,'error');assert.equal(audit.length,originalAuditLength);}
writeFailure='Shifts';assert.equal(call('dan','closeMissedShift',correction).status,'error');assert.equal(audit.at(-1)[8],'Pending');assert.equal(audit.at(-1)[4],'dan');assert.equal(JSON.parse(audit.at(-1)[6]).shift[3],'');
data=ok('tara','login');assert(!data.state.working);assert.equal(data.week.recordedHours,2.5);assert.equal(audit.at(-1)[8],'Applied');
const auditAfter=audit.length;ok('dan','closeMissedShift',correction);assert.equal(audit.length,auditAfter);assert.equal(call('dan','closeMissedShift',{...correction,reason:'Different reason'}).status,'error');
// Unfinished staff clock operations block a management correction until recovered.
appendFailure='Work_Segments';assert.equal(call('louise','clockIn',{requestId:request(),location:'Choice building'}).status,'error');open=ok('dan','managementOpenShifts').shifts;const blocked=open.find(row=>row.staffId==='louise');assert(blocked.blocked);assert.equal(call('dan','closeMissedShift',{requestId:request(),shiftId:blocked.shiftId,finishText,reason:'Test confirmation'}).status,'error');ok('louise','login');now+=60000;ok('louise','clockOut',{requestId:request()});
// Correction completion marker lost after writes: manager-list recovery is safe.
ok('tracey','clockIn',{requestId:request(),location:'Choice building'});now+=3600000;open=ok('dan','managementOpenShifts').shifts;const traceyShift=open.find(row=>row.staffId==='tracey').shiftId;
writeFailure='Corrections';const markerCorrection={requestId:request(),shiftId:traceyShift,finishText:format(new Clock(now-60000),'Europe/London','dd/MM/yyyy HH:mm'),reason:'=Confirmed test finish'};
assert.equal(call('dan','closeMissedShift',markerCorrection).status,'error');assert.equal(audit.at(-1)[8],'Pending');assert(audit.at(-1)[5].startsWith("'="));ok('dan','managementOpenShifts');assert.equal(audit.at(-1)[8],'Applied');assert(!ok('tracey','login').state.working);
// If the audit cannot be saved first, no time record is changed.
ok('hayley','clockIn',{requestId:request(),location:'Choice building'});now+=3600000;const hayleyShift=ok('dan','managementOpenShifts').shifts.find(row=>row.staffId==='hayley').shiftId;
appendFailure='Corrections';assert.equal(call('dan','closeMissedShift',{requestId:request(),shiftId:hayleyShift,finishText:format(new Clock(now-60000),'Europe/London','dd/MM/yyyy HH:mm'),reason:'Confirmed finish'}).status,'error');assert(ok('hayley','login').state.working);ok('hayley','clockOut',{requestId:request()});
// A pending correction must refuse to overwrite a later manual edit.
ok('tracey','clockIn',{requestId:request(),location:'Choice building'});now+=3600000;const changedShift=ok('dan','managementOpenShifts').shifts.find(row=>row.staffId==='tracey').shiftId;
writeFailure='Shifts';assert.equal(call('dan','closeMissedShift',{requestId:request(),shiftId:changedShift,finishText:format(new Clock(now-60000),'Europe/London','dd/MM/yyyy HH:mm'),reason:'Confirmed finish'}).status,'error');const changedRow=tabs.get('Shifts').rows.find(row=>row[0]===changedShift);changedRow[2]=new Clock(changedRow[2].getTime()+1000);assert.equal(call('tracey','login').status,'error');assert.equal(audit.at(-1)[8],'Pending');
const html=fs.readFileSync(__dirname+'/Staff.html','utf8');new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);assert(!html.includes('localStorage'));assert(!html.includes('innerHTML'));
assert(logs.every(line=>!Object.values(pins).some(pin=>line.includes(pin))));
// Minute displays must be derived from exact elapsed time, not the rounded decimal-hour fields.
const minuteWeek=context.scWeekBounds_('2026-10-19',new Clock());
for(const [id,seconds,expectedMinutes]of [['six_minutes',385,6],['example_duration',13080,218],['hour_carry',3599,60]]){
 const begin=Date.parse('2026-10-20T09:00:00Z');
 tabs.get('Work_Segments').rows.push(['segment_'+id,'shift_'+id,id,'Choice building',new Clock(begin),new Clock(begin+seconds*1000),'','request_'+id]);
 const report=context.scWeekReport_(ss,id,minuteWeek);
 assert.equal(report.recordedMinutes,expectedMinutes);assert.equal(report.details[0].minutes,expectedMinutes);
 assert.equal(report.ongoingMinutes,0);
 if(id==='six_minutes')assert.equal(report.recordedHours,0.11);
}
// A stale test page must never replay an old action into an empty live log.
propsMap.set('STAFF_GO_LIVE_CHECKPOINT',JSON.stringify({phase:'complete'}));
propsMap.set('STAFF_LIVE_PREPARED_AT','2026-10-20T09:00:00.000Z');
propsMap.set('STAFF_DATA_GENERATION','live_generation');
const shiftCount=tabs.get('Shifts').rows.length;
assert.equal(call('dan','clockIn',{requestId:startId,location:'Choice building'}).code,'STALE_LOG');
assert.equal(tabs.get('Shifts').rows.length,shiftCount);
assert.equal(context.staffClockRequest({action:'listStaff'}).generation,'live_generation');
assert.equal(call('dan','login',{generation:'live_generation'}).status,'success');
propsMap.set('STAFF_GO_LIVE_CHECKPOINT',JSON.stringify({phase:'clearing verified test logs'}));
for(const action of ['listStaff','login','clockIn'])assert.equal(call('dan',action,{generation:'live_generation',requestId:request(),location:'Choice building'}).code,'MAINTENANCE');
propsMap.set('STAFF_GO_LIVE_CHECKPOINT',JSON.stringify({phase:'complete'}));
// Preparation can begin while a request waits for its action lock.
const originalLocks=context.LockService;let lockCount=0;
context.LockService={getScriptLock(){const lock=originalLocks.getScriptLock(),wait=lock.waitLock;lock.waitLock=()=>{wait();if(++lockCount===2)propsMap.set('STAFF_GO_LIVE_CHECKPOINT',JSON.stringify({phase:'archiving'}));};return lock;}};
assert.equal(call('dan','clockIn',{generation:'live_generation',requestId:request(),location:'Choice building'}).code,'MAINTENANCE');
assert.equal(tabs.get('Shifts').rows.length,shiftCount);context.LockService=originalLocks;
propsMap.set('STAFF_GO_LIVE_CHECKPOINT','invalid-json');
assert.equal(call('dan','login',{generation:'live_generation'}).code,'MAINTENANCE');
propsMap.set('STAFF_GO_LIVE_CHECKPOINT',JSON.stringify({phase:'complete'}));
// The test banner disappears only after the successful live marker.
let content=html,title='';
context.HtmlService={createHtmlOutputFromFile(){return {getContent:()=>content,setContent(v){content=v;return this;},setTitle(v){title=v;return this;},addMetaTag(){return this;}};}};
context.doGet();assert(!content.includes('TEST SYSTEM'));assert.equal(title,'Choice Staff Clock');
propsMap.delete('STAFF_LIVE_PREPARED_AT');content=html;context.doGet();assert(content.includes('TEST SYSTEM'));assert.equal(title,'Choice Staff Clock - Test');
console.log('PASS: staff clock/PIN flows, role-checked corrections, time validation, original-record audit, partial-correction recovery, pending-action guards, refusal to overwrite changed records, request retries, paid hours and DST boundaries. Go-live maintenance, stale-page rejection and banner checks passed. No live data or real credentials used.');
