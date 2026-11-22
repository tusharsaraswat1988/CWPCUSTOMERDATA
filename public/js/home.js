/**
 * CWP Detailers & Motors - Homepage Client Controller
 * Pure Vanilla JavaScript · Ultra-Lightweight · Zero Dependencies
 */

(function () {
  'use strict';

  // State
  let activeServiceMode = 'car'; // 'car' or 'solar'
  let activeVehicleTab = 'hatchback'; // 'hatchback', 'sedan', 'compactSuv', 'fullSuvLuxury'
  let homepageConfig = null;

  // DOM Elements
  const header = document.querySelector('.site-header');
  const toggleCarBtn = document.getElementById('toggleCarBtn');
  const toggleSolarBtn = document.getElementById('toggleSolarBtn');
  const heroTitle = document.getElementById('heroTitle');
  const heroDesc = document.getElementById('heroDesc');
  const heroEyebrow = document.getElementById('heroEyebrow');
  const vehicleTabsWrap = document.getElementById('vehicleTabsWrap');
  const pricingCardsContainer = document.getElementById('pricingCardsContainer');
  const bookingModal = document.getElementById('bookingModal');
  const bookingForm = document.getElementById('bookingForm');
  const legalModal = document.getElementById('legalModal');
  const legalModalTitle = document.getElementById('legalModalTitle');
  const legalModalBody = document.getElementById('legalModalBody');
  const videoModal = document.getElementById('videoModal');
  const videoFrame = document.getElementById('videoFrame');

  // Sticky header shadow on scroll
  window.addEventListener('scroll', () => {
    if (window.scrollY > 30) {
      header?.classList.add('scrolled');
    } else {
      header?.classList.remove('scrolled');
    }
  });

  // Fetch dynamic configuration
  async function loadConfig() {
    try {
      const res = await fetch('/api/public/homepage-config');
      if (res.ok) {
        homepageConfig = await res.json();
        renderPricing();
        renderOffers();
      }
    } catch (e) {
      console.warn('Config fetch error, using built-in defaults:', e);
    }
  }

  // Switch between Car Care and Solar Care
  function setServiceMode(mode) {
    activeServiceMode = mode;
    if (mode === 'solar') {
      toggleSolarBtn?.classList.add('active');
      toggleCarBtn?.classList.remove('active');
      heroEyebrow.textContent = '☀️ ROOFTOP SOLAR PANEL CLEANING IN VARANASI';
      heroEyebrow.classList.add('amber');
      heroTitle.innerHTML = 'Rooftop Solar Ki Safai, <span class="highlight">Bijli Generation Badhai.</span>';
      heroTitle.classList.add('solar-mode');
      heroDesc.textContent = 'Varanasi ki dhool aur pollution se solar generation 20-30% gir jaata hai. CWP ke de-mineralized pure RO water aur soft non-abrasive wash se panels ko banaiye dust-free.';
      vehicleTabsWrap.style.display = 'none';
    } else {
      toggleCarBtn?.classList.add('active');
      toggleSolarBtn?.classList.remove('active');
      heroEyebrow.textContent = '📍 VARANASI\'S #1 DOORSTEP AUTO SPECIALISTS';
      heroEyebrow.classList.remove('amber');
      heroTitle.innerHTML = 'Ab gaadiyaan hongi <span class="highlight">roj saaf.</span>';
      heroTitle.classList.remove('solar-mode');
      heroDesc.textContent = 'Regular doorstep cleaning, professional detailing and recurring care plans — trained CWP specialists at your gate, every week. No colony-cleaner swirls, 100% Zero-TDS RO water.';
      vehicleTabsWrap.style.display = 'flex';
    }
    renderPricing();
  }

  // Switch vehicle tab
  function setVehicleTab(tabKey) {
    activeVehicleTab = tabKey;
    document.querySelectorAll('.v-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabKey);
    });
    renderPricing();
  }

  // Render pricing cards dynamically
  function renderPricing() {
    if (!pricingCardsContainer) return;

    if (activeServiceMode === 'solar') {
      // Solar panel cleaning packages
      const solarRates = (homepageConfig && homepageConfig.rates && homepageConfig.rates.solarCare) || {
        perPanelSingle: 40,
        perPanelSubscription6Mo: 30,
        perPanelSubscription12Mo: 25
      };

      pricingCardsContainer.innerHTML = `
        <div class="pricing-card">
          <h3 class="pkg-title">One-Time Deep Clean</h3>
          <p class="pkg-desc">Single rooftop solar cleaning session with zero-TDS RO demineralized water.</p>
          <div class="pkg-price-wrap">
            <span class="price-currency">₹</span>
            <span class="price-num">${solarRates.perPanelSingle}</span>
            <span class="price-unit">/ panel</span>
            <span class="price-gst-tag">+ 18% GST Extra (Min. 10 panels)</span>
          </div>
          <ul class="feature-list">
            <li class="feature-item"><span class="check">✓</span> 100% Zero-TDS RO Demineralized Water</li>
            <li class="feature-item"><span class="check">✓</span> Specialized anti-scratch soft microfiber wash</li>
            <li class="feature-item"><span class="check">✓</span> Inverter generation check before & after</li>
            <li class="feature-item"><span class="check">✓</span> Digital inspection report on WhatsApp</li>
          </ul>
          <button class="btn-primary" onclick="window.openBookingModal('Solar One-Time Clean', 'Solar Panel Cleaning')">Book Solar Clean</button>
        </div>

        <div class="pricing-card featured">
          <div class="card-badge">Most Popular</div>
          <h3 class="pkg-title">6-Month Maintenance Plan</h3>
          <p class="pkg-desc">Bi-annual plan with monthly cleaning visits to ensure maximum solar output.</p>
          <div class="pkg-price-wrap">
            <span class="price-currency">₹</span>
            <span class="price-num">${solarRates.perPanelSubscription6Mo}</span>
            <span class="price-unit">/ panel / visit</span>
            <span class="price-gst-tag">+ 18% GST Extra (6 Visits total)</span>
          </div>
          <ul class="feature-list">
            <li class="feature-item"><span class="check">✓</span> 1 Scheduled RO wash every month (6 total)</li>
            <li class="feature-item"><span class="check">✓</span> Up to 25% higher monthly power generation</li>
            <li class="feature-item"><span class="check">✓</span> Visual frame & cable wear check</li>
            <li class="feature-item"><span class="check">✓</span> Priority weekend or morning slots</li>
          </ul>
          <button class="btn-primary" onclick="window.openBookingModal('Solar 6-Month Plan', 'Solar Panel Cleaning')">Book 6-Month Plan</button>
        </div>

        <div class="pricing-card">
          <h3 class="pkg-title">12-Month Annual Care</h3>
          <p class="pkg-desc">Annual 12-visit comprehensive rooftop maintenance for homes & businesses.</p>
          <div class="pkg-price-wrap">
            <span class="price-currency">₹</span>
            <span class="price-num">${solarRates.perPanelSubscription12Mo}</span>
            <span class="price-unit">/ panel / visit</span>
            <span class="price-gst-tag">+ 18% GST Extra (12 Visits total)</span>
          </div>
          <ul class="feature-list">
            <li class="feature-item"><span class="check">✓</span> Lowest per-panel rate in Varanasi</li>
            <li class="feature-item"><span class="check">✓</span> Year-round peak solar efficiency</li>
            <li class="feature-item"><span class="check">✓</span> Dedicated solar specialist assigned</li>
            <li class="feature-item"><span class="check">✓</span> Flexible date rescheduling via WhatsApp</li>
          </ul>
          <button class="btn-primary" onclick="window.openBookingModal('Solar Annual Care', 'Solar Panel Cleaning')">Book Annual Plan</button>
        </div>
      `;
      return;
    }

    // Car care packages
    const rates = (homepageConfig && homepageConfig.rates && homepageConfig.rates[activeVehicleTab]) || {
      dailyClean: 1999,
      interiorExteriorDetail: 1499,
      ceramicCoating: 8999,
      examples: 'Swift, i20, Baleno, Tiago, Altroz'
    };

    pricingCardsContainer.innerHTML = `
      <div class="pricing-card featured">
        <div class="card-badge">Most Loved</div>
        <h3 class="pkg-title">Daily Clean Plan</h3>
        <p class="pkg-desc">Doorstep exterior rhythm — pure RO wash before your morning commute starts.</p>
        <div class="pkg-price-wrap">
          <span class="price-currency">₹</span>
          <span class="price-num">${rates.dailyClean.toLocaleString('en-IN')}</span>
          <span class="price-unit">/ month</span>
          <span class="price-gst-tag">+ 18% GST Extra</span>
        </div>
        <ul class="feature-list">
          <li class="feature-item"><span class="check">✓</span> 26 Doorstep washes per month</li>
          <li class="feature-item"><span class="check">✓</span> 100% De-mineralized RO water (Zero TDS)</li>
          <li class="feature-item"><span class="check">✓</span> Scratch-free 2-bucket microfiber technique</li>
          <li class="feature-item"><span class="check">✓</span> Tire dressing & exterior glass polish</li>
          <li class="feature-item"><span class="check">✓</span> Dedicated morning slot (6:30 AM – 9:00 AM)</li>
          <li class="feature-item"><span class="check">✓</span> Daily photo proof sent to your WhatsApp</li>
        </ul>
        <button class="btn-primary" onclick="window.openBookingModal('Daily Clean Plan (${rates.examples.split(',')[0].trim()})', 'Daily Car Cleaning')">Book Daily Clean</button>
      </div>

      <div class="pricing-card">
        <h3 class="pkg-title">Interior + Exterior Detail</h3>
        <p class="pkg-desc">Deep cabin steam sanitization, snow foam bathe, and paint protection top-up.</p>
        <div class="pkg-price-wrap">
          <span class="price-currency">₹</span>
          <span class="price-num">${rates.interiorExteriorDetail.toLocaleString('en-IN')}</span>
          <span class="price-unit">/ visit</span>
          <span class="price-gst-tag">+ 18% GST Extra</span>
        </div>
        <ul class="feature-list">
          <li class="feature-item"><span class="check">✓</span> High-pressure snow foam hand wash</li>
          <li class="feature-item"><span class="check">✓</span> Deep cabin vacuum & seat upholstery steam extraction</li>
          <li class="feature-item"><span class="check">✓</span> Roof fabric & door pad stain treatment</li>
          <li class="feature-item"><span class="check">✓</span> Dashboard & vinyl UV shine conditioning</li>
          <li class="feature-item"><span class="check">✓</span> Complete AC vent bacterial sanitization</li>
        </ul>
        <button class="btn-primary" onclick="window.openBookingModal('Interior + Exterior Detail', 'Car Detailing')">Book Detailing Visit</button>
      </div>

      <div class="pricing-card">
        <h3 class="pkg-title">9H Ceramic Coating</h3>
        <p class="pkg-desc">Long-lasting 9H nano-shield with deep showroom mirror gloss & swirl defense.</p>
        <div class="pkg-price-wrap">
          <span class="price-currency">₹</span>
          <span class="price-num">${rates.ceramicCoating.toLocaleString('en-IN')}</span>
          <span class="price-unit">onwards</span>
          <span class="price-gst-tag">+ 18% GST Extra</span>
        </div>
        <ul class="feature-list">
          <li class="feature-item"><span class="check">✓</span> 3-Stage dual-action machine paint correction</li>
          <li class="feature-item"><span class="check">✓</span> 90%+ elimination of swirls & oxidation</li>
          <li class="feature-item"><span class="check">✓</span> Extreme hydrophobic self-cleaning water-beading</li>
          <li class="feature-item"><span class="check">✓</span> Multi-year written warranty & maintenance visits</li>
          <li class="feature-item"><span class="check">✓</span> Free doorstep pick and drop in Varanasi</li>
        </ul>
        <button class="btn-primary" onclick="window.openBookingModal('9H Ceramic Coating', 'Ceramic Coating & PPF')">Inquire for Ceramic</button>
      </div>
    `;
  }

  // Render promotional offers
  function renderOffers() {
    const offersContainer = document.getElementById('offersContainer');
    if (!offersContainer || !homepageConfig || !homepageConfig.offers) return;

    offersContainer.innerHTML = homepageConfig.offers.map(offer => `
      <div class="offer-card">
        <span class="offer-badge">${offer.badge}</span>
        <h3 class="offer-title">${offer.title}</h3>
        <div class="offer-discount">${offer.discountText}</div>
        <p class="offer-desc">${offer.description}</p>
        <div class="coupon-pill">
          <span>CODE: <strong>${offer.code}</strong></span>
          <button class="copy-btn" onclick="navigator.clipboard.writeText('${offer.code}'); alert('Coupon code ${offer.code} copied!');">Copy</button>
        </div>
        <button class="btn-whatsapp" onclick="window.claimOffer('${offer.code}', '${offer.title}')">
          Claim on WhatsApp →
        </button>
      </div>
    `).join('');
  }

  // Interactive Before/After Comparison Slider
  function initBeforeAfterSlider() {
    const container = document.getElementById('baContainer');
    const afterImg = document.getElementById('baImgAfter');
    const handle = document.getElementById('baHandle');
    if (!container || !afterImg || !handle) return;

    let isDown = false;

    function move(e) {
      if (!isDown) return;
      const rect = container.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      let pos = ((clientX - rect.left) / rect.width) * 100;
      if (pos < 5) pos = 5;
      if (pos > 95) pos = 95;
      afterImg.style.width = pos + '%';
      handle.style.left = pos + '%';
    }

    container.addEventListener('mousedown', () => { isDown = true; });
    window.addEventListener('mouseup', () => { isDown = false; });
    container.addEventListener('mousemove', move);

    container.addEventListener('touchstart', () => { isDown = true; });
    window.addEventListener('touchend', () => { isDown = false; });
    container.addEventListener('touchmove', move);
  }

  // FAQ Accordion
  function initFaq() {
    document.querySelectorAll('.faq-question').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = btn.parentElement;
        item.classList.toggle('active');
      });
    });
  }

  // Booking Modal
  window.openBookingModal = function (packageName = '', serviceName = '') {
    if (bookingModal) {
      document.getElementById('modalServiceInput').value = serviceName || 'Daily Car Cleaning';
      document.getElementById('modalPlanInput').value = packageName || 'Standard Plan';
      bookingModal.classList.add('open');
    }
  };

  window.closeBookingModal = function () {
    bookingModal?.classList.remove('open');
  };

  window.claimOffer = function (code, title) {
    const text = encodeURIComponent(`Hi CWP Detailers! I want to claim the offer "${title}" using coupon code ${code}. Please share slot details for Varanasi.`);
    window.open(`https://wa.me/917054007733?text=${text}`, '_blank');
  };

  // Video Modal
  window.openVideoModal = function (title, videoSrc) {
    if (videoModal) {
      document.getElementById('videoModalTitle').textContent = title;
      if (videoFrame) {
        videoFrame.src = videoSrc || '';
      }
      videoModal.classList.add('open');
    }
  };

  window.closeVideoModal = function () {
    if (videoFrame) videoFrame.src = '';
    videoModal?.classList.remove('open');
  };

  // Legal Drawer
  window.openLegalModal = function (type) {
    if (!legalModal) return;
    if (type === 'terms') {
      legalModalTitle.textContent = 'Terms & Conditions — CWP Detailers';
      legalModalBody.innerHTML = `
        <p><strong>1. Doorstep Service Window:</strong> Daily car cleaning visits are conducted between 6:00 AM and 9:30 AM based on your assigned route sequence in Varanasi. Technicians require unobstructed gate access.</p>
        <p><strong>2. Water & Power:</strong> CWP brings 100% de-mineralized Zero-TDS RO water on-board. For deep detailing or steam extraction, standard domestic electrical connection may be requested.</p>
        <p><strong>3. Pause Policy:</strong> Members may pause recurring subscriptions at zero penalty with 24 hours advance notice via WhatsApp (7054007733).</p>
        <p><strong>4. Pricing & Taxes:</strong> All advertised rates are exclusive of 18% GST (GST Extra).</p>
      `;
    } else if (type === 'privacy') {
      legalModalTitle.textContent = 'Privacy Policy — CWP Detailers';
      legalModalBody.innerHTML = `
        <p><strong>Data Confidentiality:</strong> Your phone number, address, and vehicle registration are used strictly for service delivery, ETA tracking, and WhatsApp inspection reports. We never sell or share your data with third parties.</p>
      `;
    } else if (type === 'refund') {
      legalModalTitle.textContent = 'Satisfaction & Refund Policy';
      legalModalBody.innerHTML = `
        <p><strong>24-Hour Re-do Guarantee:</strong> If you are not satisfied with any morning clean, notify us on WhatsApp (7054007733) within 24 hours. A supervisor will inspect and re-clean your car free of charge.</p>
      `;
    }
    legalModal.classList.add('open');
  };

  window.closeLegalModal = function () {
    legalModal?.classList.remove('open');
  };

  // Handle Quick-Book Form Submission
  bookingForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = bookingForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Booking...';
    submitBtn.disabled = true;

    const name = document.getElementById('modalName').value.trim();
    const phone = document.getElementById('modalPhone').value.trim();
    const vehicle = document.getElementById('modalVehicle').value.trim();
    const locality = document.getElementById('modalLocality').value.trim();
    const service = document.getElementById('modalServiceInput').value;
    const plan = document.getElementById('modalPlanInput').value;

    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    if (!name || cleanPhone.length < 10) {
      alert('Please enter your Name and a valid 10-digit Mobile Number.');
      submitBtn.textContent = originalText;
      submitBtn.disabled = false;
      return;
    }

    // Save lead to database
    try {
      await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          phone: cleanPhone,
          vehicleModel: vehicle,
          address: locality || 'Varanasi',
          interestedService: service,
          notes: `Website Booking: ${plan} (${locality})`
        })
      });
    } catch (err) {
      console.warn('Lead capture network warning:', err);
    }

    // Open WhatsApp with pre-filled message
    const msg = encodeURIComponent(`Hi CWP Detailers! I want to book ${service} (${plan}).\nName: ${name}\nMobile: ${cleanPhone}\nVehicle: ${vehicle || 'N/A'}\nLocality: ${locality || 'Varanasi'}\nPlease confirm my slot!`);
    window.open(`https://wa.me/917054007733?text=${msg}`, '_blank');

    window.closeBookingModal();
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
    bookingForm.reset();
  });

  // Event Listeners for Service Switcher & Vehicle Tabs
  toggleCarBtn?.addEventListener('click', () => setServiceMode('car'));
  toggleSolarBtn?.addEventListener('click', () => setServiceMode('solar'));

  document.querySelectorAll('.v-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => setVehicleTab(btn.dataset.tab));
  });

  // Init
  document.addEventListener('DOMContentLoaded', () => {
    initBeforeAfterSlider();
    initFaq();
    loadConfig();
  });

})();
