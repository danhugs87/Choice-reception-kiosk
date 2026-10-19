// Backup-before-clear checks using mocked Sheets, without touching live data.
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync(__dirname+'/GoLive.gs','utf8');new vm.Script(source);
function scenario(options={}){
  const props=new Map([['KIOSK_KEY','keep-key'],['IPAD_TOKEN_HASH','keep-token'],['ARRIVAL_ALERTS_ENABLED','true']]);
  const sheets=new Map(),events=[],messages=[];let locked=false,copies=0,clears=0,denied=!!options.denied;
  const clone=data=>data.map(row=>row.map(v=>v instanceof Date?new Date(v):v));
  function make(name,data){const sheet={name,data:clone(data),getName(){return this.name;},getLastRow(){let i=this.data.length;while(i>0&&this.data[i-1].every(v=>v===''||v===undefined))i--;return i;},getLastColumn(){return Math.max(...this.data.map(row=>row.length));},getMaxRows:()=>1000,
    getDataRange(){return {getValues:()=>clone(this.data.slice(0,this.getLastRow()))};},
    getRange(...args){let [r,c,n=1,m=1]=args;if(typeof r==='string'){const x=/([A-Z])(\d+)/.exec(r);r=Number(x[2]);c=x[1].charCodeAt(0)-64;}
      return {getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>sheet.data[r-1+i]?.[c-1+j]??'')),
      setFormula:value=>{sheet.data[r-1]??=[];sheet.data[r-1][c-1]=value;},
      clearContent:()=>{if(name!=='Weekly_Summary'){assert.equal(copies,3,'All backups must precede clearing');if(options.clearFailure&&++clears===2)throw Error('Clear unavailable');events.push('clear:'+name);}
        for(let i=0;i<n;i++)for(let j=0;j<m;j++){sheet.data[r-1+i]??=[];sheet.data[r-1+i][c-1+j]='';}}};},
    copyTo(){copies++;events.push('copy:'+name);if(options.copyFailure&&copies===2)throw Error('Copy unavailable');const copy=make('Copy '+name,this.data);if(options.badCopy&&copies===1)copy.data[1][0]='corrupted';return copy;},
    setName(newName){sheets.delete(this.name);this.name=newName;sheets.set(newName,this);return this;},setTabColor(){return this;}};sheets.set(name,sheet);return sheet;}
  make('Visits',[['Visit ID','Name','Car Registration','Visit Type','Practitioner or Activity','Arrival Time','Departure Time','Status','Request ID'],['test_visit','Test','','Community activity','Coffee morning',new Date('2026-10-19T10:00:00Z'),'','Signed in','request_test']]);
  make('Arrival_Alerts',[['Visit ID','Practitioner','Email status','Attempt time','Detail'],['test_visit','Dan','Submitted',new Date(),'test']]);
  make('Visit_Corrections',[['Correction ID','Visit ID','Corrected at','Corrected by','Previous status','Previous departure','Recorded departure','New status','Reason','Result'],['correction_test','test_visit',new Date(),'owner','Signed in','','','Closed by staff - time unknown','test','Applied']]);
  const summary=make('Weekly_Summary',Array.from({length:29},()=>['','']));summary.data[28][0]='TEST REPORT: includes fictional visits recorded during setup.';
  const ss={getSheetByName:name=>sheets.get(name),rename:name=>{ss.name=name;},name:'Choice Reception - Test'};
  const ui={Button:{OK:'OK'},ButtonSet:{OK_CANCEL:'OK_CANCEL'},alert:message=>messages.push(message),prompt:()=>{
    if(options.concurrentEdit)sheets.get('Visits').data[1][1]='Edited during prompt';
    return {getSelectedButton:()=>options.cancel?'CANCEL':'OK',getResponseText:()=>'TEST ONLY'};
  }};
  const context={Date,console:{log(){},error(){}},staffContext_:()=>{if(denied)throw Error('Not owner');return {ss};},PropertiesService:{getScriptProperties:()=>({getProperty:key=>props.get(key),setProperty:(key,value)=>props.set(key,value)})},SpreadsheetApp:{getUi:()=>ui,flush(){}},LockService:{getScriptLock:()=>({waitLock(){assert(!locked);locked=true;},releaseLock(){locked=false;}})},Utilities:{formatDate:()=> '20261019_143000'},validateHeaders_:sheet=>assert(sheet),validateAlertHeaders_:sheet=>assert(sheet),validateCorrectionHeaders_:sheet=>assert(sheet)};
  vm.createContext(context);vm.runInContext(source,context);
  const originals=['Visits','Arrival_Alerts','Visit_Corrections'].map(name=>JSON.stringify(sheets.get(name).data));
  context.prepareLiveReception();return {context,props,sheets,ss,events,messages,originals,isLocked:()=>locked};
}
let s=scenario();assert(!s.isLocked());assert.equal(s.ss.name,'Choice Reception - Attendance');assert(s.props.has('RECEPTION_LIVE_PREPARED_AT'));assert.equal(s.props.get('KIOSK_KEY'),'keep-key');assert.equal(s.props.get('IPAD_TOKEN_HASH'),'keep-token');assert.equal(s.props.get('ARRIVAL_ALERTS_ENABLED'),'true');
for(const [index,name] of ['Visits','Arrival_Alerts','Visit_Corrections'].entries()){assert.equal(s.sheets.get(name).getLastRow(),1);assert.equal(JSON.stringify(s.sheets.get('Archive_'+name+'_20261019_143000').data),s.originals[index]);}
assert(s.events.findIndex(e=>e.startsWith('clear:'))>s.events.map(e=>e.startsWith('copy:')).lastIndexOf(true));assert.equal(s.sheets.get('Weekly_Summary').data[28][0],'');
const count=s.events.length;s.context.prepareLiveReception();assert.equal(s.events.length,count);
for(const options of [{cancel:true},{denied:true},{badCopy:true},{copyFailure:true},{concurrentEdit:true}]){s=scenario(options);assert(!s.events.some(e=>e.startsWith('clear:')));assert(!s.props.has('RECEPTION_LIVE_PREPARED_AT'));assert(!s.isLocked());if(options.concurrentEdit)assert.equal(s.sheets.get('Visits').data[1][1],'Edited during prompt');}
s=scenario({clearFailure:true});assert(!s.props.has('RECEPTION_LIVE_PREPARED_AT'));assert(s.props.has('RECEPTION_GO_LIVE_CHECKPOINT'));assert.equal([...s.sheets.keys()].filter(name=>name.startsWith('Archive_')).length,3);const eventsBefore=s.events.length;s.context.prepareLiveReception();assert.equal(s.events.length,eventsBefore);assert(!s.isLocked());
console.log('PASS: verified backups before clearing, header/credential preservation, cancelled/unauthorised calls, concurrent edits, bad/failed copies, partial-clear checkpoint, repeat protection and report reset. No live data modified.');
