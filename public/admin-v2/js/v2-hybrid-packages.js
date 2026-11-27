(function (window) {
  'use strict';
  window.CWP_ADMIN_V2 = window.CWP_ADMIN_V2 || {};
  const $ = id => document.getElementById(id);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function request(url, options={}) {
    const csrf=window.CWP_ADMIN_V2.auth?.getCsrfToken?.();
    const headers={...(options.body?{'Content-Type':'application/json'}:{}),...(csrf?{'X-CSRF-Token':csrf}:{})};
    const response=await fetch(url,{credentials:'same-origin',...options,headers}); const body=await response.json().catch(()=>({}));
    if(!response.ok||body.success===false) throw new Error(body.error||`Request failed (${response.status})`); return body;
  }
  async function load(){
    const state=$('v2HybridState'), body=$('v2HybridBody'); if(!state||!body)return;
    state.style.display='block';state.textContent='Loading hybrid packages…';
    try { const {packages=[]}=await request('/api/see/hybrid/packages');
      body.innerHTML=packages.map(p=>`<tr><td>${esc(p.package_code)}</td><td>${esc(p.name)}</td><td>v${esc(p.version)}</td><td>${esc(p.billing_cycle)}</td><td>₹${Number(p.price).toFixed(2)}</td><td>${esc(p.see_config?.creditsPerCycle)}</td><td>${esc(p.status)}</td><td>${p.status==='draft'?`<button class="cwp-v2-btn cwp-v2-btn-secondary cwp-v2-btn-sm" data-hybrid-edit="${esc(p.id)}" data-value="${esc(JSON.stringify({name:p.name,price:Number(p.price),currency:p.currency,validity_value:p.validity_value,validity_unit:p.validity_unit,billing_cycle:p.billing_cycle,city_zone_eligibility:p.city_zone_eligibility,vehicle_segments:p.vehicle_segments,dcc_config:p.dcc_config,see_config:p.see_config,credit_policy:p.credit_policy}))}">Edit</button><button class="cwp-v2-btn cwp-v2-btn-secondary cwp-v2-btn-sm" data-hybrid-status="active" data-id="${esc(p.id)}">Activate</button>`:''} ${p.status==='active'?`<button class="cwp-v2-btn cwp-v2-btn-tertiary cwp-v2-btn-sm" data-hybrid-status="retired" data-id="${esc(p.id)}">Retire</button>`:''}</td></tr>`).join('');
      state.style.display=packages.length?'none':'block';state.textContent=packages.length?'':'No hybrid package definitions.';
    } catch(e){state.style.display='block';state.textContent=`Could not load hybrid packages: ${e.message}`;}
  }
  async function create(){
    const help='Enter a JSON package definition. Example: {"packageCode":"DCC_GOLD","name":"DCC GOLD","price":999,"validityValue":1,"validityUnit":"months","billingCycle":"monthly","dccConfig":{"packageName":"DCC GOLD"},"seeConfig":{"serviceId":"CAR_WASH_SERVICE_UUID","creditsPerCycle":2},"cityZoneEligibility":{"all_cities":true,"cities":[],"zones":[]},"vehicleSegments":[]}';
    const value=window.prompt(help); if(!value)return;
    let data;try{data=JSON.parse(value);}catch(e){window.alert('Package definition must be valid JSON.');return;}
    try{await request('/api/see/hybrid/packages',{method:'POST',body:JSON.stringify(data)});await load();}catch(e){window.alert(e.message);}
  }
  async function setStatus(id,status){try{await request(`/api/see/hybrid/packages/${encodeURIComponent(id)}/status`,{method:'POST',body:JSON.stringify({status})});await load();}catch(e){window.alert(e.message);}}
  async function edit(id, raw){const value=window.prompt('Edit the draft package JSON fields.',raw);if(!value)return;try{await request(`/api/see/hybrid/packages/${encodeURIComponent(id)}`,{method:'PATCH',body:value});await load();}catch(e){window.alert(e.message);}}
  function init(){ $('v2HybridRefresh')?.addEventListener('click',load);$('v2HybridCreate')?.addEventListener('click',create);$('v2HybridBody')?.addEventListener('click',e=>{const editButton=e.target.closest('[data-hybrid-edit]');if(editButton){edit(editButton.dataset.hybridEdit,editButton.dataset.value);return;}const b=e.target.closest('[data-hybrid-status]');if(b)setStatus(b.dataset.id,b.dataset.hybridStatus);});window.addEventListener('cwp-v2:tab-changed',e=>{if(e.detail?.tab==='hybridPackages')load();});if($('v2View_hybridPackages')?.classList.contains('is-active'))load(); }
  window.CWP_ADMIN_V2.hybridPackages={init,load};
})(window);
