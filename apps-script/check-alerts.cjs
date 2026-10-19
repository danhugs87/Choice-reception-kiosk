// Runs the real backend against mocked Sheets and MailApp. Sends no email.
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const visits=[['Visit ID','Name','Car Registration','Visit Type','Practitioner or Activity','Arrival Time','Departure Time','Status','Request ID']];
const alerts=[['Visit ID','Practitioner','Email status','Attempt time','Detail']];
let locked=false,uuid=0,quota=100,mailFailure=false,logFailure=false,attempts=[];
const properties={KIOSK_KEY:'test-key',RECEPTION_SPREADSHEET_ID:'test-sheet',ARRIVAL_ALERTS_ENABLED:'true'};
function sheet(rows,isAlert){return {
  getLastRow:()=>rows.length,getLastColumn:()=>rows[0].length,
  getDataRange:()=>({getValues:()=>rows.map(row=>row.slice())}),
  getRange:(r,c,n=1,m=1)=>({getValues:()=>rows.slice(r-1,r-1+n).map(row=>row.slice(c-1,c-1+m)),setValues:values=>values.forEach((row,i)=>row.forEach((v,j)=>{rows[r-1+i][c-1+j]=v;}))}),
  appendRow:row=>{if(isAlert&&logFailure)throw Error('Log unavailable');rows.push(row);}
};}
const ss={getId:()=>'test-sheet',getSheetByName:name=>name==='Visits'?sheet(visits,false):sheet(alerts,true)};
const scopes=[];
const context={Date,console:{log(){},error(){}},SpreadsheetApp:{openById:()=>ss,getActiveSpreadsheet:()=>ss,flush(){}},PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties[k],setProperty:(k,v)=>{properties[k]=v;}})},
LockService:{getScriptLock:()=>({waitLock(){assert(!locked);locked=true;},hasLock:()=>locked,releaseLock(){locked=false;}})},
Utilities:{getUuid:()=>`test_visit_${String(++uuid).padStart(12,'0')}`,formatDate:()=> '19/10/2026 14:00'},
MailApp:{getRemainingDailyQuota:()=>quota,sendEmail:message=>{attempts.push(message);if(mailFailure)throw Error('Service failure');}},
ScriptApp:{AuthMode:{FULL:'full'},requireScopes:(mode,list)=>scopes.push(...list)},Session:{getActiveUser:()=>({getEmail:()=>'owner'}),getEffectiveUser:()=>({getEmail:()=>'owner'})}};
vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/Code.gs','utf8'),context);
let sequence=0;
function payload(host,type='Appointment'){return {key:'test-key',action:'signIn',requestId:`request_test_${String(++sequence).padStart(8,'0')}`,name:'Fictional Visitor',carReg:'SECRET CAR REG',visitType:type,destination:host};}
function submit(p){const result=context.receptionRequest(p);assert.equal(result.status,'success');assert(!locked);return result;}
for(const host of ['Tara','Louise','Tracey','Hayley','Dan']){
  const p=payload(host);const result=submit(p);assert.equal(result.notification,'Submitted');assert.equal(attempts.at(-1).to,host.toLowerCase()+'@choicewellbeingservice.org');
  assert(attempts.at(-1).body.includes('Fictional Visitor'));assert(attempts.at(-1).body.includes('19/10/2026 14:00'));assert(!attempts.at(-1).body.includes(p.carReg));
  const count=attempts.length,rows=visits.length;assert(submit(p).alreadySaved);assert.equal(attempts.length,count);assert.equal(visits.length,rows);
}
assert.equal(attempts.length,5);
submit(payload('Coffee morning','Community activity'));submit(payload('Delivery','Other visit'));assert.equal(attempts.length,5);
properties.ARRIVAL_ALERTS_ENABLED='false';assert.equal(submit(payload('Dan')).notification,'Disabled');assert.equal(attempts.length,5);properties.ARRIVAL_ALERTS_ENABLED='true';
mailFailure=true;const failed=payload('Dan'),beforeFailure=visits.length;assert.equal(submit(failed).notification,'Not confirmed');assert.equal(visits.length,beforeFailure+1);assert.equal(alerts.at(-1)[2],'Not confirmed');
const count=attempts.length;submit(failed);assert.equal(attempts.length,count);mailFailure=false;
quota=0;assert.equal(submit(payload('Dan')).notification,'Not sent');assert.equal(attempts.length,count);assert.equal(alerts.at(-1)[2],'Not sent');quota=100;
logFailure=true;assert.equal(submit(payload('Dan')).notification,'Not confirmed');assert.equal(attempts.length,count);logFailure=false;
const rows=visits.length;assert.equal(context.receptionRequest({...payload('Dan'),key:'wrong'}).status,'error');assert.equal(visits.length,rows);
assert.equal(context.receptionRequest({...payload('Nobody'),destination:'Nobody'}).status,'error');assert.equal(visits.length,rows);
context.setupArrivalAlerts();assert(scopes.includes('https://www.googleapis.com/auth/script.send_mail'));assert.equal(attempts.length,count);
console.log('PASS: five exact recipients, appointment-only notifications, no mail on retries, attendance preserved after email/quota/log failures, alert statuses, access checks, permission setup without sending, and no registration in email. No real email sent.');
