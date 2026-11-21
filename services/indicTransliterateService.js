/**
 * =========================================================================
 * CWP DATA APP - GOOGLE INDIC TRANSLITERATION SERVICE
 * Smart English -> Hindi Transliteration for Customer Names & Addresses
 * =========================================================================
 */

const https = require('https');

// In-memory cache for speed and zero duplicate network hits
const cache = new Map();
const MAX_CACHE_SIZE = 2000;

function getCache(key) {
  return cache.get(key);
}

function setCache(key, val) {
  if (cache.size >= MAX_CACHE_SIZE) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
  cache.set(key, val);
}

// Convert Devanagari numerals (०-९) back to standard Arabic numerals (0-9)
// Door numbers, flat numbers, and lift buttons in India use 0-9.
const DIGIT_MAP = {
  '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
  '५': '5', '६': '6', '७': '7', '८': '8', '९': '9'
};

function normalizeDigits(str) {
  if (!str) return '';
  return str.replace(/[०-९]/g, d => DIGIT_MAP[d] || d);
}

// English single letters to Hindi phonetics for Blocks/Towers (e.g. Block C -> ब्लॉक सी)
const LETTER_MAP = {
  'A': 'ए', 'B': 'बी', 'C': 'सी', 'D': 'डी', 'E': 'ई', 'F': 'एफ', 'G': 'जी',
  'H': 'एच', 'I': 'आई', 'J': 'जे', 'K': 'के', 'L': 'एल', 'M': 'एम', 'N': 'एन',
  'O': 'ओ', 'P': 'पी', 'Q': 'क्यू', 'R': 'आर', 'S': 'एस', 'T': 'टी', 'U': 'यू',
  'V': 'वी', 'W': 'डब्ल्यू', 'X': 'एक्स', 'Y': 'वाई', 'Z': 'ज़ेड'
};

/**
 * Fetch phonetic transliteration from Google Indic (Input Tools) API
 */
function fetchGoogleIndic(rawText, timeoutMs = 3500) {
  const text = (rawText || '').trim();
  if (!text) return Promise.resolve('');

  // Return cached result if available
  const cached = getCache(text.toLowerCase());
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve) => {
    const url = 'https://inputtools.google.com/request?text=' + encodeURIComponent(text) + '&itc=hi-t-i0-und&num=1';
    
    const req = https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json[0] === 'SUCCESS' && Array.isArray(json[1])) {
            const out = json[1].map(part => {
              if (part && Array.isArray(part[1]) && part[1][0]) {
                return part[1][0];
              }
              return part[0] || '';
            }).join(' ').replace(/\s+/g, ' ').trim();

            if (out) {
              setCache(text.toLowerCase(), out);
              return resolve(out);
            }
          }
          resolve(text);
        } catch (e) {
          resolve(text);
        }
      });
    });

    req.on('error', () => resolve(text));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(text);
    });
  });
}

/**
 * Transliterate Customer Name (Phonetic English -> Hindi)
 * e.g. "Ramesh Sharma" -> "रमेश शर्मा"
 */
async function transliterateName(name) {
  if (!name || !name.trim()) return '';
  const cleaned = name.trim();
  
  // If already Hindi characters, return as is
  if (/^[\u0900-\u097F\s\.\-]+$/.test(cleaned)) {
    return cleaned;
  }

  const res = await fetchGoogleIndic(cleaned);
  return normalizeDigits(res);
}

/**
 * Transliterate Address (Hybrid: Phonetic Proper Nouns + Landmark Context + Arabic Digits)
 * e.g. "Flat 302, Tower B, Supertech Eco Village, Near Water Tank"
 * -> "फ्लैट 302, टावर बी, सुपरटेक इको विलेज, पानी की टंकी के पास"
 */
async function transliterateAddress(address) {
  if (!address || !address.trim()) return '';
  const cleaned = address.trim();

  // If already purely Hindi, return as is
  if (/^[\u0900-\u097F\s0-9\.,\-\/#\(\)]+$/.test(cleaned) && !/[a-zA-Z]/.test(cleaned)) {
    return cleaned;
  }

  // Pre-process common address landmark structures
  const clauses = cleaned.split(/[,;\n]+/);
  const transClauses = [];

  for (let clause of clauses) {
    let c = clause.trim();
    if (!c) continue;

    // Replace single block / tower letters e.g. "Block C" -> "Block सी", "Tower B" -> "Tower बी"
    c = c.replace(/\b([A-Z])\b/g, (match, letter) => LETTER_MAP[letter] || match);

    // Call Google Indic for the clause
    let hiClause = await fetchGoogleIndic(c);

    // Contextual replacements for common landmark terms
    hiClause = hiClause
      .replace(/\bनियर\b/gi, 'के पास')
      .replace(/\bअपोजिट\b|\bओप्प\b/gi, 'के सामने')
      .replace(/\bबिहाइंड\b/gi, 'के पीछे')
      .replace(/\b1स्ट फ्लोर\b|\b1 स्ट फ्लोर\b/gi, 'पहली मंजिल')
      .replace(/\b2न्ड फ्लोर\b|\b2 न्ड फ्लोर\b|\b2nd फ्लोर\b/gi, 'दूसरी मंजिल')
      .replace(/\b3र्ड फ्लोर\b|\b3 र्ड फ्लोर\b|\b3rd फ्लोर\b/gi, 'तीसरी मंजिल')
      .replace(/\bग्राउंड फ्लोर\b/gi, 'ग्राउंड फ्लोर')
      .replace(/\bवाटर टैंक\b/gi, 'पानी की टंकी')
      .replace(/\bमेन गेट\b/gi, 'मेन गेट')
      .replace(/\bमेट्रो स्टेशन\b/gi, 'मेट्रो स्टेशन');

    transClauses.push(normalizeDigits(hiClause));
  }

  return transClauses.join(', ');
}

/**
 * Batch transliteration for customer record
 */
async function transliterateCustomer({ name = '', address = '', secondaryAddress = '' } = {}) {
  const [nameHi, addressHi, secondaryAddressHi] = await Promise.all([
    transliterateName(name),
    transliterateAddress(address),
    transliterateAddress(secondaryAddress)
  ]);

  return {
    nameHi: nameHi || name,
    addressHi: addressHi || address,
    secondaryAddressHi: secondaryAddressHi || secondaryAddress
  };
}

module.exports = {
  fetchGoogleIndic,
  transliterateName,
  transliterateAddress,
  transliterateCustomer,
  normalizeDigits
};
