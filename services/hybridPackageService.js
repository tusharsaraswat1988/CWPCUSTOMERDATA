'use strict';

// Purchase flow: lock idempotency/payment references, validate the active package
// and registered customer/vehicle, then create the authoritative membership,
// DCC subscription, SEE snapshot/account/ledger, and component links in one
// PostgreSQL transaction. Any component failure rolls back the entire purchase;
// an identical retry therefore provisions once, while a changed replay conflicts.

const db = require('../db');
const repos = require('../db/repositories');
const dccService = require('./dccService');

const STATUSES = ['pending_provisioning','provisioning','active','renewal_pending','provisioning_failed','reconciliation_required','cancellation_pending','cancelled','expired'];
const ALLOWED_TRANSITIONS=Object.freeze({pending_provisioning:['provisioning','active','provisioning_failed','reconciliation_required','cancellation_pending','expired'],provisioning:['active','provisioning_failed','reconciliation_required','cancellation_pending','expired'],provisioning_failed:['provisioning','reconciliation_required','cancellation_pending','expired'],reconciliation_required:['active','provisioning_failed','cancellation_pending','expired'],active:['renewal_pending','cancellation_pending','expired','reconciliation_required'],renewal_pending:['active','reconciliation_required'],cancellation_pending:['expired','cancelled'],cancelled:[],expired:[]});
const day = (value = new Date()) => dccService.getIstDate(value);
const DEFAULT_RENEWAL_POLICY = Object.freeze({enabled:true,renewal_window_days:30,grace_period_days:0,price_mode:'original_purchase_price'});
function addPeriod(start, value, unit) {
  const [year,month,date]=day(start).split('-').map(Number);const d=new Date(Date.UTC(year,month-1,date));
  if(unit==='days')d.setUTCDate(d.getUTCDate()+Number(value));
  else {const months=unit==='years'?Number(value)*12:Number(value),targetMonth=d.getUTCMonth()+months;d.setUTCDate(1);d.setUTCMonth(targetMonth);const lastDay=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(date,lastDay));}
  return d.toISOString().slice(0,10);
}
function normalizeRenewalPolicy(policy={}){const p={...DEFAULT_RENEWAL_POLICY,...(policy||{})};p.enabled=p.enabled!==false;p.renewal_window_days=Number(p.renewal_window_days);p.grace_period_days=Number(p.grace_period_days||0);if(!Number.isInteger(p.renewal_window_days)||p.renewal_window_days<0||p.renewal_window_days>365)throw new Error('renewal_window_days must be an integer from 0 to 365.');if(p.grace_period_days!==0)throw new Error('Renewal grace periods are not supported by the current lifecycle policy.');if(!['original_purchase_price','current_package_price','fixed_price'].includes(p.price_mode))throw new Error('Unsupported hybrid renewal price mode.');if(p.price_mode==='fixed_price'&&(!Number.isFinite(Number(p.price))||Number(p.price)<0))throw new Error('A non-negative renewal price is required for fixed_price mode.');return p;}
function validateDefinition(data) {
  if (!data || !String(data.packageCode || '').trim() || !String(data.name || '').trim()) throw new Error('packageCode and name are required.');
  if (!Number.isFinite(Number(data.price)) || Number(data.price) < 0) throw new Error('price must be a non-negative number.');
  if (!data.dccConfig || !data.seeConfig || !data.seeConfig.serviceId || Number(data.seeConfig.creditsPerCycle) < 1) throw new Error('DCC and Car Wash component configuration is required.');
  if (!['days','months','years'].includes(data.validityUnit || 'months')) throw new Error('Invalid validityUnit.');
  return { ...data, packageCode: String(data.packageCode).trim().toUpperCase(), version: Number(data.version) || 1, validityValue: Number(data.validityValue) || 1, validityUnit: data.validityUnit || 'months', billingCycle: data.billingCycle || 'monthly', renewalPolicy:normalizeRenewalPolicy(data.renewalPolicy||DEFAULT_RENEWAL_POLICY) };
}
async function createPackage(data, actor = 'admin') {
  const p = validateDefinition(data);
  const r = await db.query(`INSERT INTO public.hybrid_packages (package_code,name,version,status,city_zone_eligibility,vehicle_segments,price,currency,validity_value,validity_unit,billing_cycle,dcc_config,see_config,credit_policy,activation_policy,cancellation_policy,renewal_policy,effective_from,effective_to,created_by)
    VALUES ($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
  [p.packageCode,p.name,p.version,JSON.stringify(p.cityZoneEligibility||{all_cities:true,cities:[],zones:[]}),JSON.stringify(p.vehicleSegments||[]),p.price,p.currency||'INR',p.validityValue,p.validityUnit,p.billingCycle,JSON.stringify(p.dccConfig),JSON.stringify(p.seeConfig),JSON.stringify(p.creditPolicy||{expiry:'cycle_end',rollover:false}),JSON.stringify(p.activationPolicy||{}),JSON.stringify(p.cancellationPolicy||{}),JSON.stringify(p.renewalPolicy||DEFAULT_RENEWAL_POLICY),p.effectiveFrom||null,p.effectiveTo||null,actor]);
  return r.rows[0];
}
async function listPackages({includeDrafts=false}={}) { const r=await db.query(`SELECT * FROM public.hybrid_packages ${includeDrafts?'':'WHERE status=\'active\''} ORDER BY package_code,version DESC`); return r.rows; }
async function updatePackage(id, changes) {
  const allowed=['name','price','currency','validity_value','validity_unit','billing_cycle','city_zone_eligibility','vehicle_segments','dcc_config','see_config','credit_policy','activation_policy','cancellation_policy','renewal_policy','effective_from','effective_to'];
  const parts=[], values=[id];
  if(changes.renewal_policy!==undefined)changes={...changes,renewal_policy:normalizeRenewalPolicy(changes.renewal_policy)};
  for(const key of allowed) if(changes[key]!==undefined){ values.push(['city_zone_eligibility','vehicle_segments','dcc_config','see_config','credit_policy','activation_policy','cancellation_policy','renewal_policy'].includes(key)?JSON.stringify(changes[key]):changes[key]); parts.push(`${key}=$${values.length}${['city_zone_eligibility','vehicle_segments','dcc_config','see_config','credit_policy','activation_policy','cancellation_policy','renewal_policy'].includes(key)?'::jsonb':''}`); }
  if(!parts.length) return (await db.query('SELECT * FROM public.hybrid_packages WHERE id=$1',[id])).rows[0]||null;
  const r=await db.query(`UPDATE public.hybrid_packages SET ${parts.join(',')}, updated_at=now() WHERE id=$1 AND status='draft' RETURNING *`,values); return r.rows[0]||null;
}
async function setPackageStatus(id,status) {
  if(!['draft','active','retired'].includes(status)) throw new Error('Invalid package status.');
  const r=await db.query(`UPDATE public.hybrid_packages SET status=$2,updated_at=now() WHERE id=$1 RETURNING *`,[id,status]); return r.rows[0]||null;
}
async function packageById(id, client) { const r=await client.query(`SELECT * FROM public.hybrid_packages WHERE id=$1 AND status='active' FOR SHARE`,[id]); return r.rows[0]||null; }
function assertEligibility(pkg,{city,zone,vehicleSegment}) {
  const eligibility=pkg.city_zone_eligibility||{};
  if(eligibility.all_cities===false && !(eligibility.cities||[]).some(x=>String(x).toLowerCase()===String(city||'').toLowerCase())) throw purchaseInvalid('Hybrid package is not available in this city.');
  if((eligibility.zones||[]).length && !eligibility.zones.some(x=>String(x).toLowerCase()===String(zone||'').toLowerCase())) throw purchaseInvalid('Hybrid package is not available in this zone.');
  if((pkg.vehicle_segments||[]).length && !pkg.vehicle_segments.some(x=>String(x).toLowerCase()===String(vehicleSegment||'').toLowerCase())) throw purchaseInvalid('Vehicle segment is not eligible for this hybrid package.');
}
function purchaseConflict(message) { const error=new Error(message);error.code='HYBRID_PURCHASE_CONFLICT';error.statusCode=409;return error; }
function purchaseInvalid(message,statusCode=400) { const error=new Error(message);error.code='HYBRID_PURCHASE_INVALID';error.statusCode=statusCode;return error; }
function assertSamePurchase(existing, facts) {
  const same=String(existing.package_id)===String(facts.packageId)&&String(existing.customer_id)===String(facts.customerId)&&String(existing.vehicle_id)===String(facts.vehicleId)&&String(existing.location_id||'')===String(facts.locationId||'')&&String(existing.city||'').toLowerCase()===String(facts.city||'').toLowerCase()&&String(existing.zone||'').toLowerCase()===String(facts.zone||'').toLowerCase()&&(facts.price===undefined||facts.price===null||Number(existing.price)===Number(facts.price))&&(facts.paymentReference===undefined||String(existing.payment_reference||'')===String(facts.paymentReference||''));
  if(!same)throw purchaseConflict('This idempotency or payment reference is already associated with a different purchase.');
}
async function provisionSee(client, membership, pkg, cycleKey, actor) {
  const s=pkg.see_config;
  const service=await repos.seeCatalogue.findServiceById(s.serviceId,client);
  if(!service || service.status !== 'active' || String(service.service_category_id).toLowerCase()!=='car_washing') throw new Error('Hybrid SEE component must reference an active Car Wash service.');
  const saleRef=`HYB:${membership.id}:${cycleKey}`;
  const start=membership.renews_at;
  const validTo=addPeriod(start,Number(pkg.validity_value),pkg.validity_unit);
  const snap=await repos.seeEntitlement.createPurchaseSnapshot({saleReference:saleRef,customerId:membership.customer_id,vehicleId:membership.vehicle_id,locationId:membership.location_id,packageId:null,packageVersion:membership.package_version,packageCode:pkg.package_code,packageName:pkg.name,serviceDefinitions:[{service_id:service.id,service_category_id:'car_washing',quantity:Number(s.creditsPerCycle),hybrid_membership_id:membership.id}],quantities:{purchaseUnits:1,benefits:[{serviceId:service.id,quantity:Number(s.creditsPerCycle)}]},validity:{value:pkg.validity_value,unit:pkg.validity_unit,validFrom:start,validTo},vehicleSegment:membership.vehicle_segment,city:membership.city,zone:membership.zone,basePrice:pkg.price,finalPrice:pkg.price,terms:{hybridMembershipId:membership.id,cycleKey},createdBy:actor,status:'active',purchasedAt:start},client);
  const account=await repos.seeEntitlement.createEntitlementAccount({purchaseSnapshotId:snap.id,customerId:membership.customer_id,vehicleId:membership.vehicle_id,locationId:membership.location_id,serviceId:service.id,entitlementKind:'wash_credit',purchasedQty:Number(s.creditsPerCycle),validFrom:start,validTo},client);
  await repos.seeEntitlement.insertLedgerEntry({entitlementAccountId:account.id,entryType:'purchase',quantity:Number(s.creditsPerCycle),balanceAfter:Number(s.creditsPerCycle),referenceType:'hybrid_membership',referenceId:membership.id,saleReference:saleRef,idempotencyKey:`hybrid:${membership.id}:${cycleKey}:see:${service.id}`,reason:`Hybrid ${pkg.package_code} cycle wash credits`,actor},client);
  return account.id;
}
async function purchase(input={},requestedActor='admin') {
  const {packageId,customerId,vehicleId,locationId=null,city,zone,vehicleSegment,idempotencyKey,paymentReference,price}=input;
  const actor=input.actor||requestedActor||'admin';
  if(!idempotencyKey||String(idempotencyKey).trim().length<8||String(idempotencyKey).length>120) throw purchaseInvalid('A stable idempotencyKey between 8 and 120 characters is required.');
  if(!packageId||!customerId||!vehicleId)throw purchaseInvalid('packageId, customerId, and vehicleId are required.');
  if(paymentReference&&String(paymentReference).length>120)throw purchaseInvalid('paymentReference must be 120 characters or fewer.');
  const facts={packageId,customerId,vehicleId,locationId,city,zone,price,paymentReference};
  const result=await db.withTransaction(async client=>{
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`hybrid:${idempotencyKey}`]);
    const duplicate=await client.query('SELECT * FROM public.hybrid_memberships WHERE idempotency_key=$1',[idempotencyKey]);
    if(duplicate.rows[0]){assertSamePurchase(duplicate.rows[0],facts);return{membershipId:duplicate.rows[0].id,idempotentReplay:true};}
    if(paymentReference){
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`hybrid-payment:${paymentReference}`]);
      const paymentDuplicate=await client.query('SELECT * FROM public.hybrid_memberships WHERE payment_reference=$1 FOR UPDATE',[paymentReference]);
      if(paymentDuplicate.rows[0]){assertSamePurchase(paymentDuplicate.rows[0],facts);return{membershipId:paymentDuplicate.rows[0].id,idempotentReplay:true};}
    }
    const pkg=await packageById(packageId,client); if(!pkg) throw purchaseInvalid('Active hybrid package version not found.',404);
    if(pkg.effective_from && day(pkg.effective_from)>day() || pkg.effective_to && day(pkg.effective_to)<day()) throw purchaseInvalid('Hybrid package is outside its effective dates.');
    if(!Number.isFinite(Number(pkg.price))||Number(pkg.price)<0)throw purchaseInvalid('Hybrid package price is invalid.');
    if(!Number.isInteger(Number(pkg.see_config?.creditsPerCycle))||Number(pkg.see_config.creditsPerCycle)<1)throw purchaseInvalid('Hybrid package credit configuration is invalid.');
    if(!['monthly','quarterly','annual'].includes(pkg.billing_cycle))throw purchaseInvalid('Hybrid package billing cycle is invalid.');
    const customer=await repos.customers.findById(customerId,client); if(!customer||customer.deleted_at||customer.is_active===false) throw purchaseInvalid('Active customer not found.',404);
    const vehicle=await repos.vehicles.findById(vehicleId,client); if(!vehicle||vehicle.customer_id!==customerId||vehicle.is_active===false) throw purchaseInvalid('Vehicle ownership validation failed.',403);
    const storedSegments=[vehicle.seater_type,vehicle.vehicle_type].map(x=>String(x||'').trim()).filter(Boolean);
    if(vehicleSegment&&storedSegments.length&&!storedSegments.some(x=>x.toLowerCase()===String(vehicleSegment).toLowerCase()))throw purchaseInvalid('Submitted vehicle segment does not match the registered vehicle.');
    const allowedSegments=pkg.vehicle_segments||[];
    const resolvedSegment=allowedSegments.length?storedSegments.find(x=>allowedSegments.some(a=>String(a).toLowerCase()===x.toLowerCase())):storedSegments[0]||'';
    assertEligibility(pkg,{city,zone,vehicleSegment:resolvedSegment});
    if(Number(price)!==Number(pkg.price)&&price!==undefined&&price!==null)throw purchaseConflict('Package price changed. Refresh the package before completing purchase.');
    if(locationId){const loc=await repos.serviceLocations.findById(locationId,client);if(!loc||loc.customer_id!==customerId||loc.is_active===false)throw purchaseInvalid('Service location ownership validation failed.',403);}
    const start=day(); const cycleMonths={monthly:1,quarterly:3,annual:12}[pkg.billing_cycle]||1; const renews=addPeriod(start,cycleMonths,'months');
    const created=await client.query(`INSERT INTO public.hybrid_memberships(idempotency_key,payment_reference,package_id,package_version,package_snapshot,customer_id,vehicle_id,location_id,city,zone,vehicle_segment,price,currency,status,starts_at,renews_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pending_provisioning',$14,$15) RETURNING *`,[idempotencyKey,paymentReference||null,pkg.id,pkg.version,JSON.stringify(pkg),customerId,vehicleId,locationId,city||null,zone||null,resolvedSegment||null,pkg.price,pkg.currency,start,renews]);
    const membership=created.rows[0];
    await client.query(`INSERT INTO public.hybrid_membership_components(membership_id,component_key,engine,component_config,status) VALUES($1,'dcc','DCC',$2,'pending'),($1,'see_wash','SEE',$3,'pending')`,[membership.id,JSON.stringify(pkg.dcc_config),JSON.stringify(pkg.see_config)]);
    await client.query(`INSERT INTO public.hybrid_membership_events(membership_id,event_type,to_status,details,actor) VALUES($1,'purchase_created','pending_provisioning',$2,$3)`,[membership.id,JSON.stringify({packageCode:pkg.package_code,packageVersion:pkg.version}),actor]);
    return{membershipId:membership.id,idempotentReplay:false};
  });
  if(!result.idempotentReplay){const recovery=require('./hybridRecoveryService');await recovery.recoverMembership(result.membershipId,{actor});}
  const membership=await getMembership(result.membershipId);
  return{...membership,idempotentReplay:result.idempotentReplay,recoveryEligible:!['active','cancelled','expired','reconciliation_required'].includes(membership?.status)};
}
async function getMembership(id,client=null){
  const runner=client||db,m=await runner.query('SELECT * FROM public.hybrid_memberships WHERE id=$1',[id]);if(!m.rows[0])return null;
  const c=await runner.query('SELECT * FROM public.hybrid_membership_components WHERE membership_id=$1 ORDER BY component_key',[id]);
  const renewals=await runner.query('SELECT * FROM public.hybrid_membership_renewals WHERE membership_id=$1 ORDER BY created_at DESC',[id]);
  const rc=renewals.rows.length?await runner.query('SELECT * FROM public.hybrid_membership_renewal_components WHERE renewal_id=ANY($1::uuid[])',[renewals.rows.map(x=>x.id)]):{rows:[]};
  const events=await runner.query('SELECT * FROM public.hybrid_membership_events WHERE membership_id=$1 ORDER BY created_at DESC LIMIT 100',[id]);
  const row=m.rows[0],see=c.rows.find(x=>x.engine==='SEE'),policy=normalizeRenewalPolicy(row.package_snapshot?.renewal_policy||DEFAULT_RENEWAL_POLICY),today=day();
  const earliest=addPeriod(row.renews_at,-policy.renewal_window_days,'days');
  return{...row,packageName:row.package_snapshot?.name||row.package_snapshot?.package_name||null,purchaseDate:row.starts_at,expiryDate:row.renews_at,creditsGranted:Number(see?.component_config?.creditsPerCycle||0),components:c.rows,renewals:renewals.rows.map(r=>({...r,components:rc.rows.filter(x=>x.renewal_id===r.id)})),history:events.rows,renewalPolicy:policy,renewalEligible:row.status==='active'&&policy.enabled&&today>=earliest&&today<=day(row.renews_at),cancellationEligible:row.status==='active'&&today<=day(row.renews_at)};
}
async function listMemberships({limit=100}={}){const r=await db.query('SELECT id FROM public.hybrid_memberships ORDER BY updated_at DESC LIMIT $1',[Math.min(Math.max(Number(limit)||100,1),200)]);return Promise.all(r.rows.map(x=>getMembership(x.id)));}
async function listCustomerMemberships(customerId){const r=await db.query(`SELECT id FROM public.hybrid_memberships WHERE customer_id=$1 AND status IN ('active','renewal_pending','pending_provisioning','provisioning','provisioning_failed','reconciliation_required','cancellation_pending') ORDER BY created_at DESC`,[customerId]);return Promise.all(r.rows.map(x=>getMembership(x.id)));}
function lifecycleError(message,statusCode=409,code='HYBRID_LIFECYCLE_CONFLICT'){return Object.assign(new Error(message),{statusCode,code});}
function assertTransition(from,to){if(from===to)return;if(!ALLOWED_TRANSITIONS[from]?.includes(to))throw lifecycleError(`Invalid hybrid membership transition from '${from}' to '${to}'.`);}
async function cancel(id,{actor='admin',reason=''}={}){
  const cleanReason=String(reason||'Cancellation requested by administrator').trim().slice(0,300);
  return db.withTransaction(async client=>{
    const m=(await client.query('SELECT * FROM public.hybrid_memberships WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!m)throw lifecycleError('Hybrid membership not found.',404,'HYBRID_MEMBERSHIP_NOT_FOUND');
    if(m.status==='cancellation_pending'||m.status==='cancelled'||m.status==='expired')return getMembership(id,client);
    if(m.status!=='active')throw lifecycleError(`Cannot request cancellation while membership is ${m.status}.`);
    if(day(m.renews_at)<day()){
      assertTransition(m.status,'expired');
      await client.query(`UPDATE public.hybrid_memberships SET status='expired',expired_at=COALESCE(expired_at,now()),updated_at=now() WHERE id=$1`,[id]);
      await client.query(`INSERT INTO public.hybrid_membership_events(membership_id,event_type,from_status,to_status,details,actor) VALUES($1,'membership_expired',$2,'expired',$3,$4)`,[id,m.status,JSON.stringify({reason:'term_already_ended'}),actor]);return getMembership(id,client);
    }
    const components=(await client.query(`SELECT * FROM public.hybrid_membership_components WHERE membership_id=$1 FOR UPDATE`,[id])).rows;
    if(components.length!==2||components.some(c=>c.status!=='active'||!c.engine_record_id))throw lifecycleError('Membership components must be reconciled before cancellation can be scheduled.');
    assertTransition(m.status,'cancellation_pending');await client.query(`UPDATE public.hybrid_memberships SET status='cancellation_pending',cancellation_requested_at=now(),cancellation_reason=$2,updated_at=now() WHERE id=$1`,[id,cleanReason]);
    await client.query(`INSERT INTO public.hybrid_membership_events(membership_id,event_type,from_status,to_status,details,actor) VALUES($1,'cancellation_requested',$2,'cancellation_pending',$3,$4)`,[id,m.status,JSON.stringify({reason:cleanReason,effectiveAt:m.renews_at,strategy:'end_of_current_term'}),actor]);
    return getMembership(id,client);
  });
}
async function expireDueMemberships({asOfDate=day(),limit=200,actor='expiry_job'}={}){
  const cutoff=String(asOfDate);if(!/^\d{4}-\d{2}-\d{2}$/.test(cutoff)||day(cutoff)!==cutoff)throw new Error('asOfDate must be a valid Asia/Kolkata calendar date.');
  return db.withTransaction(async client=>{
    const due=await client.query(`SELECT id,status,renews_at FROM public.hybrid_memberships WHERE status IN ('active','cancellation_pending') AND renews_at<$1 ORDER BY renews_at LIMIT $2 FOR UPDATE SKIP LOCKED`,[cutoff,Math.min(Math.max(Number(limit)||200,1),500)]);const expired=[];
    for(const m of due.rows){assertTransition(m.status,'expired');await client.query(`UPDATE public.hybrid_memberships SET status='expired',expired_at=COALESCE(expired_at,now()),updated_at=now() WHERE id=$1`,[m.id]);await client.query(`INSERT INTO public.hybrid_membership_events(membership_id,event_type,from_status,to_status,details,actor) VALUES($1,'membership_expired',$2,'expired',$3,$4)`,[m.id,m.status,JSON.stringify({validThrough:m.renews_at,asOfDate:cutoff,engineRecordsPreserved:true}),actor]);expired.push(m.id);}
    return{asOfDate:cutoff,expiredCount:expired.length,membershipIds:expired};
  });
}
async function createRenewalSee(client,membership,renewal,component,actor){
  const cfg=component.component_config,pkg=membership.package_snapshot,service=await repos.seeCatalogue.findServiceById(cfg.serviceId,client),qty=Number(cfg.creditsPerCycle),saleRef=`HYB:${membership.id}:${renewal.period_start}`,key=`hybrid:${membership.id}:${renewal.period_start}:see:${cfg.serviceId}`;
  if(!service||service.status!=='active'||String(service.service_category_id).toLowerCase()!=='car_washing')throw lifecycleError('The saved Car Wash service is no longer valid for renewal.');
  const existing=await repos.seeEntitlement.findSnapshotBySaleReference(saleRef,client);
  if(existing){const accounts=await repos.seeEntitlement.findAccountsBySnapshotId(existing.id,client);if(existing.customer_id!==membership.customer_id||String(existing.vehicle_id)!==String(membership.vehicle_id)||accounts.length!==1||accounts[0].customer_id!==membership.customer_id||String(accounts[0].vehicle_id)!==String(membership.vehicle_id)||accounts[0].service_id!==service.id||Number(accounts[0].purchased_qty)!==qty||accounts[0].status!=='active')throw lifecycleError('Existing SEE renewal records conflict with this renewal.');const ledger=await repos.seeEntitlement.findLedgerByIdempotencyKey(accounts[0].id,key,client);if(!ledger||ledger.entry_type!=='purchase'||Number(ledger.quantity)!==qty)throw lifecycleError('Existing SEE renewal ledger is incomplete.');return accounts[0].id;}
  const snap=await repos.seeEntitlement.createPurchaseSnapshot({saleReference:saleRef,customerId:membership.customer_id,vehicleId:membership.vehicle_id,locationId:membership.location_id,packageId:null,packageVersion:membership.package_version,packageCode:pkg.package_code,packageName:pkg.name,serviceDefinitions:[{service_id:service.id,service_category_id:'car_washing',quantity:qty,hybrid_membership_id:membership.id}],quantities:{purchaseUnits:1,benefits:[{serviceId:service.id,quantity:qty}]},validity:{value:pkg.validity_value,unit:pkg.validity_unit,validFrom:renewal.period_start,validTo:renewal.period_end},vehicleSegment:membership.vehicle_segment,city:membership.city,zone:membership.zone,basePrice:renewal.amount,finalPrice:renewal.amount,terms:{hybridMembershipId:membership.id,renewalId:renewal.id,cycleKey:renewal.period_start},createdBy:actor,status:'active',purchasedAt:renewal.period_start},client);
  const account=await repos.seeEntitlement.createEntitlementAccount({purchaseSnapshotId:snap.id,customerId:membership.customer_id,vehicleId:membership.vehicle_id,locationId:membership.location_id,serviceId:service.id,entitlementKind:'wash_credit',purchasedQty:qty,validFrom:renewal.period_start,validTo:renewal.period_end},client);
  await repos.seeEntitlement.insertLedgerEntry({entitlementAccountId:account.id,entryType:'purchase',quantity:qty,balanceAfter:qty,referenceType:'hybrid_membership_renewal',referenceId:renewal.id,saleReference:saleRef,idempotencyKey:key,reason:`Hybrid ${pkg.package_code} renewal credits`,actor},client);return account.id;
}
async function runRenewalComponent(renewalId,componentId,actor){
  try{return await db.withTransaction(async client=>{
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`hybrid-renewal:${renewalId}:${componentId}`]);
    const rc=(await client.query('SELECT * FROM public.hybrid_membership_renewal_components WHERE id=$1 FOR UPDATE',[componentId])).rows[0],r=(await client.query('SELECT * FROM public.hybrid_membership_renewals WHERE id=$1 FOR UPDATE',[renewalId])).rows[0];if(!rc||!r)throw lifecycleError('Hybrid renewal was not found.',404,'HYBRID_RENEWAL_NOT_FOUND');if(rc.status==='active')return;
    const m=(await client.query('SELECT * FROM public.hybrid_memberships WHERE id=$1 FOR UPDATE',[r.membership_id])).rows[0];if(!m||m.status!=='renewal_pending')throw lifecycleError('Membership is no longer eligible for this renewal.');
    const base=(await client.query('SELECT * FROM public.hybrid_membership_components WHERE membership_id=$1 AND component_key=$2 FOR UPDATE',[m.id,rc.component_key])).rows[0];if(!base||base.status!=='active'||!base.engine_record_id)throw lifecycleError('Membership component linkage requires reconciliation.');
    await client.query(`UPDATE public.hybrid_membership_renewal_components SET status='provisioning',attempts=attempts+1,last_attempt_at=now(),updated_at=now() WHERE id=$1`,[componentId]);await client.query(`UPDATE public.hybrid_membership_renewals SET status='provisioning',attempt_count=attempt_count+1,updated_at=now() WHERE id=$1`,[renewalId]);
    let ref;
    if(rc.engine==='DCC'){const sub=await repos.subscriptions.findById(base.engine_record_id,client);if(!sub||sub.status!=='active'||String(sub.customer_id)!==String(m.customer_id)||String(sub.hybrid_membership_id)!==String(m.id))throw lifecycleError('The linked DCC subscription is missing, inactive, or belongs to a different membership.');await dccService.renewSubscription({subscriptionId:base.engine_record_id,newEndDate:r.period_end,newPackageName:m.package_snapshot.name,actor},client);ref=base.engine_record_id;}
    else ref=await createRenewalSee(client,m,r,base,actor);
    await client.query(`UPDATE public.hybrid_membership_renewal_components SET status='active',engine_record_id=$2,error_category=NULL,safe_error_message=NULL,updated_at=now() WHERE id=$1`,[componentId,ref]);
    if(rc.engine==='SEE')await client.query(`UPDATE public.hybrid_membership_components SET engine_record_id=$2,updated_at=now() WHERE id=$1`,[base.id,ref]);
    await client.query(`INSERT INTO public.hybrid_membership_events(membership_id,event_type,from_status,to_status,details,actor) VALUES($1,'renewal_component_completed','renewal_pending','renewal_pending',$2,$3)`,[m.id,JSON.stringify({renewalId,component:rc.engine,engineRecordId:ref}),actor]);
  });}catch(error){await db.withTransaction(async client=>{const rc=(await client.query('SELECT * FROM public.hybrid_membership_renewal_components WHERE id=$1 FOR UPDATE',[componentId])).rows[0];if(!rc||rc.status==='active')return;const conflict=error.code==='HYBRID_LIFECYCLE_CONFLICT'||error.code==='23505',category=conflict?'renewal_reconciliation_required':'renewal_engine_failure',message=conflict?'Renewal records conflict with engine state. Administrator reconciliation is required.':'Renewal provisioning failed. The membership remains pending; an administrator can retry.';const state=conflict?'reconciliation_required':'failed';await client.query(`UPDATE public.hybrid_membership_renewal_components SET status=$2,error_category=$3,safe_error_message=$4,updated_at=now() WHERE id=$1`,[componentId,state,category,message]);await client.query(`UPDATE public.hybrid_membership_renewals SET status=$2,error_category=$3,safe_error_message=$4,updated_at=now() WHERE id=$1`,[renewalId,state,category,message]);await client.query(`INSERT INTO public.hybrid_membership_events(membership_id,event_type,error_category,safe_message,details,actor) VALUES($1,'renewal_component_failed',$2,$3,$4,$5)`,[rc.renewal_id? (await client.query('SELECT membership_id FROM public.hybrid_membership_renewals WHERE id=$1',[renewalId])).rows[0]?.membership_id:null,category,message,JSON.stringify({renewalId,component:rc.engine}),actor]);});}
}
async function processRenewal(renewalId,{actor='admin'}={}){
  const rows=await db.query('SELECT * FROM public.hybrid_membership_renewal_components WHERE renewal_id=$1 ORDER BY component_key',[renewalId]);
  if(!rows.rows.length)throw lifecycleError('Hybrid renewal was not found.',404,'HYBRID_RENEWAL_NOT_FOUND');
  for(const c of rows.rows)if(c.status!=='active'&&c.status!=='reconciliation_required')await runRenewalComponent(renewalId,c.id,actor);
  await db.withTransaction(async client=>{
    const r=(await client.query('SELECT * FROM public.hybrid_membership_renewals WHERE id=$1 FOR UPDATE',[renewalId])).rows[0];if(!r)return;
    const cs=(await client.query('SELECT * FROM public.hybrid_membership_renewal_components WHERE renewal_id=$1 FOR UPDATE',[renewalId])).rows;
    if(cs.length===2&&cs.every(c=>c.status==='active')){
      const m=(await client.query('SELECT * FROM public.hybrid_memberships WHERE id=$1 FOR UPDATE',[r.membership_id])).rows[0];
      if(m?.status==='renewal_pending'){assertTransition(m.status,'active');await client.query(`UPDATE public.hybrid_memberships SET starts_at=$2,renews_at=$3,status='active',updated_at=now() WHERE id=$1`,[m.id,r.period_start,r.period_end]);await client.query(`UPDATE public.hybrid_membership_renewals SET status='active',completed_at=COALESCE(completed_at,now()),error_category=NULL,safe_error_message=NULL,updated_at=now() WHERE id=$1`,[renewalId]);await client.query(`INSERT INTO public.hybrid_membership_events(membership_id,event_type,from_status,to_status,details,actor) VALUES($1,'renewal_completed','renewal_pending','active',$2,$3)`,[m.id,JSON.stringify({renewalId,periodStart:r.period_start,periodEnd:r.period_end,amount:r.amount,currency:r.currency}),actor]);}
    }else{
      const manual=cs.some(c=>c.status==='reconciliation_required'),failed=cs.some(c=>c.status==='failed'),next=manual?'reconciliation_required':failed?'failed':'provisioning';
      await client.query(`UPDATE public.hybrid_membership_renewals SET status=$2,updated_at=now() WHERE id=$1`,[renewalId,next]);
    }
  });
  const r=(await db.query('SELECT membership_id FROM public.hybrid_membership_renewals WHERE id=$1',[renewalId])).rows[0];return r?getMembership(r.membership_id):null;
}
async function renew(id,{actor='admin',idempotencyKey,paymentReference=null,price}={}){
  if(!idempotencyKey||String(idempotencyKey).trim().length<8||String(idempotencyKey).length>120)throw lifecycleError('A stable idempotencyKey between 8 and 120 characters is required.',400,'HYBRID_RENEWAL_INVALID');
  if(paymentReference&&String(paymentReference).length>120)throw lifecycleError('paymentReference must be 120 characters or fewer.',400,'HYBRID_RENEWAL_INVALID');
  const renewalId=await db.withTransaction(async client=>{
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`hybrid-renewal-key:${idempotencyKey}`]);
    const prior=(await client.query('SELECT * FROM public.hybrid_membership_renewals WHERE idempotency_key=$1 FOR UPDATE',[idempotencyKey])).rows[0];
    if(prior){if(String(prior.membership_id)!==String(id)||String(prior.payment_reference||'')!==String(paymentReference||'')||(price!==undefined&&Number(price)!==Number(prior.amount)))throw lifecycleError('This renewal idempotency key is already associated with different renewal facts.');return prior.id;}
    if(paymentReference){await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`hybrid-payment:${paymentReference}`]);const dup=(await client.query('SELECT id FROM public.hybrid_membership_renewals WHERE payment_reference=$1 UNION ALL SELECT id FROM public.hybrid_memberships WHERE payment_reference=$1 LIMIT 1',[paymentReference])).rows[0];if(dup)throw lifecycleError('This payment reference has already been used.',409,'HYBRID_PAYMENT_REFERENCE_USED');}
    const m=(await client.query('SELECT * FROM public.hybrid_memberships WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!m)throw lifecycleError('Hybrid membership not found.',404,'HYBRID_MEMBERSHIP_NOT_FOUND');if(m.status!=='active')throw lifecycleError(`Cannot renew a membership in status '${m.status}'.`);
    const policyRow=(await client.query('SELECT renewal_policy,price FROM public.hybrid_packages WHERE id=$1',[m.package_id])).rows[0];const policy=normalizeRenewalPolicy(policyRow?.renewal_policy||m.package_snapshot?.renewal_policy||DEFAULT_RENEWAL_POLICY);if(!policy.enabled)throw lifecycleError('Renewal is disabled by the package policy.');
    const today=day(),periodStartNow=day(m.starts_at),expiry=day(m.renews_at),earliest=addPeriod(expiry,-policy.renewal_window_days,'days');if(today<periodStartNow||today<earliest||today>expiry)throw lifecycleError(`Renewal is available from ${earliest} through ${expiry}, after the current period begins.`);
    const amount=policy.price_mode==='fixed_price'?Number(policy.price):policy.price_mode==='current_package_price'?Number(policyRow.price):Number(m.price);if(!Number.isFinite(amount)||amount<0)throw lifecycleError('The server renewal price is invalid.',409,'HYBRID_RENEWAL_INVALID');if(price!==undefined&&price!==null&&Number(price)!==amount)throw lifecycleError('Renewal price changed. Refresh before completing renewal.',409,'HYBRID_RENEWAL_PRICE_CHANGED');
    const periodStart=expiry,periodEnd=addPeriod(periodStart,Number(m.package_snapshot.validity_value),m.package_snapshot.validity_unit);
    const ins=await client.query(`INSERT INTO public.hybrid_membership_renewals(membership_id,idempotency_key,payment_reference,period_start,period_end,amount,currency,package_snapshot,status,initiated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9) RETURNING id`,[id,idempotencyKey,paymentReference||null,periodStart,periodEnd,amount,m.currency,JSON.stringify(m.package_snapshot),actor]);const rid=ins.rows[0].id;
    const base=(await client.query(`SELECT * FROM public.hybrid_membership_components WHERE membership_id=$1 ORDER BY component_key FOR UPDATE`,[id])).rows;if(base.length!==2||base.some(c=>c.status!=='active'||!c.engine_record_id)||base.filter(c=>c.engine==='DCC').length!==1||base.filter(c=>c.engine==='SEE').length!==1)throw lifecycleError('Membership components must be active and reconciled before renewal.');
    for(const c of base)await client.query(`INSERT INTO public.hybrid_membership_renewal_components(renewal_id,component_key,engine,status,engine_record_id) VALUES($1,$2,$3,'pending',$4)`,[rid,c.component_key,c.engine,c.engine_record_id]);
    assertTransition(m.status,'renewal_pending');await client.query(`UPDATE public.hybrid_memberships SET status='renewal_pending',updated_at=now() WHERE id=$1`,[id]);await client.query(`INSERT INTO public.hybrid_membership_events(membership_id,event_type,from_status,to_status,details,actor) VALUES($1,'renewal_requested','active','renewal_pending',$2,$3)`,[id,JSON.stringify({renewalId:rid,idempotencyKey,periodStart,periodEnd,amount,currency:m.currency,paymentReference}),actor]);return rid;
  });
  return processRenewal(renewalId,{actor});
}
async function retryRenewal(renewalId,{actor='admin'}={}){return processRenewal(renewalId,{actor});}
module.exports={STATUSES,ALLOWED_TRANSITIONS,validateDefinition,createPackage,listPackages,updatePackage,setPackageStatus,purchase,getMembership,listMemberships,listCustomerMemberships,cancel,renew,retryRenewal,expireDueMemberships,addPeriod,assertEligibility,normalizeRenewalPolicy};
