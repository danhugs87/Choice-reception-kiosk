// Verify generated report formulas against independent visit fixtures.
// This does not execute Google Sheets' calculation engine or verify rendering.
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const cells=new Map(),formula=new Map();let inserted=0,existing=false,locked=false;
function address(row,col){return String.fromCharCode(64+col)+row;}
const report={getRange(...args){
  const key=typeof args[0]==='string'?args[0]:address(args[0],args[1]);
  const range={setFormula:value=>{formula.set(key,value);return range;},setValues:values=>{values.forEach((r,i)=>r.forEach((value,j)=>cells.set(address(args[0]+i,args[1]+j),value)));return range;}};
  ['merge','setFontFamily','setFontSize','setVerticalAlignment','setFontWeight','setFontColor','setWrap','setNumberFormat','setBackground','setNote','setDataValidation'].forEach(method=>range[method]=()=>range);
  return range;
}};
['setColumnWidth','setRowHeights','setHiddenGridlines','setRowHeight','setFrozenRows'].forEach(method=>report[method]=()=>{});
const visits={};const ss={getId:()=>'test-sheet',getSpreadsheetTimeZone:()=>'Europe/London',getSheetByName:name=>name==='Visits'?visits:existing?report:null,insertSheet:name=>{assert.equal(name,'Weekly_Summary');existing=true;inserted++;return report;}};
const context={console:{log(){}},ScriptApp:{AuthMode:{FULL:'full'},requireScopes(){}},Session:{getActiveUser:()=>({getEmail:()=>'owner'}),getEffectiveUser:()=>({getEmail:()=>'owner'})},
PropertiesService:{getScriptProperties:()=>({getProperty:()=>'test-sheet'})},SpreadsheetApp:{getActiveSpreadsheet:()=>ss,flush(){},newDataValidation:()=>({requireDate(){return this;},setAllowInvalid(){return this;},setHelpText(){return this;},build(){return {};}})},
LockService:{getScriptLock:()=>({waitLock(){assert(!locked);locked=true;},releaseLock(){locked=false;}})},validateHeaders_:sheet=>assert.equal(sheet,visits),RECEPTION_HOSTS:['Tara','Louise','Tracey','Hayley','Dan'],RECEPTION_ACTIVITIES:['Dance class','Craft group','Coffee morning','Other activity']};
vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/Reports.gs','utf8'),context);context.setupWeeklySummary();
assert.equal(inserted,1);assert.equal(formula.get('B3'),'=TODAY()');
assert.equal(formula.get('B4'),'=IF(ISNUMBER(B3),INT(B3)-WEEKDAY(INT(B3),2)+1,"")');
assert.equal(formula.get('B5'),'=IF(ISNUMBER(B4),B4+6,"")');
const serial=iso=>Date.parse(iso)/86400000+25569;
const monday=serial('2026-10-19T00:00:00Z');
function visit(date,type,destination,departure){const row=[];row[3]=type;row[4]=destination;row[5]=serial(date);row[6]=departure||'';return row;}
const records=[
visit('2026-10-18T23:59:59Z','Appointment','Louise','saved'),
visit('2026-10-19T00:00:00Z','Appointment','Tara','saved'),
visit('2026-10-20T10:00:00Z','Appointment','Tara',''),
visit('2026-10-25T23:59:59Z','Community activity','Coffee morning','saved'),
visit('2026-10-26T00:00:00Z','Other visit','Delivery',''),
visit('2026-10-21T10:00:00Z','Community activity','Dance class',''),
visit('2026-10-22T10:00:00Z','Other visit','Delivery',''),
visit('2026-10-22T11:00:00Z','Community activity','Coffee morning',''),
visit('2026-10-23T11:00:00Z','Appointment','Dan','saved')];
function evaluate(cell,start,source=records){
  const match=/COUNTIFS\((.*)\),""\)$/.exec(formula.get(cell));assert(match,'Expected COUNTIFS formula');
  const args=match[1].split(',');assert.equal(args.length%2,0);
  return source.filter(row=>{
    for(let i=0;i<args.length;i+=2){
      const range=/^Visits!\$([A-Z])\$2:\$\1$/.exec(args[i]);assert(range,'Source range');
      const value=row[range[1].charCodeAt(0)-65],criterion=args[i+1];
      if(criterion==='">="&$B$4'){if(!(value>=start))return false;}
      else if(criterion==='"<"&($B$4+7)'){if(!(value<start+7))return false;}
      else {const expected=criterion.startsWith('"')?JSON.parse(criterion):cells.get(criterion);if(value!==expected)return false;}
    }
    return true;
  }).length;
}
assert.equal(evaluate('B8',monday),7);assert.equal(evaluate('B9',monday),3);assert.equal(evaluate('B10',monday),3);assert.equal(evaluate('B11',monday),1);assert.equal(evaluate('B12',monday),4);
assert.equal(evaluate('B15',monday),2);assert.equal(evaluate('B19',monday),1);assert.equal(evaluate('B22',monday),1);assert.equal(evaluate('B24',monday),2);
assert.equal(evaluate('B8',monday-7),1);assert.equal(evaluate('B8',monday+7),1);assert.equal(evaluate('B8',monday+14),0);assert.equal(evaluate('B8',monday,[]),0);
assert.equal(evaluate('B9',monday)+evaluate('B10',monday)+evaluate('B11',monday),evaluate('B8',monday));
const before=JSON.stringify([...formula]);context.setupWeeklySummary();assert.equal(inserted,1);assert.equal(JSON.stringify([...formula]),before);assert(!locked);
context.Session.getActiveUser=()=>({getEmail:()=>''});assert.throws(()=>context.setupWeeklySummary(),/Run this from/);
console.log('PASS: generated report formulas, all visit categories, practitioner/activity counts, Sunday end and Monday start boundaries, no-departure count, previous/next/empty weeks, repeat setup and editor guard. Live Google calculation and layout require verification.');
