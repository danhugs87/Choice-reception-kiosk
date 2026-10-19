// UI flow tests with a DOM stand-in. This does not verify browser layout.
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),{webcrypto}=require('crypto');
const html=fs.readFileSync(__dirname+'/Kiosk.html','utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script);new vm.Script(fs.readFileSync(__dirname+'/Code.gs','utf8'));
const nodes={};
function node(id=''){return {id,hidden:true,value:'',textContent:'',children:[],handlers:{},disabled:false,setAttribute(){},focus(){},replaceChildren(){this.children=[];},append(...kids){this.children.push(...kids);},addEventListener(e,fn){this.handlers[e]=fn;},querySelector(){return node();},reset(){({'in-form':['name','car','destination','other-reason'],'out-form':['out-name'],'pair-form':['device-key']}[id]||[]).forEach(key=>{nodes[key].value='';});}};}
for(const m of html.matchAll(/\bid="([^"]+)"/g))nodes[m[1]]=node(m[1]);
const sections=[...html.matchAll(/<section id="([^"]+)"/g)].map(m=>nodes[m[1]]),stored=new Map(),calls=[],saved=new Map();
let loseReply=false,closedId='';
const client={Date,console,Uint8Array,crypto:webcrypto,window:{crypto:webcrypto,scrollTo(){}},document:{getElementById:id=>nodes[id],querySelectorAll:s=>s==='fieldset > section'?sections:[],createElement:()=>node(),addEventListener(){}},localStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)},setTimeout:()=>1,clearTimeout(){},setInterval(){},google:{script:{get run(){let good,bad;return {withSuccessHandler(fn){good=fn;return this;},withFailureHandler(fn){bad=fn;return this;},receptionRequest(p){
  calls.push(p);
  if(p.key!=='test-key')return good({status:'error'});
  if(p.action==='config')return good({status:'success',hosts:['Tara','Dan'],activities:['Coffee morning','Dance class']});
  if(p.action==='signIn'){saved.set(p.requestId,p);if(loseReply){loseReply=false;return bad();}return good({status:'success'});}
  if(p.action==='findVisit')return good({status:'success',visits:p.name==='Nobody'?[]:[{visitId:'visit_reference_001',arrival:'10:00',visitType:'Community activity',destination:'Coffee morning'},{visitId:'visit_reference_002',arrival:'11:00',visitType:'Appointment',destination:'Tara'}]});
  if(p.action==='signOut'){closedId=p.visitId;return good({status:'success'});}
}};}}}};
vm.createContext(client);vm.runInContext(script,client);
const run=s=>vm.runInContext(s,client),visible=id=>!nodes[id].hidden,tick=()=>new Promise(resolve=>setImmediate(resolve));
async function signIn(type,name,destination){run(`chooseType(${JSON.stringify(type)})`);nodes.name.value=name;nodes[type==='Other visit'?'other-reason':'destination'].value=destination;nodes['in-form'].handlers.submit({preventDefault(){}});await tick();}
(async()=>{
  await run('connect("wrong",true)');assert(visible('pair'));assert.match(nodes['pair-message'].textContent,/not accepted/);
  await run('connect("test-key",true)');assert(visible('home'));assert.equal(stored.size,1);
  await signIn('Community activity','Test Visitor','Coffee morning');assert(visible('done'));assert.equal([...saved.values()][0].destination,'Coffee morning');
  run('home()');await signIn('Appointment','Test Visitor','Tara');assert.equal(saved.size,2);
  run('home()');nodes['out-name'].value='Test Visitor';await run('findVisit({preventDefault(){}})');assert(visible('matches'));assert.equal(nodes['visit-matches'].children.length,2);
  nodes['visit-matches'].children[0].handlers.click();assert(visible('confirm'));nodes['confirm-out'].handlers.click();await tick();assert(visible('done'));assert.equal(closedId,'visit_reference_001');
  run('home()');nodes['out-name'].value='Nobody';await run('findVisit({preventDefault(){}})');assert.match(nodes['out-message'].textContent,/couldn't find/);
  run('home()');loseReply=true;await signIn('Other visit','Delivery Test','Supplies delivery');assert(visible('problem'));assert.equal(saved.size,3);
  const original=calls.filter(p=>p.action==='signIn').at(-1).requestId;await run('submitPending()');assert(visible('done'));assert.equal(saved.size,3);assert.equal(calls.filter(p=>p.action==='signIn').at(-1).requestId,original);
  run('home()');assert.equal(nodes.name.value,'');assert.equal(nodes['out-name'].value,'');
  run('chooseType("Other visit")');assert(nodes.destination.disabled);assert(nodes['other-reason'].required);
  run('chooseType("Appointment")');assert(!nodes.destination.disabled);assert(nodes['other-reason'].disabled);
  assert(!html.includes('innerHTML'));assert(!html.includes('user-scalable=no'));
  console.log('PASS: syntax, device pairing, all visit types, correct request fields, duplicate-name choices, exact visit checkout, no-match message, same-reference retry, form clearing, field switching and safe text rendering. Browser/layout and live Google checks remain.');
})().catch(error=>{console.error(error);process.exit(1);});
