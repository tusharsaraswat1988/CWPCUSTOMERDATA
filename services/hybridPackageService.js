'use strict';

// Purchase flow: lock idempotency/payment references, validate the active package
// and registered customer/vehicle, then create the authoritative membership,
// DCC subscription, SEE snapshot/account/ledger, and component links in one
// PostgreSQL transaction. Any component failure rolls back the entire purchase;
// an identical retry therefore provisions once, while a changed replay conflicts.

const db = require('../db');
const repos = require('../db/repositories');
const dccService = require('./dccService');

const STATUSES = ['pending_provisioning','provisioning','active','provisioning_failed','cancellation_pending','cancelled','expired'];
const day = (value = new Date()) => new Date(value).toISOString().slice(0, 10);
function addPeriod(start, value, unit) {
  const d = new Date(`${day(start)}T12:00:00Z`);
  if (unit === 'years') d.setUTCFullYear(d.getUTCFullYear() + value);
  else if (unit === 'days') d.setUTCDate(d.getUTCDate() + value);
  else d.setUTCMonth(d.getUTCMonth() + value);
  return day(d);
}
function validateDefinition(data) {
  if (!data || !String(data.packageCode || '').trim() || !String(data.name || '').trim()) throw new Error('packageCode and name are required.');
  if (!Number.isFinite(Number(data.price)) || Number(data.price) < 0) throw new Error('price must be a non-negative number.');
  if (!data.dccConfig || !data.seeConfig || !data.seeConfig.serviceId || Number(data.seeConfig.creditsPerCycle) < 1) throw new Error('DCC and Car Wash component configuration is required.');
  if (!['days','months','years'].includes(data.validityUnit || 'months')) throw new Error('Invalid validityUnit.');
  return { ...data, packageCode: String(data.packageCode).trim().toUpperCase(), version: Number(data.version) || 1, validityValue: Number(data.validityValue) || 1, validityUnit: data.validityUnit || 'months', billingCycle: data.billingCycle || 'monthly' };
}
async function createPackage(data, actor = 'admin') {
  const p = validateDefinition(data);
  const r = await db.query(`INSERT INTO public.hybrid_packages (package_code,name,version,status,city_zone_eligibility,vehicle_segments,price,currency,validity_value,validity_unit,billing_cycle,dcc_config,see_config,credit_policy,activation_policy,cancellation_policy,effective_from,effective_to,created_by)
    VALUES ($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
  [p.packageCode,p.name,p.version,JSON.stringify(p.cityZoneEligibility||{all_cities:true,cities:[],zones:[]}),JSON.stringify(p.vehicleSegments||[]),p.price,p.currency||'INR',p.validityValue,p.validityUnit,p.billingCycle,JSON.stringify(p.dccConfig),JSON.stringify(p.seeConfig),JSON.stringify(p.creditPolicy||{expiry:'cycle_end',rollover:false}),JSON.stringify(p.activationPolicy||{}),JSON.stringify(p.cancellationPolicy||{}),p.effectiveFrom||null,p.effectiveTo||null,actor]);
  return r.rows[0];
}
async function listPackages({includeDrafts=false}={}) { const r=await db.query(`SELECT * FROM public.hybrid_packages ${includeDrafts?'':'WHERE status=\'active\''} ORDER BY package_code,version DESC`); return r.rows; }
async function updatePackage(id, changes) {
  const allowed=['name','price','currency','validity_value','validity_unit','billing_cycle','city_zone_eligibility','vehicle_segments','dcc_config','see_config','credit_policy','activation_policy','cancellation_policy','effective_from','effective_to'];
  const parts=[], values=[id];
  for(const key of allowed) if(changes[key]!==undefined){ values.push(['city_zone_eligibility','vehicle_segments','dcc_config','see_config','credit_policy','activation_policy','cancellation_policy'].includes(key)?JSON.stringify(changes[key]):changes[key]); parts.push(`${key}=$${values.length}${['city_zone_eligibility','vehicle_segments','dcc_config','see_config','credit_policy','activation_policy','cancellation_policy'].includes(key)?'::jsonb':''}`); }
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
async function getMembership(id,client=null){const runner=client||db;const m=await runner.query(`SELECT * FROM public.hybrid_memberships WHERE id=$1`,[id]);if(!m.rows[0])return null;const c=await runner.query(`SELECT * FROM public.hybrid_membership_components WHERE membership_id=$1 ORDER BY component_key`,[id]);const row=m.rows[0];const see=c.rows.find(x=>x.engine==='SEE');return {...row,packageName:row.package_snapshot?.name||row.package_snapshot?.package_name||null,purchaseDate:row.starts_at,expiryDate:row.renews_at,creditsGranted:Number(see?.component_config?.creditsPerCycle||0),components:c.rows};}
async function listCustomerMemberships(customerId){const r=await db.query(`SELECT id FROM public.hybrid_memberships WHERE customer_id=$1 AND status IN ('active','pending_provisioning','provisioning','provisioning_failed','cancellation_pending') ORDER BY created_at DESC`,[customerId]);return Promise.all(r.rows.map(x=>getMembership(x.id)));}
async function cancel(id,{actor='admin',reason='Customer requested cancellation'}={}){
  return db.withTransaction(async client=>{const membership=(await client.query('SELECT * FROM public.hybrid_memberships WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!membership)throw new Error('Hybrid membership not found.');if(membership.status==='cancelled')return getMembership(id,client);await client.query(`UPDATE public.hybrid_memberships SET status='cancellation_pending',updated_at=now() WHERE id=$1`,[id]);const components=(await client.query(`SELECT * FROM public.hybrid_membership_components WHERE membership_id=$1 FOR UPDATE`,[id])).rows;
    for(const c of components){if(c.engine==='DCC'&&c.engine_record_id)await dccService.cancelSubscription({subscriptionId:c.engine_record_id,reason,actor},undefined,undefined,client);if(c.engine==='SEE'&&c.engine_record_id)await client.query(`UPDATE public.entitlement_accounts SET status='cancelled',updated_at=now() WHERE id=$1`,[c.engine_record_id]);await client.query(`UPDATE public.hybrid_membership_components SET status='cancelled',lease_expires_at=NULL,next_retry_at=NULL,updated_at=now() WHERE id=$1`,[c.id]);await client.query(`INSERT INTO public.hybrid_membership_events(membership_id,component_id,event_type,from_status,to_status,details,actor) VALUES($1,$2,'component_cancelled',$3,'cancelled',$4,$5)`,[id,c.id,c.status,JSON.stringify({engine:c.engine,engineRecordId:c.engine_record_id}),actor]);}
    await client.query(`UPDATE public.hybrid_memberships SET status='cancelled',updated_at=now() WHERE id=$1`,[id]);await client.query(`INSERT INTO public.hybrid_membership_events(membership_id,event_type,from_status,to_status,details,actor) VALUES($1,'membership_cancelled',$2,'cancelled',$3,$4)`,[id,membership.status,JSON.stringify({reason:String(reason||'').slice(0,300)}),actor]);return getMembership(id,client);});
}
async function renew(id,{actor='admin'}={}){
  return db.withTransaction(async client=>{
    const m=(await client.query(`SELECT * FROM public.hybrid_memberships WHERE id=$1 FOR UPDATE`,[id])).rows[0];
    if(!m) throw new Error('Hybrid membership not found.');
    if(m.status!=='active') throw new Error(`Cannot renew hybrid membership in status '${m.status}'.`);
    const pkg=m.package_snapshot; const cycleKey=day(m.renews_at); const cycleMonths={monthly:1,quarterly:3,annual:12}[pkg.billing_cycle]||1; const nextRenewal=addPeriod(cycleKey,cycleMonths,'months');
    const comps=(await client.query(`SELECT * FROM public.hybrid_membership_components WHERE membership_id=$1 FOR UPDATE`,[id])).rows;
    const dcc=comps.find(c=>c.engine==='DCC'); const see=comps.find(c=>c.engine==='SEE');
    if(!dcc?.engine_record_id||!see) throw new Error('Hybrid membership component linkage is incomplete.');
    await dccService.renewSubscription({subscriptionId:dcc.engine_record_id,newEndDate:nextRenewal,newPackageName:pkg.name,actor},client);
    const accountId=await provisionSee(client,{...m,renews_at:cycleKey},pkg,cycleKey,actor);
    await client.query(`UPDATE public.hybrid_membership_components SET engine_record_id=$2,status='provisioned',attempts=attempts+1,last_attempt_at=now(),updated_at=now() WHERE id=$1`,[see.id,accountId]);
    await client.query(`UPDATE public.hybrid_memberships SET renews_at=$2,status='active',updated_at=now() WHERE id=$1`,[id,nextRenewal]);
    return getMembership(id,client);
  });
}
module.exports={STATUSES,validateDefinition,createPackage,listPackages,updatePackage,setPackageStatus,purchase,getMembership,listCustomerMemberships,cancel,renew,addPeriod,assertEligibility};
