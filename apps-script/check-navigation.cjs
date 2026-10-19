// Navigation logic checks; Home Screen and Guided Access navigation need an iPad test.
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const mode=process.argv[2]||'visitor',source=process.argv[3]||__dirname+'/Kiosk.html';
const html=fs.readFileSync(source,'utf8'),script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const token='example_private_device_token_1234567890',requests=[];
function build(hash,storedKey=''){
  const nodes={};
  function node(id=''){return {id,hidden:true,value:'',textContent:'',children:[],handlers:{},attrs:{},setAttribute(k,v){this.attrs[k]=v;},append(...items){this.children.push(...items);},replaceChildren(){this.children=[];},addEventListener(e,f){this.handlers[e]=f;},reset(){},focus(){},querySelector(){return node();}};}
  for(const m of html.matchAll(/\bid="([^"]+)"/g))nodes[m[1]]=node(m[1]);
  const sections=[...html.matchAll(/<section id="([^"]+)"/g)].map(m=>nodes[m[1]]);
  const context={console,Date,Uint8Array,window:{scrollTo(){}},document:{getElementById:id=>nodes[id],querySelectorAll:q=>q.includes('section')||q==='section'?sections:[],createElement:()=>node(),addEventListener(){}},localStorage:{getItem:()=>storedKey,setItem(){throw Error('Unexpected credential persistence');}},setTimeout:()=>1,clearTimeout(){},setInterval(){},google:{script:{url:{getLocation:fn=>fn({hash})},get run(){let ok;return {withSuccessHandler(fn){ok=fn;return this;},withFailureHandler(){return this;},receptionRequest(p){requests.push(p);ok({status:'success',hosts:[],activities:[]});},staffClockRequest(p){requests.push(p);ok({status:'success',staff:[]});}};}}}};
  vm.createContext(context);vm.runInContext(script,context);
  return {nodes,run:s=>vm.runInContext(s,context)};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 if(mode==='visitor'){
   let c=build('device='+token);await tick();const link=c.nodes['staff-clock-link'];
   assert.equal(link.hidden,false);assert(link.href.endsWith('#receptionDevice='+token));
   assert(link.href.startsWith('https://script.google.com/a/macros/choicewellbeingservice.org/'));
   c.run('busy=true');let blocked=false;link.handlers.click({preventDefault(){blocked=true;}});assert(blocked);
   c=build('','manager_key_must_not_leave_reception');await tick();assert(c.nodes['staff-clock-link'].hidden);assert(!c.nodes['staff-clock-link'].href);
   c=build('device='+token+'&redirect=https://evil.invalid');await tick();assert(c.nodes['staff-clock-link'].hidden);
 }else{
   const c=build('receptionDevice='+token);await tick();const link=c.nodes['reception-return'];
   assert.equal(link.hidden,false);assert(link.href.endsWith('#device='+token));
   assert(link.href.startsWith('https://script.google.com/macros/s/AKfycbzKymNKF4ce'));
   assert(!JSON.stringify(requests).includes(token));
   c.run("auth={staffId:'dan',pin:'example-not-a-real-pin'};busy=true");let blocked=false;
   link.handlers.click({preventDefault(){blocked=true;}});assert(blocked);assert(c.run('!!auth'));
   c.run('busy=false');link.handlers.click({preventDefault(){throw Error('Return unexpectedly blocked');}});assert.equal(c.run('auth'),null);assert.equal(c.run('pending'),null);
   assert(build('').nodes['reception-return'].hidden);
   assert(build('receptionDevice='+token+'&redirect=https://evil.invalid').nodes['reception-return'].hidden);
   assert(build('receptionDevice=%3Cscript%3E').nodes['reception-return'].hidden);
 }
 assert(/target="_top"/.test(html));assert(!html.includes('target="_blank"'));
 console.log('PASS: '+mode+' navigation, fixed destinations, fragment validation, credential isolation and busy-action protection. iPad navigation remains a live check.');
})().catch(error=>{console.error(error);process.exit(1);});
