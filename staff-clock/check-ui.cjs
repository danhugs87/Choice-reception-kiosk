// Flow checks with a DOM stand-in; actual iPad layout remains a manual check.
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),{webcrypto}=require('crypto');
const html=fs.readFileSync(__dirname+'/Staff.html','utf8'),script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const nodes={};function node(id=''){return {id,hidden:true,value:'',textContent:'',children:[],handlers:{},setAttribute(){},append(...items){this.children.push(...items);},replaceChildren(){this.children=[];},addEventListener(e,f){this.handlers[e]=f;},click(){if(this.handlers.click)this.handlers.click();},reset(){const fields={'login-form':['staff-id','pin'],'change-form':['new-pin','repeat-pin'],'work-form':['location','note'],'correction-form':['correction-shift','correction-finish','correction-reason']}[id]||[];fields.forEach(field=>nodes[field].value='');}};}
for(const m of html.matchAll(/\bid="([^"]+)"/g))nodes[m[1]]=node(m[1]);const sections=[...html.matchAll(/<section id="([^"]+)"/g)].map(m=>nodes[m[1]]);
let logGeneration="test",staleLog=false;
let fakeNow=1,working=false,initial=true,pin='293847',failReply=false,clockCalls=0,correctionOpen=true,correctionCalls=0;const saved=new Set(),timers=new Map();let timerId=0;
const requests=[];function reply(p){requests.push(p);if(p.action==='listStaff')return {status:'success',generation:logGeneration,staff:[{id:'dan',name:'Dan'},{id:'tara',name:'Tara'}]};if(staleLog)return {status:'error',code:'STALE_LOG',message:'Reload this page before signing in or clocking.'};if(p.staffId==='dan'&&p.pin!==pin)return {status:'error',code:'AUTH',message:'PIN not accepted'};
if(p.action==='changePin'){pin=p.newPin;initial=false;return {status:'success'};}
if(p.action==='login'&&initial&&p.staffId==='dan')return {status:'success',mustChange:true,profile:{id:'dan',name:'Dan',role:'Management'}};
if(['clockIn','clockOut','changeLocation'].includes(p.action)&&!saved.has(p.requestId)){saved.add(p.requestId);clockCalls++;if(p.action==='clockIn')working=true;if(p.action==='clockOut')working=false;}
if(p.action==='managementWeek')return {status:'success',week:'19/10/2026',summary:[{name:'Dan',recordedHours:3.63,recordedMinutes:218,ongoingHours:0.02,ongoingMinutes:1,pending:false}]};
if(p.action==='closeMissedShift'&&!saved.has(p.requestId)){saved.add(p.requestId);correctionCalls++;correctionOpen=false;}
if(p.action==='managementOpenShifts'||p.action==='closeMissedShift')return {status:'success',message:p.action==='closeMissedShift'?'Correction recorded':'',shifts:correctionOpen?[{shiftId:'open_shift_reference_001',staffId:'tara',name:'Tara',clockIn:'19/10/2026 09:00',location:'Choice building',locationStart:'19/10/2026 09:00',blocked:false}]:[]};
return {status:'success',profile:{id:p.staffId,name:p.staffId==='dan'?'Dan':'Tara',role:p.staffId==='dan'?'Management':'Staff'},locations:['Choice building','Working from home','Off-site work'],state:{working,clockIn:'19/10/2026 09:00',location:'Choice building',locationStart:'19/10/2026 09:00',note:''},week:{weekStarting:'19/10/2026',recordedHours:3.63,recordedMinutes:218,ongoingHours:working?0.02:0,ongoingMinutes:working?1:0,details:[{start:'19/10/2026 09:00',end:'19/10/2026 09:06',location:'Choice building',hours:0.11,minutes:6,note:''}]}};}
const client={Date:{now:()=>fakeNow},console,Uint8Array,crypto:webcrypto,confirm:()=>true,window:{scrollTo(){}},document:{getElementById:id=>nodes[id],querySelectorAll:()=>sections,createElement:()=>node(),addEventListener(){}},setTimeout:(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId;},clearTimeout:id=>timers.delete(id),setInterval(){},google:{script:{get run(){let success,failure;return {withSuccessHandler(fn){success=fn;return this;},withFailureHandler(fn){failure=fn;return this;},staffClockRequest(payload){const data=reply(payload);if(failReply&&['clockIn','closeMissedShift'].includes(payload.action)){failReply=false;failure();}else success(data);}};}}}};
vm.createContext(client);vm.runInContext(script,client);const run=text=>vm.runInContext(text,client),tick=()=>new Promise(resolve=>setImmediate(resolve));
async function login(id,code){nodes['staff-id'].value=id;nodes.pin.value=code;await nodes['login-form'].handlers.submit({preventDefault(){}});}
(async()=>{
// Formatting and displayed reports use whole minutes, including zero and hour carry.
for(const [minutes,expected]of [[0,'0 hrs 0 mins'],[1,'0 hrs 1 min'],[59,'0 hrs 59 mins'],[60,'1 hr 0 mins'],[61,'1 hr 1 min'],[218,'3 hrs 38 mins'],[1440,'24 hrs 0 mins']]){
 assert.equal(run('formatDuration('+minutes+')'),expected);
}
assert.equal(run('formatDuration(undefined,3.63)'),'3 hrs 38 mins');
assert.equal(run('formatDuration(undefined,0.999)'),'1 hr 0 mins');
assert.equal(run('formatDuration(6,0.11)'),'0 hrs 6 mins'); // no second rounding from decimal hours
assert.equal(run('formatDuration(-1)'),'—');
assert.equal(run('formatDuration(undefined,NaN)'),'—');
await tick();assert.equal(nodes['staff-id'].children.length,3);await login('dan',pin);assert(!nodes.change.hidden);assert.equal(nodes.pin.value,'');
nodes['new-pin'].value='918273';nodes['repeat-pin'].value='918273';await nodes['change-form'].handlers.submit({preventDefault(){}});assert(!nodes.login.hidden);assert.equal(run('auth'),null);assert.equal(nodes['new-pin'].value,'');
await login('dan',pin);assert(!nodes.dashboard.hidden);assert(!nodes['management-button'].hidden);assert.equal(nodes['week-date'].value,'2026-10-19');assert.equal(nodes['recorded-hours'].textContent,'3 hrs 38 mins');assert(nodes.periods.children[0].textContent.includes('0 hrs 6 mins'));
nodes.location.value='Choice building';nodes.note.value='';failReply=true;nodes['work-form'].handlers.submit({preventDefault(){}});await tick();assert(!nodes.problem.hidden);assert.equal(clockCalls,1);const original=requests.at(-1).requestId;
await nodes.retry.handlers.click();await tick();assert(!nodes.done.hidden);assert.equal(clockCalls,1);assert.equal(requests.at(-1).requestId,original);
await nodes['done-return'].handlers.click();await nodes['management-button'].handlers.click();assert(!nodes.management.hidden);assert.equal(nodes['team-rows'].children.length,1);assert.equal(nodes['team-rows'].children[0].children[1].textContent,'3 hrs 38 mins');assert.equal(nodes['team-rows'].children[0].children[2].textContent,'0 hrs 1 min');
await nodes['back-dashboard'].handlers.click();nodes['clock-out'].handlers.click();await tick();assert(!nodes.done.hidden);assert.equal(clockCalls,2);
await nodes['done-return'].handlers.click();await nodes['management-button'].handlers.click();await nodes['open-corrections'].handlers.click();assert(!nodes.corrections.hidden);nodes['correction-shift'].value='open_shift_reference_001';nodes['correction-shift'].handlers.change();assert(nodes['correction-info'].textContent.includes('Tara'));nodes['correction-finish'].value='19/10/2026 17:00';nodes['correction-reason'].value='Confirmed with staff member';failReply=true;nodes['correction-form'].handlers.submit({preventDefault(){}});await tick();assert(!nodes.problem.hidden);const correctionId=requests.at(-1).requestId;await nodes.retry.handlers.click();await tick();assert(!nodes.corrections.hidden);assert.equal(correctionCalls,1);assert.equal(requests.at(-1).requestId,correctionId);assert.equal(nodes['correction-finish'].value,'');assert(nodes['save-correction'].disabled);
nodes['done-lock'].handlers.click();assert(!nodes.login.hidden);assert.equal(run('auth'),null);assert.equal(nodes['recorded-hours'].textContent,'0 hrs 0 mins');assert.equal(nodes['team-rows'].children.length,0);assert.equal(nodes['week-date'].value,'');
await login('tara','586971');assert(!nodes.dashboard.hidden);assert(nodes['management-button'].hidden);nodes.location.value='Off-site work';nodes.location.handlers.change();assert(nodes.note.required);run('lockScreen()');assert.equal(nodes.pin.value,'');
// An already-open page must refresh the public generation after changeover.
assert.equal(requests.find(r=>r.action==='clockIn').generation,'test');
logGeneration='live_generation';staleLog=true;await login('tara','586971');
assert(!nodes.login.hidden);assert(!nodes['reload-staff'].hidden);assert.equal(run('auth'),null);
staleLog=false;await nodes['reload-staff'].handlers.click();await login('tara','586971');
assert.equal(requests.at(-1).generation,'live_generation');assert(!nodes.dashboard.hidden);
staleLog=true;await run('refreshState()');assert.equal(run('auth'),null);assert(!nodes['reload-staff'].hidden);
console.log('PASS: hours/minutes totals, minute precision, rollover, staff login/PIN changes, clock payloads, retry protection, management views, correction forms and same-reference correction retry, completed-form reset and locked-screen privacy, stale-page locking and generation refresh. Native validation and browser rendering require live checks.');
})().catch(error=>{console.error(error);process.exit(1);});
