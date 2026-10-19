const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
const properties=new Map([['KIOSK_KEY','manager-secret'],['RECEPTION_SPREADSHEET_ID','test-sheet']]);
const store={getProperty:k=>properties.get(k),setProperty:(k,v)=>properties.set(k,v)};
let sequence=0;const logs=[];
const context={
  console:{log:value=>logs.push(value)},
  Session:{getActiveUser:()=>({getEmail:()=>'editor'}),getEffectiveUser:()=>({getEmail:()=>'editor'})},
  SpreadsheetApp:{getActiveSpreadsheet:()=>({getId:()=>'test-sheet'})},
  PropertiesService:{getScriptProperties:()=>store},
  ScriptApp:{AuthMode:{FULL:'full'},requireScopes(){},getService:()=>({getUrl:()=>'https://example.invalid/exec'})},
  Utilities:{getUuid:()=>`${++sequence}`.padStart(36,'x'),DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(algorithm,value)=>Array.from(crypto.createHash('sha256').update(value).digest()).map(v=>v>127?v-256:v)}
};
vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/Code.gs','utf8'),context);
context.createIpadLink();const first=logs.at(-1).split('#device=')[1];
assert(context.isReceptionKey_(first,store,'manager-secret'));
assert(!context.isReceptionKey_('wrong',store,'manager-secret'));
assert(!context.isReceptionKey_('',store,'manager-secret'));
assert(context.isReceptionKey_('manager-secret',store,'manager-secret'));
assert(!properties.get('IPAD_TOKEN_HASH').includes(first));
context.createIpadLink();const second=logs.at(-1).split('#device=')[1];
assert.notEqual(first,second);assert(!context.isReceptionKey_(first,store,'manager-secret'));assert(context.isReceptionKey_(second,store,'manager-secret'));
assert(context.isReceptionKey_('manager-secret',store,'manager-secret'));
context.Session.getActiveUser=()=>({getEmail:()=>''});
assert.throws(()=>context.createIpadLink(),/Run this from/);
assert.equal(context.deviceTokenHash_('abc'),crypto.createHash('sha256').update('abc').digest('hex'));
console.log('PASS: private-link generation, hash matching, bad-token rejection, old-link revocation, manager-key preservation and editor-only generation. No real credentials used.');
