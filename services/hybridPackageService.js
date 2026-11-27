'use strict';

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
  if(eligibility.all_cities===false && !(eligibility.cities||[]).some(x=>String(x).toLowerCase()===String(city||'').toLowerCase())) throw new Error('Hybrid package is not available in this city.');
  if((eligibility.zones||[]).length && !eligibility.zones.some(x=>String(x).toLowerCase()===String(zone||'').toLowerCase())) throw new Error('Hybrid package is not available in this zone.');
  if((pkg.vehicle_segments||[]).length && !pkg.vehicle_segments.includes(vehicleSegment)) throw new Error('Vehicle segment is not eligible for this hybrid package.');
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
async function purchase({packageId,customerId,vehicleId,locationId=null,city,zone,vehicleSegment,idempotencyKey,actor='admin'}) {
  if(!idempotencyKey||String(idempotencyKey).length>120) throw new Error('A stable idempotencyKey (max 120 characters) is required.');
  return db.withTransaction(async client=>{
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`hybrid:${idempotencyKey}`]);
    const duplicate=await client.query('SELECT * FROM public.hybrid_memberships WHERE idempotency_key=$1',[idempotencyKey]);
    if(duplicate.rows[0]) return getMembership(duplicate.rows[0].id,client);
    const pkg=await packageById(packageId,client); if(!pkg) throw new Error('Active hybrid package version not found.');
    if(pkg.effective_from && day(pkg.effective_from)>day() || pkg.effective_to && day(pkg.effective_to)<day()) throw new Error('Hybrid package is outside its effective dates.');
    assertEligibility(pkg,{city,zone,vehicleSegment});
    const customer=await repos.customers.findById(customerId,client); if(!customer||customer.deleted_at||customer.is_active===false) throw new Error('Active customer not found.');
    const vehicle=await repos.vehicles.findById(vehicleId,client); if(!vehicle||vehicle.customer_id!==customerId||vehicle.is_active===false) throw new Error('Vehicle ownership validation failed.');
    if(locationId){const loc=await repos.serviceLocations.findById(locationId,client);if(!loc||loc.customer_id!==customerId||loc.is_active===false)throw new Error('Service location ownership validation failed.');}
    const start=day(); const cycleMonths={monthly:1,quarterly:3,annual:12}[pkg.billing_cycle]||1; const renews=addPeriod(start,cycleMonths,'months');
    const created=await client.query(`INSERT INTO public.hybrid_memberships(idempotency_key,package_id,package_version,package_snapshot,customer_id,vehicle_id,location_id,city,zone,vehicle_segment,price,currency,status,starts_at,renews_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending_provisioning',$13,$14) RETURNING *`,[idempotencyKey,pkg.id,pkg.version,JSON.stringify(pkg),customerId,vehicleId,locationId,city||null,zone||null,vehicleSegment||null,pkg.price,pkg.currency,start,renews]);
    const membership=created.rows[0];
    const dccComp=(await client.query(`INSERT INTO public.hybrid_membership_components(membership_id,component_key,engine,component_config,status) VALUES($1,'dcc','DCC',$2,'provisioning') RETURNING *`,[membership.id,JSON.stringify(pkg.dcc_config)])).rows[0];
    const seeComp=(await client.query(`INSERT INTO public.hybrid_membership_components(membership_id,component_key,engine,component_config,status) VALUES($1,'see_wash','SEE',$2,'provisioning') RETURNING *`,[membership.id,JSON.stringify(pkg.see_config)])).rows[0];
    try {
      const dcc=await dccService.createSubscription({customerId,packageName:pkg.name,startDate:start,endDate:renews,packagesPurchased:1,rotationType:pkg.dcc_config.rotationType||'none',vehicles:[{vehicleId,locationId}]},actor,client);
      await client.query(`UPDATE public.hybrid_membership_components SET status='provisioned',engine_record_id=$2,attempts=1,last_attempt_at=now(),updated_at=now() WHERE id=$1`,[dccComp.id,dcc.id]);
      const accountId=await provisionSee(client,membership,pkg,'initial',actor);
      await client.query(`UPDATE public.hybrid_membership_components SET status='provisioned',engine_record_id=$2,attempts=1,last_attempt_at=now(),updated_at=now() WHERE id=$1`,[seeComp.id,accountId]);
      await client.query(`UPDATE public.hybrid_memberships SET status='active',updated_at=now() WHERE id=$1`,[membership.id]);
    } catch(err) {
      // A shared transaction rolls back all engine effects; persist a failed purchase separately.
      throw err;
    }
    return getMembership(membership.id,client);
  });
}
async function getMembership(id,client=null){const runner=client||db;const m=await runner.query(`SELECT * FROM public.hybrid_memberships WHERE id=$1`,[id]);if(!m.rows[0])return null;const c=await runner.query(`SELECT * FROM public.hybrid_membership_components WHERE membership_id=$1 ORDER BY component_key`,[id]);return {...m.rows[0],components:c.rows};}
async function listCustomerMemberships(customerId){const r=await db.query(`SELECT id FROM public.hybrid_memberships WHERE customer_id=$1 AND status IN ('active','pending_provisioning','provisioning','provisioning_failed','cancellation_pending') ORDER BY created_at DESC`,[customerId]);return Promise.all(r.rows.map(x=>getMembership(x.id)));}
async function cancel(id,{actor='admin',reason='Customer requested cancellation'}={}){
  return db.withTransaction(async client=>{const membership=(await client.query('SELECT * FROM public.hybrid_memberships WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!membership)throw new Error('Hybrid membership not found.');if(membership.status==='cancelled')return getMembership(id,client);await client.query(`UPDATE public.hybrid_memberships SET status='cancellation_pending',updated_at=now() WHERE id=$1`,[id]);const components=(await client.query(`SELECT * FROM public.hybrid_membership_components WHERE membership_id=$1 FOR UPDATE`,[id])).rows;
    for(const c of components){if(c.engine==='DCC'&&c.engine_record_id)await dccService.cancelSubscription({subscriptionId:c.engine_record_id,reason,actor},undefined,undefined,client);if(c.engine==='SEE'&&c.engine_record_id)await client.query(`UPDATE public.entitlement_accounts SET status='cancelled',updated_at=now() WHERE id=$1`,[c.engine_record_id]);await client.query(`UPDATE public.hybrid_membership_components SET status='cancelled',updated_at=now() WHERE id=$1`,[c.id]);}
    await client.query(`UPDATE public.hybrid_memberships SET status='cancelled',updated_at=now() WHERE id=$1`,[id]);return getMembership(id,client);});
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
