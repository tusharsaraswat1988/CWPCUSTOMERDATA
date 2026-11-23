/**
 * CWP Detailers & Motors - Homepage Client Controller
 * Pure Vanilla JavaScript · Professional Clean Typography · Zero Emoji Clutter
 */

(function () {
  'use strict';

  // State
  let activeServiceMode = 'car'; // 'car' or 'solar'
  let activeCarSubSegment = 'dcc'; // 'dcc' or 'wash'
  let activeVehicleCategory = 'fiveSeater'; // 'fiveSeater' or 'fivePlusSeater'
  let activeVehicleTab = 'hatchback'; // backwards compatibility alias
  let homepageConfig = null;

  // DOM Elements
  const header = document.querySelector('.site-header');
  const toggleCarBtn = document.getElementById('toggleCarBtn');
  const toggleSolarBtn = document.getElementById('toggleSolarBtn');
  const heroEyebrow = document.getElementById('heroEyebrow');
  const heroTitle = document.getElementById('heroTitle');
  const heroDesc = document.getElementById('heroDesc');
  const heroPrimaryCta = document.getElementById('heroPrimaryCta');
  const heroSecondaryCta = document.getElementById('heroSecondaryCta');
  const trustChipsContainer = document.getElementById('trustChipsContainer');
  const clientsBrandsTitle = document.getElementById('clientsBrandsTitle');
  const clientsBrandsContainer = document.getElementById('clientsBrandsContainer');
  const clientsSocietiesTitle = document.getElementById('clientsSocietiesTitle');
  const clientsSocietiesContainer = document.getElementById('clientsSocietiesContainer');
  const routineEyebrow = document.getElementById('routineEyebrow');
  const routineTitle = document.getElementById('routineTitle');
  const routineSubtitle = document.getElementById('routineSubtitle');
  const routineCardWrap = document.getElementById('routineCardWrap');
  const pricingEyebrow = document.getElementById('pricingEyebrow');
  const pricingTitle = document.getElementById('pricingTitle');
  const pricingSubtitle = document.getElementById('pricingSubtitle');
  const carSubsegmentWrap = document.getElementById('carSubsegmentWrap');
  const vehicleCategoryWrap = document.getElementById('vehicleCategoryWrap');
  const gstNoticeBar = document.getElementById('gstNoticeBar');
  const pricingCardsContainer = document.getElementById('pricingCardsContainer');
  const pricingFootnote = document.getElementById('pricingFootnote');
  const detailingHighlightsWrap = document.getElementById('detailingHighlightsWrap');
  const brandsShowcaseWrap = document.getElementById('brandsShowcaseWrap');
  const baTitle = document.getElementById('baTitle');
  const baSubtitle = document.getElementById('baSubtitle');
  const baTagBefore = document.getElementById('baTagBefore');
  const baTagAfter = document.getElementById('baTagAfter');
  const reviewsSubtitle = document.getElementById('reviewsSubtitle');
  const reviewsContainer = document.getElementById('reviewsContainer');
  const faqSubtitle = document.getElementById('faqSubtitle');
  const faqAccordion = document.getElementById('faqAccordion');

  // Google Rating & Review Link Elements
  const heroGoogleRatingBadge = document.getElementById('heroGoogleRatingBadge');
  const heroRatingBadgeReviews = document.getElementById('heroRatingBadgeReviews');
  const btnReadAllReviews = document.getElementById('btnReadAllReviews');
  const officeMapBtn = document.getElementById('officeMapBtn');

  const GOOGLE_REVIEW_URL_CAR = 'https://share.google/BptJhx2p3xlUiIC4d';
  const GOOGLE_REVIEW_URL_SOLAR = 'https://share.google/1sg9sRwZpnyFeYQty';

  // Drawer Elements
  const menuToggleBtn = document.getElementById('menuToggleBtn');
  const drawerCloseBtn = document.getElementById('drawerCloseBtn');
  const navDrawerBackdrop = document.getElementById('navDrawerBackdrop');

  // Modals
  const bookingModal = document.getElementById('bookingModal');
  const bookingForm = document.getElementById('bookingForm');
  const videoModal = document.getElementById('videoModal');
  const videoFrame = document.getElementById('videoFrame');
  const legalModal = document.getElementById('legalModal');
  const legalModalTitle = document.getElementById('legalModalTitle');
  const legalModalBody = document.getElementById('legalModalBody');

  // Sticky header shadow on scroll
  window.addEventListener('scroll', () => {
    if (window.scrollY > 20) {
      header?.classList.add('scrolled');
    } else {
      header?.classList.remove('scrolled');
    }
  });

  // Drawer controls
  window.openDrawer = function () {
    navDrawerBackdrop?.classList.add('open');
    document.body.style.overflow = 'hidden';
  };

  window.closeDrawer = function () {
    navDrawerBackdrop?.classList.remove('open');
    document.body.style.overflow = '';
  };

  window.handleDrawerServiceClick = function (mode) {
    setServiceMode(mode);
    window.closeDrawer();
  };

  menuToggleBtn?.addEventListener('click', window.openDrawer);
  drawerCloseBtn?.addEventListener('click', window.closeDrawer);
  navDrawerBackdrop?.addEventListener('click', (e) => {
    if (e.target === navDrawerBackdrop) {
      window.closeDrawer();
    }
  });

  // Escape key closes modals and drawer
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      window.closeDrawer();
      window.closeBookingModal();
      window.closeVideoModal();
      window.closeLegalModal();
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
        if (officeMapBtn && homepageConfig.contact && homepageConfig.contact.googleMapsUrl) {
          officeMapBtn.href = homepageConfig.contact.googleMapsUrl;
        }
        // Update Google Rating & Reviews links according to active mode
        updateRatingAndReviewLinks(activeServiceMode);
      }
    } catch (e) {
      console.warn('Config fetch error, using built-in defaults:', e);
    }
  }

  function updateRatingAndReviewLinks(mode) {
    if (mode === 'solar') {
      const solarReviewUrl = (homepageConfig && homepageConfig.contact && homepageConfig.contact.googleReviewSolarUrl) || GOOGLE_REVIEW_URL_SOLAR;
      if (heroGoogleRatingBadge) {
        heroGoogleRatingBadge.href = solarReviewUrl;
        heroGoogleRatingBadge.title = 'View genuine KleanSolar verified reviews on Google Maps';
      }
      if (heroRatingBadgeReviews) {
        heroRatingBadgeReviews.textContent = '· Verified Solar Reviews in Varanasi';
      }
      if (btnReadAllReviews) {
        btnReadAllReviews.href = solarReviewUrl;
        btnReadAllReviews.innerHTML = 'Read KleanSolar Reviews on Google Maps ↗';
      }
    } else {
      const carReviewUrl = (homepageConfig && homepageConfig.contact && homepageConfig.contact.googleReviewCarUrl) || GOOGLE_REVIEW_URL_CAR;
      if (heroGoogleRatingBadge) {
        heroGoogleRatingBadge.href = carReviewUrl;
        heroGoogleRatingBadge.title = 'View genuine verified CWP Detailers reviews on Google Maps';
      }
      if (heroRatingBadgeReviews) {
        heroRatingBadgeReviews.textContent = '· 100+ Verified Reviews in Varanasi';
      }
      if (btnReadAllReviews) {
        btnReadAllReviews.href = carReviewUrl;
        btnReadAllReviews.innerHTML = 'Read All 100+ Reviews on Google Maps ↗';
      }
    }
  }

  // Switch between Car Care and Solar Care (Complete Clean Decoupling)
  function setServiceMode(mode) {
    activeServiceMode = mode;

    if (mode === 'solar') {
      toggleSolarBtn?.classList.add('active', 'solar-active');
      toggleCarBtn?.classList.remove('active');

      // Hero Section
      if (heroEyebrow) {
        heroEyebrow.textContent = 'ROOFTOP SOLAR PANEL CLEANING IN VARANASI';
        heroEyebrow.classList.add('amber');
      }
      if (heroTitle) {
        heroTitle.innerHTML = 'Rooftop Solar Ki Safai, <span class="highlight">Bijli Generation Badhai.</span>';
        heroTitle.classList.add('solar-mode');
      }
      if (heroDesc) {
        heroDesc.textContent = 'Varanasi ki dhool aur scaling se solar generation 20-30% gir jaata hai. CWP ke specialized soft-water wash aur non-abrasive technique se panels ko banaiye dust-free.';
      }
      if (heroPrimaryCta) {
        heroPrimaryCta.textContent = 'Get Solar Rooftop Quote →';
        heroPrimaryCta.setAttribute('onclick', "window.openBookingModal('Solar Hero Quote', 'Solar Panel Cleaning')");
      }
      if (heroSecondaryCta) {
        heroSecondaryCta.textContent = 'View Solar Packages';
      }

      // Trust Chips
      renderTrustChips('solar');

      // Marquee Badges
      renderClients('solar');

      // Routine Timeline
      renderRoutine('solar');

      // Pricing Header & Tabs
      if (pricingEyebrow) {
        pricingEyebrow.textContent = 'Services & Rates';
        pricingEyebrow.classList.add('amber');
      }
      if (pricingTitle) {
        pricingTitle.textContent = 'Rooftop Solar Panel Cleaning Rate Card';
      }
      if (pricingSubtitle) {
        pricingSubtitle.textContent = 'Glass-safe soft-water wash & anti-scaling care across Varanasi. GST additional.';
      }
      if (carSubsegmentWrap) carSubsegmentWrap.style.display = 'none';
      if (vehicleCategoryWrap) vehicleCategoryWrap.style.display = 'none';
      if (detailingHighlightsWrap) detailingHighlightsWrap.style.display = 'none';
      if (brandsShowcaseWrap) brandsShowcaseWrap.style.display = 'none';
      if (pricingFootnote) {
        pricingFootnote.textContent = 'One-time cleaning minimum billing ₹800. All rates are per panel per visit. GST additional.';
        pricingFootnote.style.display = 'block';
      }

      // Before / After Slider
      renderBeforeAfter('solar');

      // Reviews
      renderReviews('solar');

      // FAQs
      renderFaqs('solar');

      // Google Rating & Review Links (KleanSolar)
      updateRatingAndReviewLinks('solar');

    } else {
      toggleCarBtn?.classList.add('active');
      toggleSolarBtn?.classList.remove('active', 'solar-active');

      // Hero Section
      if (heroEyebrow) {
        heroEyebrow.textContent = 'VARANASI\'S #1 DOORSTEP AUTO SPECIALISTS';
        heroEyebrow.classList.remove('amber');
      }
      if (heroTitle) {
        heroTitle.innerHTML = 'Ab gaadiyaan hongi <span class="highlight">roj saaf.</span>';
        heroTitle.classList.remove('solar-mode');
      }
      if (heroDesc) {
        heroDesc.textContent = 'Regular doorstep cleaning, professional detailing and recurring care plans — trained CWP specialists at your gate, every week. No colony-cleaner swirls, treated soft-water & scratch-free care.';
      }
      if (heroPrimaryCta) {
        heroPrimaryCta.textContent = 'Book Doorstep Service →';
        heroPrimaryCta.setAttribute('onclick', "window.openBookingModal('Hero Booking', 'Daily Car Cleaning')");
      }
      if (heroSecondaryCta) {
        heroSecondaryCta.textContent = 'View Plans & Pricing';
      }

      // Trust Chips
      renderTrustChips('car');

      // Marquee Badges
      renderClients('car');

      // Routine Timeline
      renderRoutine('car');

      // Pricing Header & Tabs
      if (pricingEyebrow) {
        pricingEyebrow.textContent = 'Complete Rate Card';
        pricingEyebrow.classList.remove('amber');
      }
      if (pricingTitle) {
        pricingTitle.textContent = 'Transparent Doorstep Service Rates';
      }
      if (pricingSubtitle) {
        pricingSubtitle.textContent = 'Professional doorstep car maintenance, deep car washes, and detailing. GST additional.';
      }
      if (carSubsegmentWrap) carSubsegmentWrap.style.display = 'flex';
      if (vehicleCategoryWrap) vehicleCategoryWrap.style.display = 'flex';
      if (detailingHighlightsWrap) detailingHighlightsWrap.style.display = 'grid';
      if (brandsShowcaseWrap) brandsShowcaseWrap.style.display = 'block';
      if (pricingFootnote) {
        pricingFootnote.style.display = 'block';
      }

      // Before / After Slider
      renderBeforeAfter('car');

      // Reviews
      renderReviews('car');

      // FAQs
      renderFaqs('car');

      // Google Rating & Review Links (CWP Detailers)
      updateRatingAndReviewLinks('car');
    }

    renderPricing();
  }
  window.setServiceMode = setServiceMode;

  // Render Trust Chips dynamically (Clean text, zero emoji clutter)
  function renderTrustChips(mode) {
    if (!trustChipsContainer) return;
    if (mode === 'solar') {
      trustChipsContainer.innerHTML = `
        <div class="trust-chip" style="border-color: #fde68a; background: #fffbeb;">20% to 30% Higher Power Generation</div>
        <div class="trust-chip" style="border-color: #fde68a; background: #fffbeb;">Spot-Free Soft Water Wash (No Scaling)</div>
        <div class="trust-chip">Anti-Scratch Soft Telescopic Brushes</div>
        <div class="trust-chip">Rooftop Safety Harness Certified Staff</div>
        <div class="trust-chip">Inverter Reading Verified Before & After</div>
        <div class="trust-chip">Residential & Commercial (3kW to 100kW+)</div>
      `;
    } else {
      trustChipsContainer.innerHTML = `
        <div class="trust-chip">Treated Soft-Water Wash (Spot-Free Finish)</div>
        <div class="trust-chip">2-Bucket Microfiber Technique</div>
        <div class="trust-chip">WhatsApp Photos Every Visit</div>
        <div class="trust-chip">24-Hour Re-Do Guarantee</div>
        <div class="trust-chip">On-Time Gate Arrival (6:30 – 9:00 AM)</div>
        <div class="trust-chip">Sigra, Cantt & All Varanasi</div>
      `;
    }
  }

  // Render Clients / Supported Brands dynamically (Clean professional badges)
  function renderClients(mode) {
    if (!clientsBrandsContainer || !clientsSocietiesContainer) return;
    if (mode === 'solar') {
      if (clientsBrandsTitle) clientsBrandsTitle.textContent = 'Supported Solar Systems & Inverters';
      clientsBrandsContainer.innerHTML = `
        <span class="client-badge">Tata Power Solar</span>
        <span class="client-badge">Luminous Solar</span>
        <span class="client-badge">Microtek</span>
        <span class="client-badge">Havells Solar</span>
        <span class="client-badge">Waaree Energies</span>
        <span class="client-badge">Adani Solar</span>
      `;
      if (clientsSocietiesTitle) clientsSocietiesTitle.textContent = 'Key Rooftop Sites in Varanasi';
      clientsSocietiesContainer.innerHTML = `
        <span class="client-badge">Mahmoorganj Commercial</span>
        <span class="client-badge">Sigra Residential</span>
        <span class="client-badge">Lanka Educational</span>
        <span class="client-badge">Rohania Industrial</span>
        <span class="client-badge">Cantt Enclaves</span>
      `;
    } else {
      if (clientsBrandsTitle) clientsBrandsTitle.textContent = 'Supported Vehicle Brands';
      clientsBrandsContainer.innerHTML = `
        <span class="client-badge">Mercedes-Benz</span>
        <span class="client-badge">BMW</span>
        <span class="client-badge">Audi</span>
        <span class="client-badge">Toyota Fortuner & Innova</span>
        <span class="client-badge">Hyundai Creta & Verna</span>
        <span class="client-badge">Tata Safari & Nexon</span>
      `;
      if (clientsSocietiesTitle) clientsSocietiesTitle.textContent = 'Varanasi Societies & Localities';
      clientsSocietiesContainer.innerHTML = `
        <span class="client-badge">Sigra Greens</span>
        <span class="client-badge">Mahmoorganj Enclave</span>
        <span class="client-badge">Cantt Officers Enclave</span>
        <span class="client-badge">Ravindrapuri</span>
        <span class="client-badge">Bhelupur</span>
      `;
    }
  }

  // Render Signature Routine dynamically
  function renderRoutine(mode) {
    if (!routineCardWrap) return;
    if (mode === 'solar') {
      if (routineEyebrow) {
        routineEyebrow.textContent = 'Rooftop Solar Routine';
        routineEyebrow.classList.add('amber');
      }
      if (routineTitle) {
        routineTitle.innerHTML = 'Peak dhoop khilne se pehle,<br>panels ready for maximum units.';
      }
      if (routineSubtitle) {
        routineSubtitle.textContent = 'Varanasi ki dhool aur hard water scaling se 20-30% generation loss hota hai. Scientific RO wash se units generation turant spike karta hai.';
      }
      routineCardWrap.innerHTML = `
        <div class="timeline-header">
          <div>
            <strong style="font-size: 1.125rem;">CWP Rooftop Solar Cleaning Protocol</strong>
            <div style="font-size: 0.875rem; color: var(--md-sys-color-on-surface-variant);">Residential & Commercial Installations · Mahmoorganj / Sigra / Lanka</div>
          </div>
          <span class="eyebrow amber">Max Output Focus</span>
        </div>

        <div class="timeline-step-list">
          <div class="timeline-step">
            <span class="timeline-time amber">Step 1</span>
            <h3 class="timeline-title">Rooftop Safety Setup</h3>
            <p class="timeline-desc">Certified technicians anchor safety harnesses and assemble telescopic soft-wash system with treated soft water.</p>
          </div>
          <div class="timeline-step">
            <span class="timeline-time amber">Step 2</span>
            <h3 class="timeline-title">Current Output Noted</h3>
            <p class="timeline-desc">Technician records current inverter generation reading (kW output) to establish baseline before wash.</p>
          </div>
          <div class="timeline-step">
            <span class="timeline-time amber">Step 3</span>
            <h3 class="timeline-title">Glass-Safe Soft Wash</h3>
            <p class="timeline-desc">Treated soft water and specialized non-abrasive soft fiber brush dissolve baked-on dust and bird droppings safely.</p>
          </div>
          <div class="timeline-step">
            <span class="timeline-time amber">Step 4</span>
            <h3 class="timeline-title">Power Surge Verified</h3>
            <p class="timeline-desc">Inverter display verified for immediate power surge. Before & after generation report sent directly to your WhatsApp.</p>
          </div>
        </div>

        <div class="timeline-footer">
          <span style="font-size: 0.9375rem; font-weight: 600;">Average power generation increase:</span>
          <span class="effort-metric">+20% to +30% Units Surge</span>
        </div>
      `;
    } else {
      if (routineEyebrow) {
        routineEyebrow.textContent = 'Signature Routine';
        routineEyebrow.classList.remove('amber');
      }
      if (routineTitle) {
        routineTitle.innerHTML = 'Subah ki pehli chai ke saath,<br>showroom jaisi chamak aapke gate par.';
      }
      if (routineSubtitle) {
        routineSubtitle.textContent = 'No daily reminders, no colony-cleaner drama, no wasted Sundays. Here is how CWP delivers peace of mind every single morning.';
      }
      routineCardWrap.innerHTML = `
        <div class="timeline-header">
          <div>
            <strong style="font-size: 1.125rem;">A Typical CWP Morning in Varanasi</strong>
            <div style="font-size: 0.875rem; color: var(--md-sys-color-on-surface-variant);">Tuesday · Bhelupur / Sigra · Recurring Morning Plan</div>
          </div>
          <span class="eyebrow">Zero Owner Effort</span>
        </div>

        <div class="timeline-step-list">
          <div class="timeline-step">
            <span class="timeline-time">6:42 AM</span>
            <h3 class="timeline-title">Dispatched from Hub</h3>
            <p class="timeline-desc">Specialist dispatched from our Sigra hub with onboard treated water supply and battery pressure gear.</p>
          </div>
          <div class="timeline-step">
            <span class="timeline-time">6:58 AM</span>
            <h3 class="timeline-title">Arrived Silently</h3>
            <p class="timeline-desc">Uniformed, ID-badged specialist arrives at your gate. Silent setup, your household remains completely undisturbed.</p>
          </div>
          <div class="timeline-step">
            <span class="timeline-time">7:12 AM</span>
            <h3 class="timeline-title">Cleaned & Inspected</h3>
            <p class="timeline-desc">2-bucket scratch-free wash, glass polish & tire dressing completed. Digital photos uploaded to WhatsApp.</p>
          </div>
          <div class="timeline-step">
            <span class="timeline-time">8:30 AM</span>
            <h3 class="timeline-title">You Drive Away</h3>
            <p class="timeline-desc">You open the front door for your commute. Clean, gleaming car waiting. Unlock, sit down, and drive.</p>
          </div>
        </div>

        <div class="timeline-footer">
          <span style="font-size: 0.9375rem; font-weight: 600;">Total customer time spent today:</span>
          <span class="effort-metric">0 Minutes (Effortless)</span>
        </div>
      `;
    }
  }

  // Render Before / After Slider dynamically
  function renderBeforeAfter(mode) {
    if (!baTitle || !baSubtitle || !baTagBefore || !baTagAfter) return;
    if (mode === 'solar') {
      baTitle.textContent = 'Interactive Before & After: Rooftop Solar Panels';
      baSubtitle.textContent = 'Drag the slider handle to see dust & bird droppings removal with zero glass scratches.';
      baTagBefore.textContent = 'Before Clean (Thick Dust & Scaling)';
      baTagAfter.textContent = '+28% Power Generation (Clean Glass)';
    } else {
      baTitle.textContent = 'Interactive Before & After: Car Paint Care';
      baSubtitle.textContent = 'Drag the slider handle to inspect swirl mark removal and mirror finish gloss.';
      baTagBefore.textContent = 'Before Wash (Dust & Swirls)';
      baTagAfter.textContent = 'Cleaned & Mirror Finish';
    }
  }

  // Render Reviews dynamically
  function renderReviews(mode) {
    if (!reviewsContainer || !reviewsSubtitle) return;
    if (mode === 'solar') {
      reviewsSubtitle.textContent = 'Verified client reviews from rooftop solar installations across Varanasi.';
      reviewsContainer.innerHTML = `
        <div class="review-card">
          <div class="review-top">
            <div class="author-avatar amber">SS</div>
            <div>
              <div class="author-name">Mr. Salil Shah</div>
              <div class="author-location">Sigra, Varanasi · Director, Lakshmishree Investment Pvt Ltd</div>
            </div>
          </div>
          <div class="review-stars">★★★★★</div>
          <p class="review-quote">
            "We manage a 120-panel solar setup at our office rooftop in Varanasi. Dust accumulation and bird droppings were causing a 20–25% drop in generation, while normal tap water risked mineral scaling on the glass. CWP's annual AMC has been completely hassle-free — their technicians arrive on schedule with specialized RO soft-wash equipment and safety gear. Our power generation is consistently at its peak. Exceptional corporate reliability."
          </p>
        </div>

        <div class="review-card">
          <div class="review-top">
            <div class="author-avatar amber">AS</div>
            <div>
              <div class="author-name">Dr. Alok Srivastava</div>
              <div class="author-location">Mahmoorganj, Varanasi · 5 kW Rooftop Solar</div>
            </div>
          </div>
          <div class="review-stars">★★★★★</div>
          <p class="review-quote">
            "Heavy roadside dust in Varanasi reduced our solar generation from 14 units down to 10 units daily. After CWP's specialized soft-wash cleaning, output immediately rebounded to 13.8 units. The difference is clearly visible on our inverter display every single day."
          </p>
        </div>

        <div class="review-card">
          <div class="review-top">
            <div class="author-avatar amber">RK</div>
            <div>
              <div class="author-name">Rajeshwar Keshari</div>
              <div class="author-location">Ravindrapuri, Varanasi · 3 kW On-Grid Solar</div>
            </div>
          </div>
          <div class="review-stars">★★★★★</div>
          <p class="review-quote">
            "Their technicians follow proper rooftop safety protocols with safety harnesses and glass-safe telescopic brushes. We receive clean panel photos and generation readings on WhatsApp after every visit. Truly dependable solar maintenance in Varanasi."
          </p>
        </div>
      `;
    } else {
      reviewsSubtitle.textContent = 'Verified reviews from car and bike owners across Varanasi.';
      reviewsContainer.innerHTML = `
        <div class="review-card">
          <div class="review-top">
            <div class="author-avatar">AM</div>
            <div>
              <div class="author-name">Mr. Apurv Mittal</div>
              <div class="author-location">Sigra, Varanasi · Founder, Vyapari Network</div>
            </div>
          </div>
          <div class="review-stars">★★★★★</div>
          <p class="review-quote">
            "With Varanasi's dust and road conditions, keeping a car presentable every morning was always a headache. Most local cleaners use hard tap water and the same dusty cloth, which ruins the clear coat with swirl marks. CWP has set a genuinely professional benchmark — their team arrives punctually at 6:30 AM, uses treated soft water with clean microfibers, and ensures the car is spotless before my morning meetings. Absolute peace of mind for daily maintenance."
          </p>
        </div>

        <div class="review-card">
          <div class="review-top">
            <div class="author-avatar">RP</div>
            <div>
              <div class="author-name">Mr. Rajat Pathak</div>
              <div class="author-location">Cantt, Varanasi · Founder, Synergy Group</div>
            </div>
          </div>
          <div class="review-stars">★★★★★</div>
          <p class="review-quote">
            "Spending half a Sunday waiting in line at washing centers in Varanasi was never practical. CWP completely solved that — their self-powered mobile rig comes straight to my driveway for deep pressure foam washes, and the interior detailing leaves the car in showroom condition. Paired with their reliable daily cleaning, it saves me valuable hours every week. Easily the most organized doorstep auto care in Varanasi."
          </p>
        </div>

        <div class="review-card">
          <div class="review-top">
            <div class="author-avatar">JS</div>
            <div>
              <div class="author-name">Dr. Jyoti Singh</div>
              <div class="author-location">Ravindrapuri, Varanasi · Healer</div>
            </div>
          </div>
          <div class="review-stars">★★★★★</div>
          <p class="review-quote">
            "Riding across Varanasi with daily dust and monsoon slush makes two-wheeler upkeep tricky. I opted for CWP's ceramic coating for my bike, and the results have been remarkable. The paint depth and gloss look pristine, and the hydrophobic layer is so effective that mud and road grime wipe right off without scratching. The team is courteous, detail-oriented, and genuinely takes pride in their craft."
          </p>
        </div>
      `;
    }
  }

  // Render FAQs dynamically
  function renderFaqs(mode) {
    if (!faqAccordion || !faqSubtitle) return;
    if (mode === 'solar') {
      faqSubtitle.textContent = 'Everything you need to know about rooftop solar panel cleaning and generation boost in Varanasi.';
      faqAccordion.innerHTML = `
        <div class="faq-item">
          <button class="faq-question">
            <span>Normal nal ya boring ke paani se solar panels kyu nahi dhone chahiye?</span>
            <span class="faq-icon">▼</span>
          </button>
          <div class="faq-answer">
            Varanasi ke ground water mein high mineral hardness aur calcium hota hai. Nal ke paani se dhone par glass par permanent safed scale (hard water spots) jam jaati hai, jisse solar cells dhoop absorb nahi kar pate aur 'hot-spots' banne se panel damage ho sakta hai. CWP treated soft water aur glass-safe soft wash technique use karta hai jisse koi hard water scaling nahi jamti.
          </div>
        </div>

        <div class="faq-item">
          <button class="faq-question">
            <span>Varanasi mein solar panels ko kitne dino mein saaf karwana chahiye?</span>
            <span class="faq-icon">▼</span>
          </button>
          <div class="faq-answer">
            Varanasi ke heavy road traffic aur construction dust ke chalte har 20 se 30 din mein ek baar cleaning zaroori hai. 1 mahine dhool jamne se solar output 20% se 30% tak gir jaata hai. Hamara 6-Month ya 12-Month plan auto-scheduled visits ensure karta hai.
          </div>
        </div>

        <div class="faq-item">
          <button class="faq-question">
            <span>Kya cleaning ke dauran solar panels ya roof glass scratch hone ka koi risk hai?</span>
            <span class="faq-icon">▼</span>
          </button>
          <div class="faq-answer">
            Bilkul zero risk! Hamare certified technicians non-abrasive soft fiber telescopic brushes use karte hain jo specifically photovoltaic glass ke liye designed hain. Koi metal wiper ya harsh abrasive cloth use nahi hota. Saath hi technicians safety harness aur roof protection equipment ke saath kaam karte hain.
          </div>
        </div>

        <div class="faq-item">
          <button class="faq-question">
            <span>Cleaning ke baad bijli generation mein kitna increase hota hai?</span>
            <span class="faq-icon">▼</span>
          </button>
          <div class="faq-answer">
            Agar panels par 3-4 hafte ki dhool hai, toh CWP ke soft-wash cleaning ke baad turant 15% se 30% units ka generation jump hota hai. Aap cleaning ke 15 minute baad apne solar inverter display ya mobile app par live generation boost dekh sakte hain.
          </div>
        </div>
      `;
    } else {
      faqSubtitle.textContent = 'Everything you need to know about doorstep car cleaning and recurring care in Varanasi.';
      faqAccordion.innerHTML = `
        <div class="faq-item">
          <button class="faq-question">
            <span>Kya mujhe subah gaadi ke paas rehna hoga?</span>
            <span class="faq-icon">▼</span>
          </button>
          <div class="faq-answer">
            Nahi! Hamare trained aur verified technicians gate par silent wash karte hain. Aap ghar ke andar aaram se chai enjoy karein — kaam complete hone ke baad before & after photo report aapke WhatsApp par aa jaati hai.
          </div>
        </div>

        <div class="faq-item">
          <button class="faq-question">
            <span>CWP ke treated water wash aur ordinary colony wash mein kya farq hai?</span>
            <span class="faq-icon">▼</span>
          </button>
          <div class="faq-answer">
            Varanasi ke ground water mein excessive mineral hardness aur calcium hota hai, jisse car ke clear coat par safed daag (hard water spots) jam jaate hain. CWP treated soft water aur pH-neutral automotive shampoo use karta hai, jisse paint par spots nahi aate aur clear coat सुरक्षित rehta hai.
          </div>
        </div>

        <div class="faq-item">
          <button class="faq-question">
            <span>Kya vacation ya travel par jane par plan pause ho sakta hai?</span>
            <span class="faq-icon">▼</span>
          </button>
          <div class="faq-answer">
            Haan, bilkul! Aap WhatsApp par 7054007733 par message bhejkar apni dates pause kar sakte hain. Aapke un-used days agle cycle mein add ho jaate hain — koi extra charge nahi.
          </div>
        </div>

        <div class="faq-item">
          <button class="faq-question">
            <span>Daily wash mein kya-kya include hota hai?</span>
            <span class="faq-icon">▼</span>
          </button>
          <div class="faq-answer">
            Daily clean plan mein 26 exterior visits per month hote hain jisme treated soft-water rinse, 2-bucket microfiber body wash, windshield glass polishing, tire dressing, aur daily WhatsApp photo log shamil hota hai.
          </div>
        </div>
      `;
    }
    initFaq();
  }

  // Switch car sub-segment (DCC vs Doorstep Car Wash)
  window.setCarSubSegment = function (sub) {
    activeCarSubSegment = sub;
    document.getElementById('subtabDcc')?.classList.toggle('active', sub === 'dcc');
    document.getElementById('subtabWash')?.classList.toggle('active', sub === 'wash');
    renderPricing();
  };

  // Switch vehicle category (5-Seater vs 5+ Seater)
  window.setVehicleCategory = function (cat) {
    activeVehicleCategory = cat;
    document.getElementById('vPill5Seater')?.classList.toggle('active', cat === 'fiveSeater');
    document.getElementById('vPill5PlusSeater')?.classList.toggle('active', cat === 'fivePlusSeater');
    renderPricing();
  };

  // Backward compatibility alias for tests
  function setVehicleTab(tabKey) {
    activeVehicleTab = tabKey;
    if (tabKey === 'fullSuvLuxury') {
      window.setVehicleCategory('fivePlusSeater');
    } else {
      window.setVehicleCategory('fiveSeater');
    }
    renderPricing();
  }
  window.setVehicleTab = setVehicleTab;

  // Render pricing cards dynamically
  function renderPricing() {
    if (!pricingCardsContainer) return;

    if (activeServiceMode === 'solar') {
      pricingCardsContainer.className = 'pricing-cards-grid';
      pricingCardsContainer.innerHTML = `
        <div class="solar-matrix-wrapper">
          <div class="solar-matrix-header">
            <h3 class="solar-matrix-title">Services &amp; Rates — Solar Panel Cleaning</h3>
            <p class="solar-matrix-subtitle">Glass-safe soft-water wash &amp; anti-scaling care across Varanasi. GST additional.</p>
          </div>

          <div class="table-responsive">
            <table class="solar-matrix-table">
              <thead>
                <tr>
                  <th>Service / Plan</th>
                  <th>1 To 30 PANELS<br><span class="col-sub">Residential Rooftop</span></th>
                  <th>30 To 100 PANELS<br><span class="col-sub">Commercial / Villa</span></th>
                  <th>100+ Plus<br><span class="col-sub">Industrial / Society</span></th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="row-label">
                    <strong>ONE TIME</strong>
                    <span class="row-sub">Single Deep Clean</span>
                  </td>
                  <td class="cell-price">
                    <span class="price-val">₹60</span>
                    <span class="price-per">per panel</span>
                    <span class="price-min">(Min. billing ₹800)</span>
                  </td>
                  <td class="cell-price">
                    <span class="price-val">₹50</span>
                    <span class="price-per">per panel</span>
                  </td>
                  <td class="cell-custom" rowspan="3">
                    <div class="custom-quote-badge">
                      <strong>साइट विजिट के बाद फैसला लिया जाएगा</strong>
                      <span>Decided after site inspection</span>
                      <button class="btn-primary btn-sm" onclick="window.openBookingModal('Solar 100+ Commercial Quote', 'Solar Panel Cleaning')">
                        Book Site Visit →
                      </button>
                    </div>
                  </td>
                </tr>
                <tr class="row-highlight">
                  <td class="row-label">
                    <strong>6 MONTHS</strong>
                    <span class="row-sub">Bi-Annual Maintenance</span>
                  </td>
                  <td class="cell-price">
                    <span class="price-val">₹50</span>
                    <span class="price-per">per panel / visit</span>
                  </td>
                  <td class="cell-price">
                    <span class="price-val">₹45</span>
                    <span class="price-per">per panel / visit</span>
                  </td>
                </tr>
                <tr>
                  <td class="row-label">
                    <strong>12 MONTHS</strong>
                    <span class="row-sub">Annual Peace of Mind</span>
                  </td>
                  <td class="cell-price">
                    <span class="price-val">₹45</span>
                    <span class="price-per">per panel / visit</span>
                  </td>
                  <td class="cell-price">
                    <span class="price-val">₹40</span>
                    <span class="price-per">per panel / visit</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="solar-quick-actions">
            <button class="btn-primary" onclick="window.openBookingModal('Solar One-Time Clean (₹60/panel)', 'Solar Panel Cleaning')">
              Book One-Time Clean (₹60/panel)
            </button>
            <button class="btn-secondary" onclick="window.openBookingModal('Solar 6-Month AMC (₹50/panel)', 'Solar Panel Cleaning')">
              Book 6-Month AMC (₹50/panel)
            </button>
            <button class="btn-secondary" onclick="window.openBookingModal('Solar 12-Month AMC (₹45/panel)', 'Solar Panel Cleaning')">
              Book 12-Month AMC (₹45/panel)
            </button>
          </div>
        </div>
      `;

      if (pricingFootnote) {
        pricingFootnote.textContent = 'One-time cleaning minimum billing ₹800. All rates are per panel per visit. GST additional.';
      }
      return;
    }

    // Car Care Segment
    const isFiveSeater = activeVehicleCategory === 'fiveSeater';
    const catLabel = isFiveSeater ? '5-Seater Car' : '5+ Seater Car';

    if (activeCarSubSegment === 'wash') {
      // 2. Doorstep Car Wash & Packages
      const oneTimeRate = isFiveSeater ? 600 : 700;
      const subRate = isFiveSeater ? 1800 : 2100;
      const perWashCost = isFiveSeater ? 450 : 525;
      const savings = isFiveSeater ? 600 : 700;

      pricingCardsContainer.className = 'pricing-cards-grid two-col';
      pricingCardsContainer.innerHTML = `
        <div class="pricing-card">
          <div class="card-badge" style="background-color: var(--md-sys-color-secondary);">One-Time Service</div>
          <h3 class="pkg-title">Doorstep Car Wash</h3>
          <p class="pkg-desc">Segment: Individual customers / Non-subscription single doorstep visit.</p>
          <div class="pkg-price-wrap">
            <span class="price-currency">₹</span>
            <span class="price-num">${oneTimeRate.toLocaleString('en-IN')}</span>
            <span class="price-unit">/ wash</span>
            <span class="price-gst-tag">GST additional (${catLabel})</span>
          </div>
          <ul class="feature-list">
            <li class="feature-item"><span class="check">✓</span> <strong>Interior:</strong> Dry vacuuming of seats, floor &amp; boot</li>
            <li class="feature-item"><span class="check">✓</span> <strong>Interior:</strong> Foot mat wash &amp; dust extraction</li>
            <li class="feature-item"><span class="check">✓</span> <strong>Interior:</strong> Gate pads &amp; dashboard light polishing</li>
            <li class="feature-item"><span class="check">✓</span> <strong>Glass:</strong> Windshield &amp; window glass cleaning</li>
            <li class="feature-item"><span class="check">✓</span> <strong>Exterior:</strong> Snow foam hand wash (Treated soft water)</li>
            <li class="feature-item"><span class="check">✓</span> <strong>Exterior:</strong> Tyre dressing &amp; exterior trim polishing</li>
            <li class="feature-item"><span class="check">✓</span> <em>Hand Waxing Extra</em></li>
          </ul>
          <button class="btn-primary" onclick="window.openBookingModal('Doorstep Car Wash (${catLabel} ₹${oneTimeRate})', 'Doorstep Car Wash')">
            Book One-Time Wash (₹${oneTimeRate})
          </button>
        </div>

        <div class="pricing-card featured">
          <div class="card-badge">Save ₹${savings}</div>
          <h3 class="pkg-title">Car Wash Subscription</h3>
          <p class="pkg-desc">Segment: Subscription customers · 4 washes · 6-month validity</p>
          <div class="pkg-price-wrap">
            <span class="price-currency">₹</span>
            <span class="price-num">${subRate.toLocaleString('en-IN')}</span>
            <span class="price-unit">for 4 washes</span>
            <span class="price-gst-tag">Only ₹${perWashCost}/wash · GST additional (${catLabel})</span>
          </div>
          <ul class="feature-list">
            <li class="feature-item"><span class="check">✓</span> <strong>4 Full Doorstep Washes</strong> with 6-month flexible validity</li>
            <li class="feature-item"><span class="check">✓</span> <strong>Interior:</strong> Dry vacuuming, mat cleaning &amp; glass wipe</li>
            <li class="feature-item"><span class="check">✓</span> <strong>Interior:</strong> Gate pads &amp; dashboard light polish</li>
            <li class="feature-item"><span class="check">✓</span> <strong>Exterior:</strong> Snow foam wash with treated soft water</li>
            <li class="feature-item"><span class="check">✓</span> <strong>Exterior:</strong> Tyre &amp; trim conditioning</li>
            <li class="feature-item"><span class="check">✓</span> Book anytime via WhatsApp when convenient</li>
            <li class="feature-item"><span class="check">✓</span> <em>Hand Waxing Extra</em></li>
          </ul>
          <button class="btn-primary" onclick="window.openBookingModal('Car Wash Subscription (${catLabel} 4 Washes ₹${subRate})', 'Car Wash Subscription')">
            Get 4-Wash Subscription (₹${subRate})
          </button>
        </div>
      `;

      if (pricingFootnote) {
        pricingFootnote.textContent = 'Car wash includes Interior Dry Vacuuming, Mat Cleaning, Interior Gate and Dashboard Light Polishing, Glass Cleaning, Exterior Foam Wash, Tyre and Trim Polishing. Hand Waxing Extra. GST additional.';
      }
      return;
    }

    // 1. Daily Car Cleaning (DCC)
    const dccRates = isFiveSeater
      ? { basic: 1100, silver: 1500, gold: 2000 }
      : { basic: 1200, silver: 1600, gold: 2200 };

    pricingCardsContainer.className = 'pricing-cards-grid';
    pricingCardsContainer.innerHTML = `
      <div class="pricing-card">
        <h3 class="pkg-title">Basic DCC</h3>
        <p class="pkg-desc">Segment: Daily maintenance customers · Clean exterior at your gate every morning.</p>
        <div class="pkg-price-wrap">
          <span class="price-currency">₹</span>
          <span class="price-num">${dccRates.basic.toLocaleString('en-IN')}</span>
          <span class="price-unit">/ month</span>
          <span class="price-gst-tag">GST additional (${catLabel})</span>
        </div>
        <ul class="feature-list">
          <li class="feature-item"><span class="check">✓</span> <strong>Daily Exterior Cleaning</strong> (26 visits/month)</li>
          <li class="feature-item"><span class="check">✓</span> Treated soft-water cleaning (Anti-spot &amp; anti-swirl)</li>
          <li class="feature-item"><span class="check">✓</span> 2-Bucket scratch-free microfiber technique</li>
          <li class="feature-item"><span class="check">✓</span> Exterior windshield wipe &amp; tire dressing</li>
          <li class="feature-item"><span class="check">✓</span> Daily WhatsApp inspection photos sent to you</li>
        </ul>
        <button class="btn-primary" onclick="window.openBookingModal('Basic DCC (${catLabel} ₹${dccRates.basic})', 'Daily Car Cleaning')">
          Book Basic (₹${dccRates.basic}/mo)
        </button>
      </div>

      <div class="pricing-card featured">
        <div class="card-badge">Most Popular</div>
        <h3 class="pkg-title">Silver DCC</h3>
        <p class="pkg-desc">Segment: Daily maintenance customers · Daily clean plus 1 deep wash included.</p>
        <div class="pkg-price-wrap">
          <span class="price-currency">₹</span>
          <span class="price-num">${dccRates.silver.toLocaleString('en-IN')}</span>
          <span class="price-unit">/ month</span>
          <span class="price-gst-tag">GST additional (${catLabel})</span>
        </div>
        <ul class="feature-list">
          <li class="feature-item"><span class="check">✓</span> <strong>Daily Exterior Cleaning</strong> (26 visits/month)</li>
          <li class="feature-item"><span class="check">✓</span> <strong>+ 1 Full Doorstep Wash Included</strong> per month</li>
          <li class="feature-item"><span class="check">✓</span> Interior dry vacuuming &amp; mat cleaning included</li>
          <li class="feature-item"><span class="check">✓</span> Gate pads &amp; dashboard light polishing included</li>
          <li class="feature-item"><span class="check">✓</span> Treated soft-water wash · Spot-free finish</li>
          <li class="feature-item"><span class="check">✓</span> WhatsApp inspection photos every visit</li>
        </ul>
        <button class="btn-primary" onclick="window.openBookingModal('Silver DCC (${catLabel} ₹${dccRates.silver})', 'Daily Car Cleaning')">
          Book Silver (₹${dccRates.silver}/mo)
        </button>
      </div>

      <div class="pricing-card">
        <div class="card-badge" style="background-color: var(--md-sys-color-tertiary);">Complete Care</div>
        <h3 class="pkg-title">Gold DCC</h3>
        <p class="pkg-desc">Segment: Daily maintenance customers · Daily clean plus 2 deep washes included.</p>
        <div class="pkg-price-wrap">
          <span class="price-currency">₹</span>
          <span class="price-num">${dccRates.gold.toLocaleString('en-IN')}</span>
          <span class="price-unit">/ month</span>
          <span class="price-gst-tag">GST additional (${catLabel})</span>
        </div>
        <ul class="feature-list">
          <li class="feature-item"><span class="check">✓</span> <strong>Daily Exterior Cleaning</strong> (26 visits/month)</li>
          <li class="feature-item"><span class="check">✓</span> <strong>+ 2 Full Doorstep Washes Included</strong> per month</li>
          <li class="feature-item"><span class="check">✓</span> Fortnightly complete interior dry vacuuming &amp; mats</li>
          <li class="feature-item"><span class="check">✓</span> Dashboard &amp; gate trim conditioning</li>
          <li class="feature-item"><span class="check">✓</span> Dedicated morning schedule (6:30 – 9:00 AM)</li>
          <li class="feature-item"><span class="check">✓</span> Dedicated senior specialist assigned</li>
        </ul>
        <button class="btn-primary" onclick="window.openBookingModal('Gold DCC (${catLabel} ₹${dccRates.gold})', 'Daily Car Cleaning')">
          Book Gold (₹${dccRates.gold}/mo)
        </button>
      </div>
    `;

    if (pricingFootnote) {
      pricingFootnote.textContent = 'DCC packages are monthly subscriptions. The service operates on your defined cleaning schedule and operational policy. GST additional.';
    }
  }

  // Safe no-op if offersContainer is absent
  function renderOffers() {
    const offersContainer = document.getElementById('offersContainer');
    if (!offersContainer) return;
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
      btn.onclick = null;
      btn.onclick = () => {
        const item = btn.parentElement;
        item.classList.toggle('active');
      };
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

  // Handle Video Card Click via data attributes
  window.handleVideoCardClick = function (elem) {
    if (!elem) return;
    const title = elem.getAttribute('data-video-title') || '';
    const src = elem.getAttribute('data-video-src') || '';
    const poster = elem.getAttribute('data-video-poster') || '';
    if (src && window.openVideoModal) {
      window.openVideoModal(title, src, poster);
    }
  };

  // Video Modal
  window.openVideoModal = function (title, videoSrc, posterSrc) {
    if (videoModal) {
      const titleElem = document.getElementById('videoModalTitle');
      if (titleElem) titleElem.textContent = title;
      const frame = document.getElementById('videoFrame');
      const player = document.getElementById('videoPlayer');
      const isDirectVideo = videoSrc && (videoSrc.endsWith('.mp4') || videoSrc.endsWith('.webm') || videoSrc.includes('/videos/') || videoSrc.includes('cloudinary.com'));
      if (isDirectVideo) {
        if (frame) {
          frame.src = '';
          frame.style.display = 'none';
        }
        if (player) {
          player.style.display = 'block';
          player.controls = true;
          player.controlsList = 'nodownload';
          player.setAttribute('controlsList', 'nodownload');
          player.oncontextmenu = () => false;
          if (posterSrc) {
            player.poster = posterSrc;
          }
          player.src = videoSrc;
          player.load();
          player.play().catch(() => {});
        }
      } else {
        if (player) {
          player.pause();
          player.src = '';
          player.style.display = 'none';
        }
        if (frame) {
          frame.style.display = 'block';
          frame.src = videoSrc || '';
        }
      }
      videoModal.classList.add('open');
    }
  };

  window.closeVideoModal = function () {
    const frame = document.getElementById('videoFrame');
    const player = document.getElementById('videoPlayer');
    if (frame) {
      frame.src = '';
      frame.style.display = 'none';
    }
    if (player) {
      player.pause();
      player.src = '';
      player.style.display = 'none';
    }
    videoModal?.classList.remove('open');
  };

  // Delegated click listener for video cards
  document.addEventListener('click', function (e) {
    const card = e.target.closest('.video-card[data-video-src]');
    if (card && window.handleVideoCardClick) {
      window.handleVideoCardClick(card);
    }
  });

  // Legal Modal
  window.openLegalModal = function (type) {
    if (!legalModal) return;
    if (type === 'terms') {
      legalModalTitle.textContent = 'Terms & Conditions — CWP Detailers & Motors';
      legalModalBody.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:14px;font-size:0.875rem;line-height:1.6;color:var(--md-sys-color-on-surface-variant);">
          <p style="font-size:0.75rem;color:var(--md-sys-color-on-surface-variant);margin-bottom:4px;">Effective Date: January 1, 2026 | Varanasi, Uttar Pradesh</p>
          <div>
            <strong style="color:var(--md-sys-color-on-surface);display:block;margin-bottom:4px;">1. Acceptance of Terms</strong>
            <p>By booking any doorstep car cleaning, detailing, or solar panel maintenance service with CWP Detailers & Motors ("CWP", "we", "us"), via website, WhatsApp (+91 7054007733), phone, or in person, you agree to these Terms and Conditions.</p>
          </div>
          <div>
            <strong style="color:var(--md-sys-color-on-surface);display:block;margin-bottom:4px;">2. Doorstep Car Cleaning Subscription (DCC)</strong>
            <p>• DCC services operate on monthly subscription plans (Basic, Silver, Gold) covering 26 service visits per month.<br>
            • Service Window: Delivered at customer's designated residence or parking gate in Varanasi between 6:30 AM and 9:00 AM.<br>
            • Water & Power: CWP rigs carry treated soft water and battery-powered tools. For deep interior extraction or machine polishing, standard domestic power access may be requested.<br>
            • Vehicle Access: Customer must ensure the vehicle is accessible during the morning route slot.</p>
          </div>
          <div>
            <strong style="color:var(--md-sys-color-on-surface);display:block;margin-bottom:4px;">3. Cancellation, Rescheduling & Vacation Pause</strong>
            <p>• Vacation Pause: Subscribers may pause monthly service up to 2 times per billing cycle (max 10 calendar days total) with at least 24 hours advance notice via WhatsApp. Paused days are credited forward to extend your active subscription.<br>
            • One-Time Bookings: Doorstep wash or detailing appointments can be rescheduled or cancelled without penalty up to 6 hours prior to the scheduled slot.</p>
          </div>
          <div>
            <strong style="color:var(--md-sys-color-on-surface);display:block;margin-bottom:4px;">4. Payments & Taxes</strong>
            <p>• DCC plans operate on a recurring 30-day advance billing cycle.<br>
            • All published prices are exclusive of Goods and Services Tax (GST). Applicable 18% GST is added at billing. Official GST invoices are provided.</p>
          </div>
          <div>
            <strong style="color:var(--md-sys-color-on-surface);display:block;margin-bottom:4px;">5. Liability & Vehicle Care</strong>
            <p>• Pre-Existing Scratches: Specialists conduct a rapid visual check. CWP is not liable for prior swirls, chips, or oxidized paint caused by colony cleaners.<br>
            • Valuables: Customers are requested to remove cash, electronics, and personal valuables before interior detailing.<br>
            • Cosmetic Care: We perform cosmetic exterior and interior detailing only, not mechanical or electrical engine repairs.</p>
          </div>
          <div>
            <strong style="color:var(--md-sys-color-on-surface);display:block;margin-bottom:4px;">6. 24-Hour Re-Do Guarantee & Jurisdiction</strong>
            <p>• If any clean does not meet published standards, notify customer support within 24 hours via WhatsApp (7054007733) with photos. A supervisor will inspect and re-clean the vehicle free of charge.<br>
            • All disputes are subject to the exclusive jurisdiction of civil courts located in Varanasi, Uttar Pradesh, India.</p>
          </div>
        </div>
      `;
    } else if (type === 'privacy') {
      legalModalTitle.textContent = 'Privacy Policy — CWP Detailers & Motors';
      legalModalBody.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:14px;font-size:0.875rem;line-height:1.6;color:var(--md-sys-color-on-surface-variant);">
          <p style="font-size:0.75rem;color:var(--md-sys-color-on-surface-variant);margin-bottom:4px;">Effective Date: January 1, 2026 | Varanasi, Uttar Pradesh</p>
          <div>
            <strong style="color:var(--md-sys-color-on-surface);display:block;margin-bottom:4px;">1. Information We Collect</strong>
            <p>• Contact Data: Name, mobile number, WhatsApp contact, billing address.<br>
            • Service Delivery Details: Residence address, society/gate number, vehicle registration number and model, rooftop solar panel capacity.<br>
            • Service Records: Time-stamped before-and-after photographs, technician attendance, customer ratings.</p>
          </div>
          <div>
            <strong style="color:var(--md-sys-color-on-surface);display:block;margin-bottom:4px;">2. How We Use Your Information</strong>
            <p>• Dispatching morning cleaning specialists and coordinating Varanasi route slots.<br>
            • Sending daily WhatsApp service completion updates and before-and-after proof photos.<br>
            • Issuing GST-compliant invoices and handling recurring renewal notices.<br>
            • Continuous route optimization for our mobile service fleet across Varanasi.</p>
          </div>
          <div>
            <strong style="color:var(--md-sys-color-on-surface);display:block;margin-bottom:4px;">3. Zero Third-Party Data Sharing</strong>
            <p>CWP Detailers & Motors does NOT sell, rent, or trade your personal information. Data is shared solely with WhatsApp Business API (Meta) for dispatching visit reports and secure cloud database infrastructure.</p>
          </div>
          <div>
            <strong style="color:var(--md-sys-color-on-surface);display:block;margin-bottom:4px;">4. Routine Photo Retention & Data Deletion</strong>
            <p>• Routine daily WhatsApp inspection photos are retained on secure cloud storage for 90 days, then permanently purged.<br>
            • You may request complete erasure of your profile by emailing cwpdetailers@gmail.com with your registered mobile number.</p>
          </div>
          <div>
            <strong style="color:var(--md-sys-color-on-surface);display:block;margin-bottom:4px;">5. Business Contact & Grievance</strong>
            <p>Data Protection Officer, CWP Detailers & Motors<br>
            FIRST FLOOR, 32/14-4A, Annapurna Nagar Colony, Vidya Vihar Colony, Shivpurwa, Varanasi, Uttar Pradesh 221002<br>
            Phone: +91 7054007733 | Email: cwpdetailers@gmail.com</p>
          </div>
        </div>
      `;
    } else if (type === 'refund') {
      legalModalTitle.textContent = 'Refund & Satisfaction Policy';
      legalModalBody.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:14px;font-size:0.875rem;line-height:1.6;color:var(--md-sys-color-on-surface-variant);">
          <p style="font-size:0.75rem;color:var(--md-sys-color-on-surface-variant);margin-bottom:4px;">Effective Date: January 1, 2026 | Varanasi, Uttar Pradesh</p>
          <div>
            <strong style="color:var(--md-sys-color-on-surface);display:block;margin-bottom:4px;">1. 24-Hour Re-Do Guarantee</strong>
            <p>If you are not satisfied with any morning clean, notify us on WhatsApp (+91 7054007733) within 24 hours of service delivery. A supervisor will inspect and re-clean your car free of charge.</p>
          </div>
          <div>
            <strong style="color:var(--md-sys-color-on-surface);display:block;margin-bottom:4px;">2. Monthly Subscription Pro-Rata Refunds</strong>
            <p>• Cancellation within First 7 Days: If you cancel your DCC subscription within the first 7 days of your initial billing cycle, remaining balance is refunded on a pro-rata basis (plan fee minus completed visits at ₹100/visit + GST).<br>
            • Cancellation after 7 Days: Subscriptions remain active until the end of the 30-day cycle and do not renew.<br>
            • Vacation Pause: If traveling outside Varanasi, pause your plan for up to 10 days per month. Unused days are credited forward to your next billing cycle.</p>
          </div>
          <div>
            <strong style="color:var(--md-sys-color-on-surface);display:block;margin-bottom:4px;">3. One-Time Detailing & Wash Bookings</strong>
            <p>• Advance Notice (> 6 Hours): 100% refund or free slot rescheduling.<br>
            • Late Cancellation (< 6 Hours): Subject to a ₹200 technician mobilization fee; balance refunded.<br>
            • No-Show / Inaccessible Vehicle: If vehicle is unavailable within 20 minutes of arrival, ₹250 mobilization fee is deducted.</p>
          </div>
          <div>
            <strong style="color:var(--md-sys-color-on-surface);display:block;margin-bottom:4px;">4. Processing Method & Timelines</strong>
            <p>Approved refunds are credited to the original payment source (UPI, Debit/Credit Card, Net Banking) within 5 to 7 business days.<br>
            Assistance: WhatsApp +91 7054007733 or email cwpdetailers@gmail.com.</p>
          </div>
        </div>
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
    const msg = encodeURIComponent(`Hi CWP Detailers! I want to book ${service} (${plan}).\nName: ${name}\nMobile: ${cleanPhone}\nVehicle / Panels: ${vehicle || 'N/A'}\nLocality: ${locality || 'Varanasi'}\nPlease confirm my slot!`);
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
    setServiceMode('car');
    initBeforeAfterSlider();
    initFaq();
    loadConfig();
  });

})();
