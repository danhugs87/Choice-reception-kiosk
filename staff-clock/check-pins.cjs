// Uses temporary fake accounts/services. Never creates or prints real PINs.
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
let time=Date.parse('2026-10-19T14:00:00Z'),locked=false,email='owner@example.test';
class Clock extends Date {constructor(...args){super(...(args.length?args:[time]));}static now(){return time;}}
const store=new Map([['STAFF_SPREADSHEET_ID','staff-id'],['STAFF_DEVICE_KEY','device-key']]),logs=[],errors=[];
const headers=['Staff ID','Name','Role','Email','Enabled'];
const rows=[headers,...[['dan','Dan','Management'],['tracey','Tracey','Management'],['hayley','Hayley','Management'],['tara','Tara','Staff'],['louise','Louise','Staff']].map(([id,name,role])=>[id,name,role,id+'@example.test',true])];
const sheet={getLastColumn:()=>5,getName:()=>'Staff',getRange:(r,c,n,m)=>({getValues:()=>rows.slice(r-1,r-1+n).map(row=>row.slice(c-1,c-1+m))}),getDataRange:()=>({getValues:()=>rows.map(row=>row.slice())})};
const ss={getId:()=>'staff-id',getOwner:()=>({getEmail:()=>'owner@example.test'}),getSheetByName:()=>sheet};
const props={getProperty:key=>store.get(key),setProperty:(key,value)=>store.set(key,value),deleteProperty:key=>store.delete(key)};
let promptId='dan';
const context={Date:Clock,console:{log:value=>logs.push(value),error:value=>errors.push(value)},ScriptApp:{AuthMode:{FULL:'full'},requireScopes(){}},SpreadsheetApp:{getActiveSpreadsheet:()=>ss,openById:id=>{assert.equal(id,'staff-id');return ss;},getUi:()=>({ButtonSet:{OK_CANCEL:'buttons'},Button:{OK:'ok'},prompt:()=>({getSelectedButton:()=>'ok',getResponseText:()=>promptId})})},PropertiesService:{getScriptProperties:()=>props},Session:{getActiveUser:()=>({getEmail:()=>email})},LockService:{getScriptLock:()=>({waitLock(){assert(!locked);locked=true;},hasLock:()=>locked,releaseLock(){locked=false;}})},Utilities:{getUuid:()=>crypto.randomUUID(),Charset:{UTF_8:'utf8'},computeHmacSha256Signature:(value,key)=>Array.from(crypto.createHmac('sha256',key).update(value).digest()).map(v=>v>127?v-256:v)}};
vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/Code.gs','utf8'),context);vm.runInContext(fs.readFileSync(__dirname+'/Pins.gs','utf8'),context);
context.setupStaffPins();const pins={};
for(const text of logs){const match=/PRIVATE initial PIN — (\w+): (\d{6})$/.exec(text);if(match)pins[match[1].toLowerCase()]=match[2];}
assert.equal(Object.keys(pins).length,5);assert.equal(new Set(Object.values(pins)).size,5);assert(!locked);
const snapshots=new Map(store);context.setupStaffPins();for(const [key,value] of snapshots)assert.equal(store.get(key),value);
for(const row of rows.slice(1)){
  const result=context.scVerifyPin_(row[0],pins[row[0]]);assert(result.ok);assert.equal(result.role,row[2]);assert(result.mustChange);assert(!('pin' in result));assert(!('hash' in result));
  const record=JSON.parse(store.get('STAFF_PIN_'+row[0]));assert.equal(record.hash.length,64);assert(!('pin' in record));assert(record.changedBy==='owner@example.test');
}
for(let i=0;i<4;i++){const result=context.scVerifyPin_('dan','000000');assert(!result.ok);assert(!result.message.includes('Too many'));}
assert(context.scVerifyPin_('dan','000000').message.includes('Too many'));assert(!context.scVerifyPin_('dan',pins.dan).ok);assert(!locked);
assert(context.scVerifyPin_('tara',pins.tara).ok);time+=5*60*1000+1;assert(context.scVerifyPin_('dan',pins.dan).ok);assert(!store.has('STAFF_PIN_ATTEMPTS_dan'));
context.scVerifyPin_('dan','000000');assert(context.scVerifyPin_('dan',pins.dan).ok);assert(!store.has('STAFF_PIN_ATTEMPTS_dan'));
rows[1][4]=false;assert(!context.scVerifyPin_('dan',pins.dan).ok);rows[1][4]=true;
const size=store.size;assert(!context.scVerifyPin_('unknown',pins.dan).ok);assert(!context.scVerifyPin_('../invalid',pins.dan).ok);assert.equal(store.size,size);
assert(!context.scVerifyPin_('dan',pins.tara).ok);assert(context.scVerifyPin_('dan',pins.dan).ok);
const oldVersion=JSON.parse(store.get('STAFF_PIN_dan')).version;context.resetStaffPin();const replacement=logs.findLast(text=>text.startsWith('PRIVATE replacement PIN')).match(/(\d{6})$/)[1];assert(!context.scVerifyPin_('dan',pins.dan).ok);assert(context.scVerifyPin_('dan',replacement).ok);assert.notEqual(JSON.parse(store.get('STAFF_PIN_dan')).version,oldVersion);
promptId='unknown';const state=JSON.stringify([...store]);assert.throws(()=>context.resetStaffPin(),/not found/);assert.equal(JSON.stringify([...store]),state);
email='other@example.test';assert.throws(()=>context.setupStaffPins(),/as its owner/);assert.throws(()=>context.resetStaffPin(),/as its owner/);email='owner@example.test';
const pepper=store.get('STAFF_PIN_PEPPER');store.delete('STAFF_PIN_PEPPER');assert.throws(()=>context.setupStaffPins(),/Existing PIN records/);assert(!store.has('STAFF_PIN_PEPPER'));store.set('STAFF_PIN_PEPPER',pepper);
store.set('STAFF_PIN_tara','broken-json');assert(!context.scVerifyPin_('tara',pins.tara).ok);assert(errors.every(text=>text==='Staff PIN check unavailable.'));assert(!locked);
console.log('PASS: five private unique codes, stored HMAC records, correct roles, mandatory-change flag, repeat preservation, account lockout/expiry, disabled/unknown accounts, reset invalidation, owner guards and no secret-bearing authentication errors. No real PINs printed or live data changed.');
