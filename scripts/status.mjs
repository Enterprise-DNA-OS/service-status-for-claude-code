#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {getDb,REPO_ROOT} from './lib/db.mjs';
import {parseCsv,pick} from './lib/csv.mjs';
import {table} from './lib/format.mjs';
export const reports={
 'service-health':'select code,name,status,owner,open_incidents,maintenance_windows from service_health order by code',
 'update-due':'select code,name,status,owner,next_update_at,attention from update_queue order by next_update_at nulls first,code',
 'attention':"select code,name,attention as finding from update_queue where attention<>'scheduled' union all select code,name,'stale service review' from components where reviewed_at is null or reviewed_at<now()-interval '30 days' order by code",
 'maintenance':'select code,name,status,owner,scheduled_for,scheduled_until,components from maintenance_calendar order by scheduled_for,code',
 'overlaps':`select distinct a.code as first_window,b.code as second_window,c.name as component from events a join event_components x on x.event_id=a.id join event_components y on y.component_id=x.component_id join events b on b.id=y.event_id join components c on c.id=x.component_id where a.kind='maintenance' and b.kind='maintenance' and a.resolved_at is null and b.resolved_at is null and a.code<b.code and a.scheduled_for<b.scheduled_until and b.scheduled_for<a.scheduled_until order by first_window,second_window,component`,
 'owner-load':`select coalesce(nullif(owner,''),'Unassigned') as owner,count(*)::integer as open_events,count(*) filter(where next_update_at<now())::integer as overdue_updates from events where resolved_at is null group by owner order by open_events desc,owner`,
 'subscriber-review':'select * from subscriber_review where finding<>\'current\' order by code',
 'compliance':`select code,'PRIVACY-9' as rule,finding from subscriber_review where finding<>'current' union all select code,'OPS-OWNER','missing service owner' from components where owner='' union all select code,'OPS-UPDATE',attention from update_queue where attention<>'scheduled' order by code,rule`,
 'activity':'select entity,record_id,action,actor,note,created_at from activity order by created_at,id',
 'history':`select e.code,e.name,u.status,u.body,u.actor,u.occurred_at from updates u join events e on e.id=u.event_id order by u.occurred_at,e.code`,
};
export const commands=['help','list','show',...Object.keys(reports),'weekly-review','impact','add-component','set-component','add-incident','schedule-maintenance','log','resolve','review-subscriber','opt-out','import','export','draft-update','draft-maintenance'];
const kinds={components:'components',events:'events',subscribers:'subscribers',updates:'updates',activity:'activity'};
const required=(o,k)=>{const v=o[k];if(typeof v!=='string'||!v.trim())throw Error(`--${k} is required`);return v.trim();};
const date=(v,label)=>{if(!v||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(v)||!Number.isFinite(Date.parse(v)))throw Error(`${label} needs an ISO timestamp with timezone`);return new Date(v).toISOString();};
const day=(v)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)throw Error('review-on needs YYYY-MM-DD');return v;};
const idCode=(prefix)=>prefix+'-'+randomUUID().slice(0,8).toUpperCase();
async function resolve(db,kind,ref,lock=false){
 if(!['components','events','subscribers'].includes(kind))throw Error('kind must be components, events or subscribers');
 if(!ref)throw Error('--ref is required');
 const name=kind==='subscribers'?'contact':'name';
 let rows=await db.query(`select * from ${kind} where lower(code)=lower($1) or id::text=$1${lock?' for update':''}`, [ref]);
 if(!rows.length)rows=await db.query(`select * from ${kind} where starts_with(id::text,lower($1)) or position(lower($1) in lower(${name}))>0 order by code${lock?' for update':''}`, [ref]);
 if(rows.length!==1)throw Error(rows.length?`Ambiguous ${ref}: ${rows.map(r=>r.code+' '+r[name]).join('; ')}`:`No ${kind} match: ${ref}`);
 return rows[0];
}
async function audit(db,kind,before,after,actor,action,note=''){await db.query('insert into activity(entity,record_id,action,actor,before_data,after_data,note) values($1,$2,$3,$4,$5,$6,$7)',[kind,(after||before).id,action,actor,before?JSON.stringify(before):null,after?JSON.stringify(after):null,note]);}
async function transaction(db,fn,dry=false){await db.exec('BEGIN');try{const result=await fn();await db.exec(dry?'ROLLBACK':'COMMIT');return result;}catch(e){await db.exec('ROLLBACK');throw e;}}
async function linkComponents(db,event,refs){for(const ref of refs){const c=await resolve(db,'components',ref);await db.query('insert into event_components(event_id,component_id) values($1,$2) on conflict do nothing',[event.id,c.id]);}}
function contact(channel,value){const s=String(value||'').trim();if(channel==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))throw Error('Invalid subscriber email');if(channel==='sms'&&!/^\+[1-9]\d{6,14}$/.test(s))throw Error('SMS needs an international phone number');if(channel==='webhook'){let u;try{u=new URL(s);}catch{throw Error('Invalid webhook URL');}if(u.protocol!=='https:'||u.username||u.password)throw Error('Webhook requires HTTPS without credentials');}return channel==='email'?s.toLowerCase():s;}
const canonical=(v)=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));

async function importStatuspage(db,o){
 const file=required(o,'file'),actor=required(o,'actor');
 const raw=fs.readFileSync(file,'utf8');let data;
 if(path.extname(file).toLowerCase()==='.csv')data={subscribers:parseCsv(raw)};
 else {data=JSON.parse(raw);if(Array.isArray(data))data={subscribers:data};}
 if(!data||typeof data!=='object'||!['components','incidents','scheduled_maintenances','subscribers'].some(k=>Array.isArray(data[k])))throw Error('Expected a Statuspage export or public API response');
 const counts={inserted:0,unchanged:0,updated:0};
 return transaction(db,async()=>{
  for(const key of ['components','incidents','scheduled_maintenances','subscribers']){
   if(data[key]!==undefined&&!Array.isArray(data[key]))throw Error(`${key} must be an array`);
   const seen=new Set();
   for(const row of data[key]||[]){
    if(!row||typeof row!=='object'||Array.isArray(row))throw Error('Invalid export row');
    let kind,values,sourceId;
    if(key==='subscribers'){
     kind='subscribers';const channel=pick(row,'channel','type')||(pick(row,'email','Email Address')?'email':pick(row,'phone_number')?'sms':pick(row,'endpoint')?'webhook':'');
     if(!['email','sms','webhook'].includes(channel))throw Error('Subscriber needs email, phone_number or endpoint');
     const value=contact(channel,pick(row,'contact',channel,'Email Address',...(channel==='sms'?['phone_number']:channel==='webhook'?['endpoint']:[])));
     sourceId=String(pick(row,'id')||`${channel}:${value}`);values={code:idCode('SUB'),channel,contact:value,state:'review',source_id:sourceId,source_data:JSON.stringify(row)};
    } else if(key==='components'){
     kind='components';sourceId=String(row.id||'');if(!sourceId||!row.name)throw Error('Component needs id and name');
     values={code:'SP-'+sourceId,name:row.name,status:row.status||'operational',description:row.description||'',source_id:sourceId,source_data:JSON.stringify(row)};
    }else{
     kind='events';sourceId=String(row.id||'');if(!sourceId||!row.name)throw Error('Incident needs id and name');
     const type=key==='scheduled_maintenances'||['scheduled','in_progress','verifying','completed'].includes(row.status)?'maintenance':'incident';
     const started=date(row.started_at||row.created_at,'started_at');
     const closed=['resolved','completed'].includes(row.status);
     const end=closed?date(row.resolved_at||row.scheduled_until||row.updated_at,'resolved_at'):null;
     values={code:'SP-'+sourceId,name:row.name,kind:type,status:row.status,impact:row.impact||'none',started_at:started,resolved_at:end,scheduled_for:type==='maintenance'?date(row.scheduled_for,'scheduled_for'):null,scheduled_until:type==='maintenance'?date(row.scheduled_until,'scheduled_until'):null,source_id:sourceId,source_data:JSON.stringify(row)};
    }
    if(seen.has(sourceId))throw Error(`Duplicate ${key} source id: ${sourceId}`);seen.add(sourceId);
    let old=(await db.query(`select * from ${kind} where source_id=$1 for update`,[sourceId]))[0];
    if(!old&&kind==='subscribers')old=(await db.query('select * from subscribers where channel=$1 and contact=$2 for update',[values.channel,values.contact]))[0];
    if(old&&equal(old.source_data,row)){counts.unchanged++;continue;}
    if(old&&!o.update)throw Error(`Changed ${kind} ${old.code}: use --update after review`);
    if(old){delete values.code;if(kind==='subscribers'){if(old.state==='opted_out')values.state='opted_out';else if(old.contact!==values.contact || old.channel!==values.channel || !equal(old.source_data?.component_ids,row.component_ids))values.state='review';else delete values.state;}}
    const cols=Object.keys(values),params=Object.values(values);
    let after;
    if(old){after=(await db.query(`update ${kind} set ${cols.map((c,i)=>`${c}=$${i+1}`).join(',')} where id=$${cols.length+1} returning *`,[...params,old.id]))[0];counts.updated++;}
    else{after=(await db.query(`insert into ${kind} (${cols.join(',')}) values(${cols.map((_,i)=>'$'+(i+1)).join(',')}) returning *`,params))[0];counts.inserted++;}
    await audit(db,kind,old,after,actor,'import');
    if(kind==='events'){
     // Source component IDs must already exist, so incomplete snapshots fail atomically.
     await db.query('delete from event_components where event_id=$1',[after.id]);
     for(const component of row.components||[]){const source=typeof component==='string'?component:component.id;const c=(await db.query('select id from components where source_id=$1',[source]))[0];if(!c)throw Error(`Missing imported component ${source}; import components first`);await db.query('insert into event_components(event_id,component_id) values($1,$2) on conflict do nothing',[after.id,c.id]);}
     for(const u of row.incident_updates||[]){if(!u.id||!u.body)throw Error('Incident update needs id and body');const prior=(await db.query('select * from updates where source_id=$1',[u.id]))[0];if(prior&&prior.event_id!==after.id)throw Error('Update belongs to a different incident');
      await db.query('insert into updates(event_id,body,status,actor,occurred_at,source_id) values($1,$2,$3,$4,$5,$6) on conflict(source_id) do update set body=excluded.body,status=excluded.status,occurred_at=excluded.occurred_at',[after.id,u.body,u.status||row.status,'Statuspage import',date(u.display_at||u.created_at,'update created_at'),u.id]);}
    }
    // Imported subscriptions remain in review; original component IDs are preserved for explicit mapping.
   }
  }
  return [{...counts,dry_run:Boolean(o['dry-run'])}];
 },Boolean(o['dry-run']));
}
export async function run(db,cmd,o={},pos=[]){
 if(!commands.includes(cmd))throw Error(`Unknown command ${cmd}; run help`);
 const allowed=new Set(['json',...(commandFlags[cmd]||[])]);for(const key of Object.keys(o)){if(!allowed.has(key))throw Error(`--${key} is not valid for ${cmd}`);if(['json','dry-run','update'].includes(key)&&o[key]!==true)throw Error(`--${key} is a switch, not a value`);}
 if(cmd==='help')return commands.map(command=>({command,usage:usage[command]||`status ${command} [--json]`}));
 if(reports[cmd])return db.query(reports[cmd]);
 if(cmd==='list'){const k=o.kind||'events';if(!kinds[k])throw Error('Unknown --kind');return db.query(`select * from ${kinds[k]} order by ${['updates','activity'].includes(k)?'created_at,id':'code'}`);}
 if(cmd==='show')return [await resolve(db,o.kind||'events',o.ref)];
 if(cmd==='weekly-review'){const out=[];for(const name of ['update-due','overlaps','service-health','subscriber-review'])for(const row of await db.query(reports[name]))out.push({section:name,...row});return out;}
 if(cmd==='impact'){
  const e=await resolve(db,'events',required(o,'ref'));
  return db.query(`select c.code,c.name,c.status,count(distinct s.id)::integer as eligible_subscribers from event_components ec join components c on c.id=ec.component_id left join subscribers s on s.state='active' and s.review_on>=current_date and (not exists(select 1 from subscriber_components sc where sc.subscriber_id=s.id) or exists(select 1 from subscriber_components sc where sc.subscriber_id=s.id and sc.component_id=c.id)) where ec.event_id=$1 group by c.id order by c.code`,[e.id]);
 }
 if(cmd==='import'){if(pos[0]!=='statuspage')throw Error('Use import statuspage');return importStatuspage(db,o);}
 if(cmd==='export')return transaction(db,async()=>{
  await db.exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
  const file=required(o,'file');let result;
  if(o.kind){if(!kinds[o.kind])throw Error('Unknown --kind');result=await db.query(`select * from ${kinds[o.kind]} order by id`);}else{result={};for(const t of ['components','events','event_components','updates','subscribers','subscriber_components','activity'])result[t]=await db.query(`select * from ${t} order by id`);}
  let content=JSON.stringify(result,null,2)+'\n';if(file.endsWith('.csv')){if(!Array.isArray(result))throw Error('CSV export requires --kind');const keys=result.length?Object.keys(result[0]):[];const cell=v=>'"'+String(v==null?'':typeof v==='object'?JSON.stringify(v):v).replace(/"/g,'""')+'"';content=[keys.map(cell).join(','),...result.map(r=>keys.map(k=>cell(r[k])).join(','))].join('\r\n')+'\r\n';}
  fs.mkdirSync(path.dirname(path.resolve(file)),{recursive:true,mode:0o700});fs.writeFileSync(file,content,{flag:'wx',mode:0o600});return [{file:path.resolve(file),records:Array.isArray(result)?result.length:Object.values(result).reduce((n,a)=>n+a.length,0)}];
 });
 if(cmd.startsWith('draft-')){
  const e=await resolve(db,'events',required(o,'ref'));if(cmd==='draft-maintenance'&&e.kind!=='maintenance')throw Error('Choose a maintenance window');
  const history=await db.query('select body,status,occurred_at from updates where event_id=$1 order by occurred_at,id',[e.id]);
  const body=`# Draft for human review: ${e.name}\n\nStatus: ${e.status}\nOwner: ${e.owner||'Unassigned'}\nNext update: ${e.next_update_at?new Date(e.next_update_at).toISOString():'Not recorded'}\n${e.kind==='maintenance'?`Window: ${new Date(e.scheduled_for).toISOString()} to ${new Date(e.scheduled_until).toISOString()}\n`:''}\n${history.map(u=>`${new Date(u.occurred_at).toISOString()} (${u.status}): ${u.body}`).join('\n\n')||'No update text has been recorded. Supply verified facts before use.'}\n\nGenerated from recorded facts. Check current status, wording and recipients before use. Nothing has been sent or published.\n`;
  const dir=path.join(process.env.OUTPUT_DIR||REPO_ROOT,'drafts');fs.mkdirSync(dir,{recursive:true,mode:0o700});const file=path.join(dir,`${e.code}-${randomUUID().slice(0,8)}.md`);fs.writeFileSync(file,body,{flag:'wx',mode:0o600});return [{file}];
 }
 const actor=required(o,'actor');
 return transaction(db,async()=>{
  if(cmd==='add-component'){
   const after=(await db.query('insert into components(code,name,owner,description,reviewed_at) values($1,$2,$3,$4,now()) returning *',[o.code||idCode('COMP'),required(o,'name'),required(o,'owner'),o.description||'']))[0];await audit(db,'components',null,after,actor,cmd);return [after];
  }
  if(cmd==='set-component'){
   const old=await resolve(db,'components',required(o,'ref'),true);const after=(await db.query('update components set status=$1,owner=$2,reviewed_at=now() where id=$3 returning *',[required(o,'status'),o.owner??old.owner,old.id]))[0];await audit(db,'components',old,after,actor,cmd,required(o,'note'));return [after];
  }
  if(['add-incident','schedule-maintenance'].includes(cmd)){
   const maintenance=cmd==='schedule-maintenance';const refs=required(o,'components').split(',').map(s=>s.trim());
   const from=maintenance?date(required(o,'from'),'from'):null,to=maintenance?date(required(o,'to'),'to'):null;
   const next=date(required(o,'next-update'),'next-update');if(Date.parse(next)<=Date.now())throw Error('next-update must be in the future');
   if(maintenance&&(Date.parse(from)<=Date.now()||to<=from))throw Error('Maintenance needs a future start and later finish');
   const after=(await db.query('insert into events(code,name,kind,status,impact,owner,next_update_at,scheduled_for,scheduled_until) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *',[o.code||idCode(maintenance?'MW':'INC'),required(o,'name'),maintenance?'maintenance':'incident',maintenance?'scheduled':'investigating',o.impact||'minor',required(o,'owner'),next,from,to]))[0];
   await linkComponents(db,after,refs);await audit(db,'events',null,after,actor,cmd);return [after];
  }
  if(cmd==='log'||cmd==='resolve'){
   const old=await resolve(db,'events',required(o,'ref'),true);if(old.resolved_at)throw Error('Event is already closed');
   const status=cmd==='resolve'?(old.kind==='incident'?'resolved':'completed'):required(o,'status');
   if(cmd==='log'&&['resolved','completed'].includes(status))throw Error('Use resolve to close an event');
   const allowed=old.kind==='incident'?{investigating:['investigating','identified','monitoring'],identified:['identified','investigating','monitoring'],monitoring:['monitoring','investigating','identified']}:{scheduled:['scheduled','in_progress'],in_progress:['in_progress','verifying'],verifying:['verifying','in_progress']};
   if(cmd==='log'&&!allowed[old.status]?.includes(status))throw Error('Invalid status transition');
   if(cmd==='resolve'&&old.kind==='maintenance'&&old.status!=='verifying')throw Error('Verify maintenance before completion');
   const next=cmd==='resolve'?null:date(required(o,'next-update'),'next-update');if(next&&Date.parse(next)<=Date.now())throw Error('next-update must be in the future');
   if(cmd==='log'&&old.kind==='maintenance'&&status==='in_progress'&&Date.now()<new Date(old.scheduled_for).getTime())throw Error('Maintenance has not reached its start time');
   const note=required(o,'note');await db.query('insert into updates(event_id,body,status,actor) values($1,$2,$3,$4)',[old.id,note,status,actor]);
   const after=(await db.query('update events set status=$1,next_update_at=$2,resolved_at=case when $3 then now() else null end,owner=$4 where id=$5 returning *',[status,next,cmd==='resolve',o.owner??old.owner,old.id]))[0];await audit(db,'events',old,after,actor,cmd,note);return [after];
  }
  if(cmd==='review-subscriber'||cmd==='opt-out'){
   const old=await resolve(db,'subscribers',required(o,'ref'),true);let after;
   if(cmd==='opt-out')after=(await db.query("update subscribers set state='opted_out',evidence=$1,review_on=current_date where id=$2 returning *",[required(o,'evidence'),old.id]))[0];
   else {if(old.state==='opted_out')throw Error('Opted-out subscriber cannot be reactivated by review');const review=day(required(o,'review-on'));if(review<new Date().toISOString().slice(0,10))throw Error('review-on must be today or later');after=(await db.query("update subscribers set state='active',purpose=$1,evidence=$2,review_on=$3 where id=$4 returning *",[required(o,'purpose'),required(o,'evidence'),review,old.id]))[0];
    if(o.components){const refs=o.components==='all'?[]:o.components.split(',').map(s=>s.trim());await db.query('delete from subscriber_components where subscriber_id=$1',[old.id]);for(const ref of refs){const c=await resolve(db,'components',ref);await db.query('insert into subscriber_components(subscriber_id,component_id) values($1,$2) on conflict do nothing',[old.id,c.id]);}}
    else if(old.state==='review')throw Error('--components=all or component names required when reviewing an import');
   }
   await audit(db,'subscribers',old,after,actor,cmd);return [after];
  }
  throw Error('Unsupported operation');
 });
}
const commandFlags={
 list:['kind'],show:['kind','ref'],impact:['ref'],
 'add-component':['name','owner','actor','code','description'],
 'set-component':['ref','status','owner','note','actor'],
 'add-incident':['code','name','owner','components','next-update','impact','actor'],
 'schedule-maintenance':['code','name','owner','components','next-update','impact','from','to','actor'],
 log:['ref','status','note','next-update','owner','actor'],resolve:['ref','note','owner','actor'],
 'review-subscriber':['ref','purpose','evidence','review-on','components','actor'],
 'opt-out':['ref','evidence','actor'],import:['file','actor','dry-run','update'],export:['file','kind'],
 'draft-update':['ref'],'draft-maintenance':['ref'],
};
const usage={
 list:'list [--kind=events|components|subscribers|updates|activity]',show:'show --ref=CODE [--kind=events|components|subscribers]',impact:'impact --ref=INC-101',
 'add-component':'add-component --name=NAME --owner=NAME --actor=NAME [--code=CODE]',
 'set-component':'set-component --ref=API --status=operational --note=FACT --actor=NAME',
 'add-incident':'add-incident --name=NAME --owner=NAME --components=API --next-update=ISO --actor=NAME',
 'schedule-maintenance':'schedule-maintenance --name=NAME --owner=NAME --components=PORTAL --from=ISO --to=ISO --next-update=ISO --actor=NAME',
 log:'log --ref=CODE --status=identified --note=FACT --next-update=ISO --actor=NAME',resolve:'resolve --ref=CODE --note=FACT --actor=NAME',
 'review-subscriber':'review-subscriber --ref=CODE --purpose=TEXT --evidence=REF --review-on=DATE --components=API --actor=NAME',
 'opt-out':'opt-out --ref=CODE --evidence=REF --actor=NAME',import:'import statuspage --file=PATH --actor=NAME [--dry-run] [--update]',export:'export --file=NEW_PATH [--kind=components]',
 'draft-update':'draft-update --ref=INC-101','draft-maintenance':'draft-maintenance --ref=MW-201',
};
const flags=new Set(['json','kind','ref','name','owner','actor','code','description','status','note','components','impact','next-update','from','to','purpose','evidence','review-on','file','dry-run','update']);
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 let db;const args=process.argv.slice(2),cmd=args.shift()||'help',o={},pos=[];
 try{for(const arg of args){if(!arg.startsWith('--')){pos.push(arg);continue;}const [key,...rest]=arg.slice(2).split('=');if(!flags.has(key))throw Error(`Unknown flag --${key}`);if(key in o)throw Error(`Repeated flag --${key}`);o[key]=rest.length?rest.join('='):true;if(!['json','dry-run','update'].includes(key)&&o[key]===true)throw Error(`--${key} requires a value`);}
  if(pos.length&&(cmd!=='import'||pos.length!==1))throw Error('Unexpected positional arguments');
  db=await getDb();const result=await run(db,cmd,o,pos);console.log(o.json?JSON.stringify(result,null,2):table(result,Object.keys(result[0]||{result:''}).filter(k=>!['source_data','before_data','after_data'].includes(k)).map(k=>({key:k,label:k,width:80,format:v=>v instanceof Date?v.toISOString():typeof v==='object'?JSON.stringify(v):v}))));
 }catch(e){console.error(o.json?JSON.stringify({error:e.message}):e.message);process.exitCode=1;}finally{if(db)await db.close();}
}
