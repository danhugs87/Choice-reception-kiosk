// Archive-before-clear checks with fake sheets. No live data is accessed.
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const code=fs.readFileSync(__dirname+'/GoLive.gs','utf8');
function scenario(options={}){
 const props=new Map([['STAFF_SPREADSHEET_ID','staff-id'],['STAFF_PIN_dan','private-hash'],['STAFF_PIN_PEPPER','private-pepper'],['STAFF_DEVICE_KEY','keep-device'],['STAFF_BREAK_POLICY','PAID_NO_DEDUCTION']]);
 const sheets=new Map(),events=[],messages=[];let locked=false,copies=0,clears=0;
 const clone=rows=>rows.map(r=>r.map(v=>v instanceof Date?new Date(v):v));
 function make(name,data){
  const sheet={name,data:clone(data),getName(){return this.name;},getLastRow(){let n=this.data.length;while(n&&this.data[n-1].every(v=>v===''||v===undefined))n--;return n;},getLastColumn(){return this.data[0].length;},
   getDataRange(){return {getValues:()=>clone(this.data.slice(0,this.getLastRow())),getFormulas:()=>this.data.slice(0,this.getLastRow()).map(r=>r.map(()=>''))};},
   getRange(r,c,n=1,m=1){return {clearContent(){assert.equal(copies,4);assert(locked);if(options.clearFailure&&++clears===2)throw Error('Clear unavailable');events.push('clear:'+name);for(let i=0;i<n;i++)for(let j=0;j<m;j++)sheet.data[r-1+i][c-1+j]='';}};},
   copyTo(){assert(locked);copies++;events.push('copy:'+name);if(options.copyFailure&&copies===2)throw Error('Copy unavailable');const copy=make('Copy '+name,this.data);if(options.badCopy&&copies===1)copy.data[1][0]='damaged';return copy;},
   setName(n){sheets.delete(this.name);this.name=n;sheets.set(n,this);return this;},setTabColor(){return this;}
  };sheets.set(name,sheet);return sheet;
 }
 const heads={Staff:['Staff ID','Name','Role','Email','Enabled'],Shifts:['Shift ID','Staff ID','Clock in','Clock out','Status','Clock-in request ID','Clock-out request ID'],Work_Segments:['Segment ID','Shift ID','Staff ID','Location','Start time','End time','Work description','Request ID'],Corrections:['Correction ID','Shift ID','Segment ID','Changed at','Changed by','Reason','Previous data','New data','Result']};
 const ops=['Request ID','Staff ID','Action','Requested at','Intent JSON','Status','Result'];
 make('Staff',[heads.Staff,['dan','Dan','Management','owner@example.test',true]]);
 make('Shifts',[heads.Shifts,['test-shift','dan',new Date('2026-10-20T08:00:00Z'),new Date('2026-10-20T08:05:00Z'),'Closed','in-request','out-request']]);
 make('Work_Segments',[heads.Work_Segments,['test-segment','test-shift','dan','Choice building',new Date('2026-10-20T08:00:00Z'),new Date('2026-10-20T08:05:00Z'),'','in-request']]);
 make('Operations',[ops,['in-request','dan','clockIn',new Date(),'{}','Applied','Saved']]);
 make('Corrections',[heads.Corrections,...(options.emptyCorrections?[]:[['correction','test-shift','test-segment',new Date(),'dan','test','{}','{}','Applied']])]);
 if(options.badHeaders)sheets.get('Operations').data[0][0]='Wrong header';
 if(options.visitorProject)props.set('RECEPTION_SPREADSHEET_ID','visitor');
 const names=['Shifts','Work_Segments','Operations','Corrections'],originals=names.map(n=>JSON.stringify(sheets.get(n).getDataRange().getValues())),staffBefore=JSON.stringify(sheets.get('Staff').data);
 const ss={name:'Choice Staff Timekeeping - Test',getId:()=>'staff-id',getSheetByName:n=>sheets.get(n),rename(n){if(options.renameFailure)throw Error('Rename unavailable');this.name=n;}};
 const ui={Button:{OK:'OK'},ButtonSet:{OK_CANCEL:'OK_CANCEL'},alert:t=>messages.push(t),prompt(){
  if(options.concurrentEdit)sheets.get('Shifts').data[1][1]='edited';
  return {getSelectedButton:()=>options.cancel?'Cancel':'OK',getResponseText:()=>options.wrongPhrase?'YES':'TEST ONLY'};
 }};
 const p={getProperty:k=>props.get(k),setProperty(k,v){
   if(options.markerFailure&&k==='STAFF_GO_LIVE_CHECKPOINT'&&JSON.parse(v).phase==='complete')throw Error('Final marker unavailable');
   props.set(k,v);
 }};
 const ctx={Date,console:{log(){},error(){}},SC_HEADERS:heads,SC_OPERATION_HEADERS:ops,scPinOwner_(){if(options.denied)throw Error('Owner only');return {ss};},scValidateHeaders_(sheet,headings){assert(sheet);assert.deepEqual(sheet.data[0],headings);},PropertiesService:{getScriptProperties:()=>p},SpreadsheetApp:{getUi:()=>ui,flush(){}},LockService:{getScriptLock:()=>({waitLock(){assert(!locked);locked=true;},releaseLock(){locked=false;}})},Utilities:{formatDate:()=> '20261020_101000',getUuid:()=> 'new-live-generation'}};
 vm.createContext(ctx);vm.runInContext(code,ctx);ctx.prepareLiveStaffClock();
 return {ctx,props,sheets,events,messages,ss,originals,names,staffBefore,isLocked:()=>locked};
}
let s=scenario();assert(!s.isLocked());assert.equal(s.ss.name,'Choice Staff Timekeeping');assert(s.props.has('STAFF_LIVE_PREPARED_AT'));assert.equal(s.props.get('STAFF_DATA_GENERATION'),'new-live-generation');
for(const [i,n] of s.names.entries()){assert.equal(s.sheets.get(n).getLastRow(),1);assert.equal(JSON.stringify(s.sheets.get('Archive_'+n+'_20261020_101000').getDataRange().getValues()),s.originals[i]);}
assert.equal(JSON.stringify(s.sheets.get('Staff').data),s.staffBefore);
for(const [k,v] of [['STAFF_PIN_dan','private-hash'],['STAFF_PIN_PEPPER','private-pepper'],['STAFF_DEVICE_KEY','keep-device'],['STAFF_BREAK_POLICY','PAID_NO_DEDUCTION']])assert.equal(s.props.get(k),v);
const before=s.events.length;s.ctx.prepareLiveStaffClock();assert.equal(s.events.length,before);
for(const options of [{cancel:true},{wrongPhrase:true},{denied:true},{badHeaders:true},{visitorProject:true},{copyFailure:true},{badCopy:true},{concurrentEdit:true}]){
 s=scenario(options);assert(!s.events.some(e=>e.startsWith('clear:')));assert(!s.props.has('STAFF_LIVE_PREPARED_AT'));assert(!s.isLocked());
}
for(const options of [{clearFailure:true},{renameFailure:true},{markerFailure:true}]){
 s=scenario(options);assert(s.props.has('STAFF_GO_LIVE_CHECKPOINT'));assert.equal([...s.sheets.keys()].filter(n=>n.startsWith('Archive_')).length,4);assert(!s.isLocked());
 const events=s.events.length;s.ctx.prepareLiveStaffClock();assert.equal(s.events.length,events);assert(s.messages.at(-1).includes('needs review'));
}
s=scenario({emptyCorrections:true});assert(s.props.has('STAFF_LIVE_PREPARED_AT'));assert.equal(s.sheets.get('Corrections').getLastRow(),1);
console.log('PASS: all four archives verified before clearing, account/PIN preservation, cancellation and owner guards, concurrent edits, invalid layouts, archive failures, partial-clear/rename/final-marker checkpoints, repeat protection and empty logs. No live data modified.');
