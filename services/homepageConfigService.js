/**
 * CWP Detailers & Motors - Homepage Dynamic Configuration Service
 * Provides admin-managed dynamic pricing, promotional offers, coupons, and contact info
 * Features in-memory caching for zero latency with PostgreSQL persistence and local fallback
 */

const fs = require('fs');
const path = require('path');
const db = require('../db/index');

const CONFIG_FILE_PATH = path.resolve(__dirname, '../data/homepage_config.json');

const DEFAULT_CONFIG = {
  contact: {
    phone: '7054007733',
    phoneDisplay: '+91 7054007733',
    email: 'cwpdetailers@gmail.com',
    address: 'FIRST FLOOR, 32/14-4A, Annapurna Nagar Colony, Vidya Vihar Colony, Shivpurwa, Varanasi, Uttar Pradesh 221002',
    landmark: 'Near Mahmoorganj / Kashi Vidyapeeth Road, Varanasi',
    googleMapsUrl: 'https://share.google/BptJhx2p3xlUiIC4d',
    googleReviewCarUrl: 'https://share.google/BptJhx2p3xlUiIC4d',
    googleReviewSolarUrl: 'https://share.google/1sg9sRwZpnyFeYQty',
    whatsappUrl: 'https://wa.me/917054007733',
    instagramUrl: 'https://instagram.com/cwpdetailers',
    facebookUrl: 'https://facebook.com/cwpdetailers'
  },
  gst: {
    percent: 18,
    label: 'GST additional',
    notice: 'GST additional'
  },
  rates: {
    carCare: {
      dcc: {
        fiveSeater: {
          basic: 1100,
          silver: 1500,
          gold: 2000
        },
        fivePlusSeater: {
          basic: 1200,
          silver: 1600,
          gold: 2200
        }
      },
      wash: {
        fiveSeater: {
          oneTime: 600,
          subscription4: 1800
        },
        fivePlusSeater: {
          oneTime: 700,
          subscription4: 2100
        }
      },
      detailing: {
        ceramicCoatingStarts: 11999,
        interiorDetailingStarts: 1499
      }
    },
    solarCare: {
      oneTime: {
        tier1_30: 60,
        tier30_100: 50,
        tier100Plus: 'Site Visit',
        minBilling: 800
      },
      amc6Month: {
        tier1_30: 50,
        tier30_100: 45,
        tier100Plus: 'Site Visit'
      },
      amc12Month: {
        tier1_30: 45,
        tier30_100: 40,
        tier100Plus: 'Site Visit'
      }
    },
    hatchback: {
      dailyClean: 1100,
      interiorExteriorDetail: 1499,
      ceramicCoating: 11999,
      examples: 'Swift, i20, Baleno, Tiago, Altroz, Grand i10'
    },
    sedan: {
      dailyClean: 1100,
      interiorExteriorDetail: 1499,
      ceramicCoating: 11999,
      examples: 'City, Verna, Ciaz, Slavia, Virtus, Dzire, Amaze'
    },
    compactSuv: {
      dailyClean: 1100,
      interiorExteriorDetail: 1499,
      ceramicCoating: 11999,
      examples: 'Creta, Seltos, Brezza, Nexon, Venue, Grand Vitara'
    },
    fullSuvLuxury: {
      dailyClean: 1200,
      interiorExteriorDetail: 1499,
      ceramicCoating: 11999,
      examples: 'Fortuner, Safari, XUV700, Scorpio-N, BMW, Mercedes'
    }
  },
  offers: [
    {
      id: 'offer_1',
      code: 'CWPFIRST300',
      title: 'Pehla Mahina Welcome Offer',
      titleHi: 'पहला महीना वेलकम ऑफर',
      discountText: 'Flat ₹300 OFF',
      description: 'Flat ₹300 discount on your first month Daily Car Clean subscription.',
      badge: 'New Customer Special',
      active: true
    },
    {
      id: 'offer_2',
      code: 'MULTICAR15',
      title: 'Society & Multi-Car Discount',
      titleHi: 'सोसायटी व मल्टी-कार छूट',
      discountText: 'Flat 15% OFF',
      description: 'Register 2 or more cars at the same gate or apartment society and get 15% OFF.',
      badge: 'Society Favorite',
      active: true
    },
    {
      id: 'offer_3',
      code: 'SOLARDETAIL50',
      title: 'Solar + Detailing Duo Saver',
      titleHi: 'सोलर + डिटेलिंग डुओ सेवर',
      discountText: '50% OFF Solar Clean',
      description: 'Book any Interior + Exterior Deep Detailing session and get 50% OFF rooftop solar panel cleaning.',
      badge: 'Best Value Combo',
      active: true
    }
  ],
  coupons: [
    { code: 'CWPFIRST300', discount: 300, type: 'flat', active: true },
    { code: 'MULTICAR15', discount: 15, type: 'percentage', active: true },
    { code: 'SOLARDETAIL50', discount: 50, type: 'solar_combo', active: true }
  ],
  stats: {
    googleRating: '4.9',
    ratingMax: '5.0',
    totalReviews: '100+',
    activeMembers: '450+',
    waterTds: 'Treated Soft Water (Spot-Free)',
    waterQuality: 'Treated Soft Water (Spot-Free)',
    onTimeRate: '98.4%'
  }
};

let cachedConfig = null;
let lastLoadedTime = 0;
const CACHE_TTL_MS = 60000; // 1 minute in-memory cache

function loadLocalFileConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE_PATH)) {
      const data = fs.readFileSync(CONFIG_FILE_PATH, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.warn('[HomepageConfig] Local file read warning:', err.message);
  }
  return null;
}

function saveLocalFileConfig(cfg) {
  try {
    const dir = path.dirname(CONFIG_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (err) {
    console.warn('[HomepageConfig] Local file save warning:', err.message);
  }
}

async function getHomepageConfig() {
  const now = Date.now();
  if (cachedConfig && (now - lastLoadedTime < CACHE_TTL_MS)) {
    return cachedConfig;
  }

  // 1. Try fetching from Neon database
  if (db.isConfigured()) {
    try {
      const res = await db.query('SELECT * FROM public.homepage_settings WHERE id = $1 LIMIT 1', ['primary_config']);
      if (res.rows[0]) {
        const row = res.rows[0];
        cachedConfig = {
          contact: {
            ...DEFAULT_CONFIG.contact,
            phone: row.contact_phone || DEFAULT_CONFIG.contact.phone,
            phoneDisplay: `+91 ${row.contact_phone || DEFAULT_CONFIG.contact.phone}`,
            email: row.contact_email || DEFAULT_CONFIG.contact.email,
            address: row.office_address || DEFAULT_CONFIG.contact.address,
            googleMapsUrl: row.google_maps_url || DEFAULT_CONFIG.contact.googleMapsUrl,
            whatsappUrl: `https://wa.me/91${row.contact_phone || DEFAULT_CONFIG.contact.phone}`
          },
          gst: {
            percent: Number(row.gst_percent) || 18,
            label: '(GST Extra)',
            notice: `All rates are exclusive of ${Number(row.gst_percent) || 18}% GST (GST Extra)`
          },
          rates: (row.rates_json && Object.keys(row.rates_json).length > 0) ? row.rates_json : DEFAULT_CONFIG.rates,
          offers: (Array.isArray(row.offers_json) && row.offers_json.length > 0) ? row.offers_json : DEFAULT_CONFIG.offers,
          coupons: (Array.isArray(row.coupons_json) && row.coupons_json.length > 0) ? row.coupons_json : DEFAULT_CONFIG.coupons,
          stats: DEFAULT_CONFIG.stats
        };
        lastLoadedTime = now;
        return cachedConfig;
      }
    } catch (err) {
      // Table might not exist yet or connection error; fall through to local
    }
  }

  // 2. Try loading local JSON file
  const localCfg = loadLocalFileConfig();
  if (localCfg) {
    cachedConfig = { ...DEFAULT_CONFIG, ...localCfg };
    lastLoadedTime = now;
    return cachedConfig;
  }

  // 3. Fallback to constant defaults
  cachedConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  lastLoadedTime = now;
  saveLocalFileConfig(cachedConfig);
  return cachedConfig;
}

async function updateHomepageConfig(updates) {
  const current = await getHomepageConfig();
  const merged = {
    ...current,
    ...updates,
    contact: { ...current.contact, ...(updates.contact || {}) },
    gst: { ...current.gst, ...(updates.gst || {}) },
    rates: { ...current.rates, ...(updates.rates || {}) },
    offers: Array.isArray(updates.offers) ? updates.offers : current.offers,
    coupons: Array.isArray(updates.coupons) ? updates.coupons : current.coupons
  };

  // 1. Save to Database if configured
  if (db.isConfigured()) {
    try {
      const query = `
        INSERT INTO public.homepage_settings (
          id, rates_json, offers_json, coupons_json,
          contact_phone, contact_email, office_address, google_maps_url,
          gst_percent, updated_at
        ) VALUES (
          'primary_config', $1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP
        )
        ON CONFLICT (id) DO UPDATE SET
          rates_json = EXCLUDED.rates_json,
          offers_json = EXCLUDED.offers_json,
          coupons_json = EXCLUDED.coupons_json,
          contact_phone = EXCLUDED.contact_phone,
          contact_email = EXCLUDED.contact_email,
          office_address = EXCLUDED.office_address,
          google_maps_url = EXCLUDED.google_maps_url,
          gst_percent = EXCLUDED.gst_percent,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `;
      await db.query(query, [
        JSON.stringify(merged.rates),
        JSON.stringify(merged.offers),
        JSON.stringify(merged.coupons),
        merged.contact.phone,
        merged.contact.email,
        merged.contact.address,
        merged.contact.googleMapsUrl,
        merged.gst.percent
      ]);
    } catch (err) {
      console.warn('[HomepageConfig] DB save warning:', err.message);
    }
  }

  // 2. Save to local fallback file
  saveLocalFileConfig(merged);

  // 3. Update memory cache
  cachedConfig = merged;
  lastLoadedTime = Date.now();
  return cachedConfig;
}

module.exports = {
  DEFAULT_CONFIG,
  getHomepageConfig,
  updateHomepageConfig
};
