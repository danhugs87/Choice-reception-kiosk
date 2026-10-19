// Flow checks with a DOM stand-in; actual iPad layout remains a manual check.
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),{webcrypto}=require('crypto');
const html=fs.readFileSync(__dirname+'/Staff.html','utf8'),script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const nodes={};function node(id=''){return {id,hidden:true,value:'',textContent:'',children:[],handlers:{},setAttribute(){},append(...items){this.children.push(...items);},replaceChildren(){this.children=[];},addEventListener(e,f){this.handlers[e]=f;},reset(){const fields={'login-form':['staff-id','pin'],'change-form':['new-pin','repeat-pin'],'work-form':['location','note']}[id]||[];fields.forEach(field=>nodes[field].value='');}};}
for(const m of html.matchAll(/\bid="([^"]+)"/g))nodes[m[1]]=node(m[1]);const sections=[...html.matchAll(/<section id="([^"]+)"/g)].map(m=>nodes[m[1]]);
let fakeNow=1,working=false,initial=true,pin='293847',failReply=false,clockCalls=0;const saved=new Set(),timers=new Map();let timerId=0;
const requests=[];function reply(p){requests.push(p);if(p.action==='listStaff')return {status:'success',staff:[{id:'dan',name:'Dan'},{id:'tara',name:'Tara'}]};if(p.staffId==='dan'&&p.pin!==pin)return {status:'error',code:'AUTH',message:'PIN not accepted'};
if(p.action==='changePin'){pin=p.newPin;initial=false;return {status:'success'};}
if(p.action==='login'&&initial&&p.staffId==='dan')return {status:'success',mustChange:true,profile:{id:'dan',name:'Dan',role:'Management'}};
if(['clockIn','clockOut','changeLocation'].includes(p.action)&&!saved.has(p.requestId)){saved.add(p.requestId);clockCalls++;if(p.action==='clockIn')working=true;if(p.action==='clockOut')working=false;}
if(p.action==='managementWeek')return {status:'success',week:'19/10/2026',summary:[{name:'Dan',recordedHours:1,ongoingHours:0,pending:false}]};
return {status:'success',profile:{id:p.staffId,name:p.staffId==='dan'?'Dan':'Tara',role:p.staffId==='dan'?'Management':'Staff'},locations:['Choice building','Working from home','Off-site work'],state:{working,clockIn:'19/10/2026 09:00',location:'Choice building',locationStart:'19/10/2026 09:00',note:''},week:{weekStarting:'19/10/2026',recordedHours:1,ongoingHours:working?1:0,details:[]}};}
const client={Date:{now:()=>fakeNow},console,Uint8Array,crypto:webcrypto,confirm:()=>true,window:{scrollTo(){}},document:{getElementById:id=>nodes[id],querySelectorAll:()=>sections,createElement:()=>node(),addEventListener(){}},setTimeout:(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId;},clearTimeout:id=>timers.delete(id),setInterval(){},google:{script:{get run(){let success,failure;return {withSuccessHandler(fn){success=fn;return this;},withFailureHandler(fn){failure=fn;return this;},staffClockRequest(payload){const data=reply(payload);if(failReply&&payload.action==='clockIn'){failReply=false;failure();}else success(data);}};}}}};
vm.createContext(client);vm.runInContext(script,client);const run=text=>vm.runInContext(text,client),tick=()=>new Promise(resolve=>setImmediate(resolve));
async function login(id,code){nodes['staff-id'].value=id;nodes.pin.value=code;await nodes['login-form'].handlers.submit({preventDefault(){}});}
(async()=>{
await tick();assert.equal(nodes['staff-id'].children.length,3);await login('dan',pin);assert(!nodes.change.hidden);assert.equal(nodes.pin.value,'');
nodes['new-pin'].value='918273';nodes['repeat-pin'].value='918273';await nodes['change-form'].handlers.submit({preventDefault(){}});assert(!nodes.login.hidden);assert.equal(run('auth'),null);assert.equal(nodes['new-pin'].value,'');
await login('dan',pin);assert(!nodes.dashboard.hidden);assert(!nodes['management-button'].hidden);assert.equal(nodes['week-date'].value,'2026-10-19');
nodes.location.value='Choice building';nodes.note.value='';failReply=true;nodes['work-form'].handlers.submit({preventDefault(){}});await tick();assert(!nodes.problem.hidden);assert.equal(clockCalls,1);const original=requests.at(-1).requestId;
await nodes.retry.handlers.click();await tick();assert(!nodes.done.hidden);assert.equal(clockCalls,1);assert.equal(requests.at(-1).requestId,original);
nodes['done-return'].handlers.click();await nodes['management-button'].handlers.click();assert(!nodes.management.hidden);assert.equal(nodes['team-rows'].children.length,1);
await nodes['back-dashboard'].handlers.click();nodes['clock-out'].handlers.click();await tick();assert(!nodes.done.hidden);assert.equal(clockCalls,2);
nodes['done-lock'].handlers.click();assert(!nodes.login.hidden);assert.equal(run('auth'),null);assert.equal(nodes['recorded-hours'].textContent,'0.00');assert.equal(nodes['team-rows'].children.length,0);assert.equal(nodes['week-date'].value,'');
await login('tara','586971');assert(!nodes.dashboard.hidden);assert(nodes['management-button'].hidden);nodes.location.value='Off-site work';nodes.location.handlers.change();assert(nodes.note.required);run('lockScreen()');assert.equal(nodes.pin.value,'');
console.log('PASS: staff loading, forced PIN change, credential clearing, location/clock payloads, same-reference retry, management visibility, report loading and locked-screen data clearing. Native validation and browser rendering require live checks.');
})().catch(error=>{console.error(error);process.exit(1);});
