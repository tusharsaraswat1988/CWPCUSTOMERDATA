/**
 * =========================================================================
 * CWP DATA APP - BILINGUAL SEARCH ENGINE (English <-> Hindi)
 * Enables smart phonetic cross-language search across customer records:
 * - Search Hindi names/addresses using English (Latin/Hinglish) phonetics (e.g. "ritika" -> "रितिका जैन")
 * - Search English names/addresses using Devanagari Hindi (e.g. "रमेश" -> "Ramesh Sharma")
 * - Handles Indian phonetic spelling variations:
 *     ee <-> i (ritika / reetika)
 *     oo <-> u (apurv / apoorv, ayub / ayoob)
 *     w <-> v (vivek / wiwek)
 *     sh <-> s (shreyansh / sreyansh)
 *     aa <-> a
 *     double consonants (mittal / mital, khanna / khana)
 *     Hindi schwa syncope (sigra <-> sigara)
 * - Complete phone number matching (raw, formatted, with/without country code)
 * =========================================================================
 */

const VOWEL_MAP = {
  'अ': 'a', 'आ': 'a', 'इ': 'i', 'ई': 'i', 'उ': 'u', 'ऊ': 'u',
  'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au',
  'अं': 'an', 'अः': 'ah', 'ऑ': 'o', 'ऍ': 'e'
};

const MATRA_MAP = {
  'ा': 'a', 'ि': 'i', 'ी': 'i', 'ु': 'u', 'ू': 'u',
  'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au',
  'ं': 'n', 'ँ': 'n', 'ः': 'h', '्': '', 'ॅ': 'e', 'ॉ': 'o'
};

const CONSONANT_MAP = {
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'ng',
  'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'ny',
  'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
  'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
  'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
  'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v',
  'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h',
  'क्ष': 'ksh', 'त्र': 'tra', 'ज्ञ': 'gya',
  'ड़': 'd', 'ढ़': 'dh', 'फ़': 'f', 'ज़': 'z', 'क़': 'q', 'ख़': 'kh', 'ग़': 'gh'
};

/**
 * Phonetically romanizes Devanagari Hindi text to standard Latin
 */
function devanagariToLatin(str) {
  if (!str) return '';
  const s = String(str);
  let out = '';
  const len = s.length;

  for (let i = 0; i < len; i++) {
    const ch = s[i];
    const next = i + 1 < len ? s[i + 1] : '';

    if (CONSONANT_MAP[ch]) {
      const c = CONSONANT_MAP[ch];
      if (next === '्') {
        out += c;
        i++; // skip halant
      } else if (MATRA_MAP[next]) {
        out += c + MATRA_MAP[next];
        i++; // skip matra
      } else {
        // Standard Hindi pronunciation:
        // Final consonant of a word drops implicit 'a' (e.g. जैन -> jain, राम -> ram)
        const isWordEnd = (i + 1 === len) || (/[\s,.-]/.test(next));
        if (isWordEnd) {
          out += c;
        } else {
          out += c + 'a';
        }
      }
    } else if (VOWEL_MAP[ch]) {
      out += VOWEL_MAP[ch];
    } else if (MATRA_MAP[ch]) {
      out += MATRA_MAP[ch];
    } else {
      out += ch;
    }
  }
  return out.toLowerCase();
}

/**
 * Normalizes common Indian English phonetic variations
 */
function normalizePhoneticKey(str) {
  if (!str) return '';
  return String(str).toLowerCase()
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/w/g, 'v')
    .replace(/sh/g, 's')
    .replace(/aa/g, 'a')
    .replace(/dh/g, 'd')
    .replace(/th/g, 't')
    .replace(/kh/g, 'k')
    .replace(/gh/g, 'g')
    .replace(/ph/g, 'f')
    .replace(/bh/g, 'b')
    .replace(/jh/g, 'j')
    .replace(/ch/g, 'c')
    .replace(/(\w)\1+/g, '$1') // collapse repeated characters: mittal -> mital
    .trim();
}

/**
 * Normalizes Indian 10-digit mobile phone numbers
 */
function normalizePhone(value) {
  if (value == null) return '';
  const digits = String(value).replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

function formatPhoneDisplay(digits) {
  if (!digits || digits.length < 10) return '';
  const d = digits.slice(-10);
  return d.slice(0, 5) + ' ' + d.slice(5, 10);
}

/**
 * Checks whether a single record matches a multi-token query across all bilingual fields
 */
function recordMatchesQuery(record, query) {
  if (!query) return true;
  const q = String(query).trim().toLowerCase();
  if (!q) return true;

  const rawPhoneQuery = q.replace(/\D/g, '');
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;

  const corpusParts = [];

  function addField(val) {
    if (val != null) {
      const s = String(val).trim();
      if (s) {
        corpusParts.push(s.toLowerCase());
        if (/[\u0900-\u097F]/.test(s)) {
          const roman = devanagariToLatin(s);
          if (roman) {
            corpusParts.push(roman);
            // Syncope / schwa deletion: drop short 'a' between consonants (e.g. sigara -> sigra)
            const syncope = roman.replace(/([bcdfghjklmnpqrstvwxyz])a([bcdfghjklmnpqrstvwxyz])/g, '$1$2');
            if (syncope !== roman) corpusParts.push(syncope);
            const norm = normalizePhoneticKey(roman);
            if (norm && norm !== roman) corpusParts.push(norm);
            const normSync = normalizePhoneticKey(syncope);
            if (normSync && normSync !== syncope && normSync !== norm) corpusParts.push(normSync);
          }
        } else {
          const normLat = normalizePhoneticKey(s);
          if (normLat && normLat !== s.toLowerCase()) corpusParts.push(normLat);
        }
      }
    }
  }

  // Name fields
  addField(record.customerName || record.name);
  addField(record.nameHi || record.name_hi);

  // Phone numbers (raw digits, normalized, formatted with & without +91)
  const phone = record.customerNumber || record.phone;
  if (phone != null) {
    addField(phone);
    const normPhone = normalizePhone(phone);
    if (normPhone) {
      addField(normPhone);
      addField('+91' + normPhone);
      addField('+91 ' + normPhone);
      const fmt = formatPhoneDisplay(normPhone);
      if (fmt) {
        addField(fmt);
        addField('+91 ' + fmt);
      }
    }
  }

  // Vehicle / site information
  addField(record.vehicle || record.vehicleNumbers || record.vehicleOrSite);

  // Address fields
  addField(record.address);
  addField(record.addressHi || record.address_hi);
  addField(record.secondaryAddress);
  addField(record.secondaryAddressHi || record.secondary_address_hi);

  // Metadata
  addField(record.staffName);
  addField(record.notes || record.staffNotes || record.leadNotes);
  addField(record.packageType || record.serviceType || record.packageName);
  addField(record.customerCode);

  const corpus = corpusParts.join(' ');

  // Direct phone match shortcut if searching by numbers
  const recPhoneDigits = normalizePhone(phone);
  if (rawPhoneQuery.length >= 4 && recPhoneDigits && recPhoneDigits.indexOf(rawPhoneQuery) !== -1) {
    return true;
  }

  return tokens.every(tok => {
    // 1. Direct substring match
    if (corpus.indexOf(tok) !== -1) return true;

    // 2. If token is numeric and matches phone
    const tokDigits = tok.replace(/\D/g, '');
    if (tokDigits.length >= 4 && recPhoneDigits && recPhoneDigits.indexOf(tokDigits) !== -1) {
      return true;
    }

    // 3. If token is in Devanagari Hindi, romanize query to match English data
    if (/[\u0900-\u097F]/.test(tok)) {
      const tokRom = devanagariToLatin(tok);
      if (tokRom && corpus.indexOf(tokRom) !== -1) return true;
      const tokRomNorm = normalizePhoneticKey(tokRom);
      if (tokRomNorm && corpus.indexOf(tokRomNorm) !== -1) return true;
    }

    // 4. Normalized phonetic key match
    const tokNorm = normalizePhoneticKey(tok);
    if (tokNorm && corpus.indexOf(tokNorm) !== -1) return true;

    return false;
  });
}

function filterRecordsBilingual(records, query) {
  if (!Array.isArray(records)) return [];
  if (!query || !String(query).trim()) return records;
  return records.filter(r => recordMatchesQuery(r, query));
}

module.exports = {
  devanagariToLatin,
  normalizePhoneticKey,
  recordMatchesQuery,
  filterRecordsBilingual
};
