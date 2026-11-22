/**
 * CWP Detailers & Motors - Canonical Service Catalog & Taxonomy
 * Single Source of Truth for all Service Categories, Packages, Seater Sizing & Solar Units
 */

const SERVICE_CATEGORIES = {
  daily_car_cleaning: {
    id: 'daily_car_cleaning',
    name: 'Daily Car Cleaning',
    nameHi: 'दैनिक कार सफाई',
    icon: 'directions_car',
    iconEmoji: '🚗',
    nature: 'monthly_subscription',
    targetType: 'vehicle',
    description: 'Monthly recurring doorstep vehicle cleaning route (30 days with weekly off & holidays).',
    descriptionHi: 'मासिक नियमित डोरस्टेप कार सफाई (30 दिन साप्ताहिक अवकाश और छुट्टियों सहित)।',
    packages: [
      {
        code: 'DCC_EXT_30D',
        name: 'Exterior Chemical Cleaning (30 Days)',
        nameHi: 'एक्सटीरियर केमिकल सफाई (30 दिन)',
        description: '30 days exterior chemical dry/wet wash including weekly off and holidays.',
        descriptionHi: '30 दिन एक्सटीरियर केमिकल क्लीनिंग (साप्ताहिक अवकाश व छुट्टियों सहित)',
        frequencies: 30,
        includesCarwash: 0
      },
      {
        code: 'DCC_EXT_1WASH',
        name: 'Exterior Chemical Cleaning + 1 Carwash/mo',
        nameHi: 'एक्सटीरियर केमिकल सफाई + 1 कार वॉश/माह',
        description: '30 days exterior cleaning with 1 full pressure foam carwash included per month.',
        descriptionHi: '30 दिन एक्सटीरियर क्लीनिंग + महीने में 1 बार फुल कार वॉश',
        frequencies: 30,
        includesCarwash: 1
      },
      {
        code: 'DCC_EXT_2WASH',
        name: 'Exterior Chemical Cleaning + 2 Carwash/mo',
        nameHi: 'एक्सटीरियर केमिकल सफाई + 2 कार वॉश/माह',
        description: '30 days exterior cleaning with 2 full pressure foam carwashes included per month.',
        descriptionHi: '30 दिन एक्सटीरियर क्लीनिंग + महीने में 2 बार फुल कार वॉश',
        frequencies: 30,
        includesCarwash: 2
      }
    ]
  },

  car_washing: {
    id: 'car_washing',
    name: 'Car Wash',
    nameHi: 'कार वॉश',
    icon: 'local_car_wash',
    iconEmoji: '🧼',
    nature: 'instance_or_subscription',
    targetType: 'vehicle',
    description: 'Deep exterior and underbody foam wash service.',
    descriptionHi: 'डीप एक्सटीरियर और अंडरबॉडी फोम वॉश सर्विस।',
    packages: [
      {
        code: 'WASH_SINGLE',
        name: 'Single Wash (One Time Wash)',
        nameHi: 'सिंगल वॉश (एक बार)',
        description: 'One-time on-demand high-pressure foam wash.',
        descriptionHi: 'एक बार की हाई-प्रेशर फोम वॉश सर्विस',
        validityMonths: 1,
        frequencies: 1
      },
      {
        code: 'WASH_SUB_4',
        name: 'Wash Subscription (4 Washes / 6 Months)',
        nameHi: 'वॉश सब्सक्रिप्शन (4 वॉश / 6 महीने वैधता)',
        description: 'Package of 4 car washes valid for up to 6 months.',
        descriptionHi: '4 कार वॉश का पैकेज, 6 महीने की वैधता के साथ',
        validityMonths: 6,
        frequencies: 4
      }
    ]
  },

  solar_cleaning: {
    id: 'solar_cleaning',
    name: 'Solar Panel Cleaning',
    nameHi: 'सोलर पैनल सफाई',
    icon: 'solar_power',
    iconEmoji: '☀️',
    nature: 'instance_or_subscription',
    targetType: 'solar',
    pricingUnit: 'per_panel',
    description: 'Rooftop solar panel demineralized cleaning calculated on Rs. per panel basis.',
    descriptionHi: 'छत पर लगे सोलर पैनलों की विशेष सफाई (प्रति पैनल दर आधारित)।',
    packages: [
      {
        code: 'SOLAR_SINGLE',
        name: 'One Time Solar Cleaning',
        nameHi: 'एक बार सोलर सफाई',
        description: 'Single comprehensive rooftop solar panel cleaning session.',
        descriptionHi: 'एक बार रूफटॉप सोलर पैनलों की पूरी सफाई',
        validityMonths: 1,
        frequencies: 1
      },
      {
        code: 'SOLAR_SUB_6',
        name: '6 Month Subscription (1 cleaning/mo - 6 frequencies)',
        nameHi: '6 महीने सब्सक्रिप्शन (1 सफाई/माह - 6 बार)',
        description: 'Bi-annual subscription with 1 panel cleaning per month (6 total cleans).',
        descriptionHi: '6 महीने का प्लान (हर महीने 1 बार सफाई, कुल 6 बार)',
        validityMonths: 6,
        frequencies: 6
      },
      {
        code: 'SOLAR_SUB_12',
        name: '12 Month Subscription (1 cleaning/mo - 12 frequencies)',
        nameHi: '12 महीने सब्सक्रिप्शन (1 सफाई/माह - 12 बार)',
        description: 'Annual subscription with 1 panel cleaning per month (12 total cleans).',
        descriptionHi: '1 साल का प्लान (हर महीने 1 बार सफाई, कुल 12 बार)',
        validityMonths: 12,
        frequencies: 12
      }
    ]
  },

  interior_detailing: {
    id: 'interior_detailing',
    name: 'Interior Detailing',
    nameHi: 'इंटीरियर डिटेलिंग',
    icon: 'auto_awesome',
    iconEmoji: '✨',
    nature: 'detailing_job',
    targetType: 'vehicle',
    description: 'Deep passenger cabin, upholstery shampooing, dashboard rejuvenation, and roof fabric cleaning.',
    descriptionHi: 'कार केबिन, सीट शैम्पू, डैशबोर्ड पॉलिश और रूफ फैब्रिक की डीप क्लीनिंग।',
    packages: [
      {
        code: 'INT_DEEP_CLEAN',
        name: 'Interior Deep Cleaning',
        nameHi: 'इंटीरियर डीप क्लीनिंग',
        description: 'Full interior vacuum, seat upholstery dry clean, steam extraction, and plastic conditioning.',
        descriptionHi: 'सीटों की शैम्पू सफाई, वैक्यूम, स्टीम क्लीन और डैशबोर्ड कंडीशनिंग'
      },
      {
        code: 'INT_ROOF_CLEAN',
        name: 'Roof Cleaning',
        nameHi: 'रूफ क्लीनिंग (छत की सफाई)',
        description: 'Specialized fabric stain removal and dry extraction for car headliner/roof fabric.',
        descriptionHi: 'कार की आंतरिक छत (हेडलाइनर) के दाग हटाना और विशेष फैब्रिक सफाई'
      }
    ]
  },

  exterior_detailing: {
    id: 'exterior_detailing',
    name: 'Exterior Detailing',
    nameHi: 'एक्सटीरियर डिटेलिंग',
    icon: 'shield',
    iconEmoji: '🛡️',
    nature: 'detailing_job',
    targetType: 'vehicle',
    description: 'High-gloss paint protection, ceramic/graphene coating, rubbing compound, waxing, and hydrophobic glass treatment.',
    descriptionHi: 'पेंट प्रोटेक्शन, सिरेमिक/ग्राफीन कोटिंग, कार वैक्सिंग और ग्लास ट्रीटमेंट।',
    packages: [
      {
        code: 'EXT_CERAMIC',
        name: 'Ceramic Coating',
        nameHi: 'सिरेमिक कोटिंग',
        description: '9H nano-ceramic surface coating for hydrophobic shine and swirl resistance.',
        descriptionHi: '9H नैनो-सिरेमिक पेंट प्रोटेक्शन और लंबे समय की चमक'
      },
      {
        code: 'EXT_GRAPHENE',
        name: 'Graphene Coating',
        nameHi: 'ग्राफीन कोटिंग',
        description: 'Advanced 10H graphene matrix coating offering high heat dissipation and anti-water spotting.',
        descriptionHi: 'एडवांस्ड 10H ग्राफीन कोटिंग (अधिक सुरक्षा और एंटी-वाटर स्पॉटिंग)'
      },
      {
        code: 'EXT_WAXING',
        name: 'Car Waxing',
        nameHi: 'कार वैक्सिंग (पॉलिश)',
        description: 'Carnauba gloss wax application for immediate showroom mirror finish and UV shield.',
        descriptionHi: 'प्रीमियम कारनौबा वैक्स पॉलिश और यूवी धूप से सुरक्षा'
      },
      {
        code: 'EXT_GLASS',
        name: 'Glass Treatment',
        nameHi: 'ग्लास ट्रीटमेंट',
        description: 'Hydrophobic anti-rain windshield and window glass coating for clear rain driving.',
        descriptionHi: 'विंडशील्ड और खिड़कियों पर हाइड्रोफोबिक रेन रिपेलेंट कोटिंग'
      }
    ]
  }
};

/**
 * Vehicle Seater Categorization
 */
const SEATER_TYPES = {
  '5_seater': {
    code: '5_seater',
    label: '5 Seater',
    labelHi: '5 सीटर (हॅचबॅक / सेडान / कॉम्पैक्ट SUV)',
    category: '5 Seater (Hatchback / Sedan / Compact SUV)'
  },
  '5_plus_seater': {
    code: '5_plus_seater',
    label: '5+ Seater',
    labelHi: '5+ सीटर (7 सीटर / बड़ी SUV / MPV)',
    category: '5+ Seater (7 Seater / Large SUV / MPV / Van)'
  }
};

/**
 * Solar Rooftop Panel Unit Specifications
 */
const SOLAR_UNIT_CONFIG = {
  baseUnit: 'panel',
  pricingModel: 'per_panel',
  currency: 'INR',
  defaultPanelCount: 10
};

// Helper Lookup Methods
function getAllCategories() {
  return Object.values(SERVICE_CATEGORIES);
}

function getCategory(categoryId) {
  if (!categoryId) return null;
  const key = categoryId.toLowerCase().trim().replace(/[\s-]+/g, '_');
  return SERVICE_CATEGORIES[key] || null;
}

function getPackagesForCategory(categoryId) {
  const cat = getCategory(categoryId);
  return cat ? cat.packages : [];
}

function getPackage(categoryId, packageCode) {
  const packages = getPackagesForCategory(categoryId);
  return packages.find(p => p.code === packageCode || p.name.toLowerCase() === (packageCode || '').toLowerCase()) || null;
}

function normalizeSeaterType(val) {
  if (!val) return '5_seater';
  const s = String(val).toLowerCase().trim();
  if (s.includes('5+') || s.includes('7') || s.includes('plus') || s.includes('suv') || s === '5_plus_seater') {
    return '5_plus_seater';
  }
  return '5_seater';
}

function isValidSeaterType(code) {
  return Boolean(code && SEATER_TYPES[code]);
}

function formatSeaterDisplay(code) {
  const norm = normalizeSeaterType(code);
  return SEATER_TYPES[norm] ? SEATER_TYPES[norm].label : '5 Seater';
}

function resolveCanonicalCategory(input) {
  if (!input) return 'daily_car_cleaning';
  const raw = String(input).trim().toLowerCase();
  if (raw === 'daily_car_cleaning' || raw === 'daily car cleaning' || raw === 'daily clean' || raw === 'dcc' || raw.includes('daily')) {
    return 'daily_car_cleaning';
  }
  if (raw === 'car_washing' || raw === 'car wash' || raw === 'car washing' || raw.includes('wash')) {
    return 'car_washing';
  }
  if (raw === 'solar_cleaning' || raw === 'solar cleaning' || raw === 'solar panel cleaning' || raw.includes('solar')) {
    return 'solar_cleaning';
  }
  if (raw === 'interior_detailing' || raw === 'interior detailing' || raw.includes('interior')) {
    return 'interior_detailing';
  }
  if (raw === 'exterior_detailing' || raw === 'exterior detailing' || raw.includes('exterior')) {
    return 'exterior_detailing';
  }
  const normalizedKey = raw.replace(/[\s-]+/g, '_');
  if (SERVICE_CATEGORIES[normalizedKey]) {
    return normalizedKey;
  }
  return 'daily_car_cleaning';
}

module.exports = {
  SERVICE_CATEGORIES,
  SEATER_TYPES,
  SOLAR_UNIT_CONFIG,
  getAllCategories,
  getCategory,
  getPackagesForCategory,
  getPackage,
  normalizeSeaterType,
  isValidSeaterType,
  formatSeaterDisplay,
  resolveCanonicalCategory
};
