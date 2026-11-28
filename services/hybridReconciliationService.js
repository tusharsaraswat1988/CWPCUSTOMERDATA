'use strict';

const db=require('../db');
const repos=require('../db/repositories');
const recovery=require('./hybridRecoveryService');

async function markManual(client,m,c,category,message,actor){
  await client.query(`UPDATE public.hybrid_membership_components SET status='reconciliation_required',error_category=$2,safe_error_message=$3,error=$3,next_retry_at=NULL,lease_expires_at=NULL,updated_at=now() WHERE id=$1`,[c.id,category,message]);
  await client.query(`INSERT INTO public.hybrid_membership_events(membership_id,component_id,event_type,from_status,to_status,error_category,safe_message,actor) VALUES($1,$2,'reconciliation_required',$3,'reconciliation_required',$4,$5,$6)`,[m.id,c.id,c.status,category,message,actor]);
  await recovery.recompute(client,m.id,actor);
}
async function inspectSee(client,m,c){
  const cfg=c.component_config,svc=await repos.seeCatalogue.findServiceById(cfg.serviceId,client),sale=`HYB:${m.id}:initial`;
  const snap=await repos.seeEntitlement.findSnapshotBySaleReference(sale,client);
  if(!snap)return{exists:false,safeToCreate:true};
  const accts=await repos.seeEntitlement.findAccountsBySnapshotId(snap.id,client),qty=Number(cfg.creditsPerCycle);
  if(!svc||snap.customer_id!==m.customer_id||String(snap.vehicle_id)!==String(m.vehicle_id)||accts.length!==1||accts[0].customer_id!==m.customer_id||String(accts[0].vehicle_id)!==String(m.vehicle_id)||accts[0].status!=='active'||accts[0].service_id!==svc.id||Number(accts[0].purchased_qty)!==qty)return{conflict:true,category:'see_snapshot_account_mismatch'};
  const ledger=await repos.seeEntitlement.findLedgerByIdempotencyKey(accts[0].id,`hybrid:${m.id}:initial:see:${svc.id}`,client);
  if(!ledger||ledger.entry_type!=='purchase'||Number(ledger.quantity)!==qty)return{conflict:true,category:'see_ledger_mismatch'};
  return{exists:true,ref:accts[0].id};
}
async function reconcileMembership(id,{actor='admin'}={}){
  const m=await db.query('SELECT * FROM public.hybrid_memberships WHERE id=$1',[id]);if(!m.rows[0])throw Object.assign(new Error('Hybrid membership not found.'),{statusCode:404});
  const membership=m.rows[0];if(['cancelled','expired'].includes(membership.status))return{membership:await recovery.getMembership(id),classification:'terminal_membership',repaired:false};
  const comps=await db.query('SELECT * FROM public.hybrid_membership_components WHERE membership_id=$1 ORDER BY component_key',[id]);const findings=[];let manual=false;
  const expected={DCC:comps.rows.filter(c=>c.engine==='DCC'),SEE:comps.rows.filter(c=>c.engine==='SEE')};
  if(expected.DCC.length!==1||expected.SEE.length!==1||comps.rows.length!==2){
    for(const c of comps.rows)await db.withTransaction(client=>markManual(client,membership,c,'component_linkage_mismatch','Hybrid membership must have exactly one DCC component and one SEE component.',actor));
    if(!comps.rows.length)await db.withTransaction(async client=>{await client.query(`UPDATE public.hybrid_memberships SET status='reconciliation_required',updated_at=now() WHERE id=$1`,[id]);await client.query(`INSERT INTO public.hybrid_membership_events(membership_id,event_type,from_status,to_status,error_category,safe_message,actor) VALUES($1,'reconciliation_required',$2,'reconciliation_required','component_linkage_mismatch','Hybrid membership has no component records.', $3)`,[id,membership.status,actor]);});
    findings.push({state:'manual_review',reason:'component_cardinality_mismatch'});
    const result=await recovery.getMembership(id);
    await db.withTransaction(client=>client.query(`INSERT INTO public.hybrid_membership_events(membership_id,event_type,to_status,details,actor) VALUES($1,'reconciliation_completed',$2,$3,$4)`,[id,result.status,JSON.stringify({classification:'manual_review',findings}),actor]));
    return{membership:result,classification:'manual_review',findings,repaired:false};
  }
  for(const c of comps.rows){
    if(c.engine==='DCC'){
      const linked=await repos.subscriptions.findByHybridMembershipId(id);
      if(linked.length>1){await db.withTransaction(client=>markManual(client,membership,c,'duplicate_dcc_links','Multiple DCC subscriptions link to this membership.',actor));findings.push({component:'DCC',state:'manual_review',reason:'duplicate_links'});manual=true;continue;}
      if(linked.length===1){const sub=linked[0];if(sub.customer_id!==membership.customer_id||sub.status!=='active'){await db.withTransaction(client=>markManual(client,membership,c,'dcc_state_mismatch','Linked DCC subscription is not active or belongs to a different customer.',actor));findings.push({component:'DCC',state:'manual_review',reason:'engine_state_mismatch'});manual=true;continue;}await db.withTransaction(async client=>{await client.query(`UPDATE public.hybrid_membership_components SET status='active',engine_record_id=$2,error=NULL,error_category=NULL,safe_error_message=NULL,updated_at=now() WHERE id=$1`,[c.id,sub.id]);await client.query(`INSERT INTO public.hybrid_membership_events(membership_id,component_id,event_type,from_status,to_status,details,actor) VALUES($1,$2,'reconciled_component',$3,'active',$4,$5)`,[id,c.id,c.status,JSON.stringify({engineRecordId:sub.id}),actor]);await recovery.recompute(client,id,actor);});findings.push({component:'DCC',state:'consistent',engineRecordId:sub.id});}
      else if(membership.status==='active'||c.status==='active'||c.status==='reconciliation_required'){await db.withTransaction(client=>markManual(client,membership,c,'active_dcc_missing','Hybrid component is marked active or requires review but its DCC subscription is missing.',actor));findings.push({component:'DCC',state:'manual_review',reason:'active_engine_record_missing'});manual=true;}
      else {findings.push({component:'DCC',state:'missing',safeToRetry:true});}
    }else if(c.engine==='SEE'){
      const inspect=await db.withTransaction(client=>inspectSee(client,membership,c));
      if(inspect.conflict){await db.withTransaction(client=>markManual(client,membership,c,inspect.category,'SEE snapshot, account, or ledger does not match the saved component configuration.',actor));findings.push({component:'SEE',state:'manual_review',reason:inspect.category});manual=true;}
      else if(inspect.exists){await db.withTransaction(async client=>{await client.query(`UPDATE public.hybrid_membership_components SET status='active',engine_record_id=$2,error=NULL,error_category=NULL,safe_error_message=NULL,updated_at=now() WHERE id=$1`,[c.id,inspect.ref]);await client.query(`INSERT INTO public.hybrid_membership_events(membership_id,component_id,event_type,from_status,to_status,details,actor) VALUES($1,$2,'reconciled_component',$3,'active',$4,$5)`,[id,c.id,c.status,JSON.stringify({engineRecordId:inspect.ref}),actor]);await recovery.recompute(client,id,actor);});findings.push({component:'SEE',state:'consistent',engineRecordId:inspect.ref});}
      else if(membership.status==='active'||c.status==='active'||c.status==='reconciliation_required'){await db.withTransaction(client=>markManual(client,membership,c,'active_see_missing','Hybrid component is marked active or requires review but its SEE purchase record is missing.',actor));findings.push({component:'SEE',state:'manual_review',reason:'active_engine_record_missing'});manual=true;}
      else findings.push({component:'SEE',state:'missing',safeToRetry:true});
    }
  }
  const current=await recovery.getMembership(id);const incomplete=current.components.filter(c=>c.status!=='active');
  if(!manual&&incomplete.length&& !['cancelled','expired','reconciliation_required'].includes(current.status)){
    await recovery.retry(id,{actor});
    findings.push({classification:'safe_retry_attempted'});
  }
  const result=await recovery.getMembership(id);const classification=manual?'manual_review':result.status==='active'?'consistent_or_repaired':'recovery_pending';
  await db.withTransaction(client=>client.query(`INSERT INTO public.hybrid_membership_events(membership_id,event_type,to_status,details,actor) VALUES($1,'reconciliation_completed',$2,$3,$4)`,[id,result.status,JSON.stringify({classification,findings}),actor]));
  return{membership:result,classification,findings,repaired:classification==='consistent_or_repaired'};
}
async function reconcileAll({actor='admin',limit=100}={}){const rows=await db.query(`SELECT id FROM public.hybrid_memberships WHERE status NOT IN ('cancelled','expired') ORDER BY updated_at DESC LIMIT $1`,[Math.min(Math.max(Number(limit)||100,1),200)]);const results=[];for(const m of rows.rows)results.push(await reconcileMembership(m.id,{actor}));return results;}
module.exports={reconcileMembership,reconcileAll,inspectSee};
