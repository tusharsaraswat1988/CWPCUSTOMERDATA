/**
 * CWP Detailers & Motors - Advanced SEO & Schema.org JSON-LD Generator
 * Server-side injection for 100/100 Lighthouse SEO crawlability
 */

const DOMAIN = process.env.RAILWAY_PUBLIC_DOMAIN || 'cwpdata.up.railway.app';
const BASE_URL = `https://${DOMAIN}`;

function getHomepageSeoHead(config) {
  const phone = config.contact.phone || '7054007733';
  const email = config.contact.email || 'cwpdetailers@gmail.com';
  const address = config.contact.address || 'FIRST FLOOR, 32/14-4A, Annapurna Nagar Colony, Vidya Vihar Colony, Shivpurwa, Varanasi, Uttar Pradesh 221002';
  const mapsUrl = config.contact.googleMapsUrl || 'https://share.google/1sg9sRwZpnyFeYQty';

  const title = "CWP Detailers & Motors — Doorstep Car Wash, Detailing & Solar Panel Cleaning in Varanasi";
  const description = "Ab gaadiyaan hongi roj saaf. Varanasi's #1 doorstep car cleaning, ceramic coating, PPF, foam wash & rooftop solar panel cleaning. 100% Zero-TDS RO water & scratch-free care. Call 7054007733.";
  const keywords = [
    "doorstep car wash near me",
    "carwash in varanasi",
    "ceramic coating",
    "ppf in varanasi",
    "daily car cleaning near me",
    "daily car cleaning in varanasi",
    "foam wash in varanasi",
    "solar panel cleaning in varanasi",
    "solar panel cleaning near me",
    "commercial solar panel cleaning",
    "solar mainetenance in varanasi",
    "solar installation in varanasi",
    "car detailing in varanasi",
    "car service near me",
    "car service in varanasi",
    "car washer near me",
    "cwp detailers",
    "cwp varanasi",
    "shivpurwa car wash"
  ].join(", ");

  const schemaOrgLocalBusiness = {
    "@context": "https://schema.org",
    "@type": ["AutoDetailing", "LocalBusiness"],
    "@id": `${BASE_URL}/#business`,
    "name": "CWP Detailers & Motors",
    "alternateName": ["Car Wash Parlour CWP", "CWP Detailers Varanasi"],
    "description": description,
    "url": BASE_URL,
    "telephone": `+91${phone}`,
    "email": email,
    "image": `${BASE_URL}/cwp_logo.jpg`,
    "logo": `${BASE_URL}/cwp_logo.jpg`,
    "priceRange": "₹₹",
    "hasMap": mapsUrl,
    "address": {
      "@type": "PostalAddress",
      "streetAddress": "FIRST FLOOR, 32/14-4A, Annapurna Nagar Colony, Vidya Vihar Colony, Shivpurwa",
      "addressLocality": "Varanasi",
      "addressRegion": "Uttar Pradesh",
      "postalCode": "221002",
      "addressCountry": "IN"
    },
    "geo": {
      "@type": "GeoCoordinates",
      "latitude": 25.3176,
      "longitude": 82.9739
    },
    "openingHoursSpecification": [
      {
        "@type": "OpeningHoursSpecification",
        "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        "opens": "06:00",
        "closes": "22:00"
      }
    ],
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.9",
      "bestRating": "5.0",
      "ratingCount": "128",
      "reviewCount": "104"
    },
    "areaServed": [
      { "@type": "City", "name": "Varanasi" },
      { "@type": "AdministrativeArea", "name": "Sigra, Varanasi" },
      { "@type": "AdministrativeArea", "name": "Mahmoorganj, Varanasi" },
      { "@type": "AdministrativeArea", "name": "Cantt, Varanasi" },
      { "@type": "AdministrativeArea", "name": "Bhelupur, Varanasi" },
      { "@type": "AdministrativeArea", "name": "Lanka, Varanasi" },
      { "@type": "AdministrativeArea", "name": "Shivpurwa, Varanasi" }
    ],
    "sameAs": [
      "https://instagram.com/cwpdetailers",
      "https://facebook.com/cwpdetailers",
      mapsUrl
    ]
  };

  const schemaOrgFaq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "Varanasi mein doorstep car wash kaise book karein?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Aap CWP Detailers ki website se direct online Quick-Book form bhar sakte hain ya WhatsApp par 7054007733 par message bhej kar apna morning slot book kar sakte hain."
        }
      },
      {
        "@type": "Question",
        "name": "CWP ki cleaning mein kaun sa paani use hota hai?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "CWP Detailers 100% de-mineralized Zero-TDS RO water use karta hai, jisse gaadi ke paint par hard water scaling ya safed daag nahi aate."
        }
      },
      {
        "@type": "Question",
        "name": "Kya rooftop solar panel cleaning se bijli generation badhta hai?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Haan, Varanasi ki dhool aur pollution se solar panels par layer ban jaati hai. CWP ke demineralized RO water se scientific wash karane par generation 20% se 30% tak badh jaata hai."
        }
      },
      {
        "@type": "Question",
        "name": "Kya Ceramic Coating aur PPF doorstep par hoti hai?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Interior steam cleaning aur waxing doorstep par hoti hai, aur 9H nano ceramic coating and PPF hamare specialized dust-free Varanasi studio mein complete hoti hai pick and drop ke saath."
        }
      }
    ]
  };

  return `
    <title>${title}</title>
    <meta name="description" content="${description}">
    <meta name="keywords" content="${keywords}">
    <meta name="author" content="CWP Detailers & Motors">
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
    <link rel="canonical" href="${BASE_URL}/">

    <!-- OpenGraph / Facebook -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="${BASE_URL}/">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${BASE_URL}/cwp_logo.jpg">
    <meta property="og:locale" content="en_IN">

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:url" content="${BASE_URL}/">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${description}">
    <meta name="twitter:image" content="${BASE_URL}/cwp_logo.jpg">

    <!-- Schema.org Microdata -->
    <script type="application/ld+json">
      ${JSON.stringify(schemaOrgLocalBusiness)}
    </script>
    <script type="application/ld+json">
      ${JSON.stringify(schemaOrgFaq)}
    </script>
  `;
}

function getCareersSeoHead(config) {
  const phone = config.contact.phone || '7054007733';
  const email = config.contact.email || 'cwpdetailers@gmail.com';
  const title = "Careers at CWP Detailers — Car Cleaner, Wash & Detailing Jobs in Varanasi";
  const description = "Join CWP Detailers in Varanasi. Smart uniform, company ID, zero-TDS RO technology training, respectful team culture & on-time payouts. Apply now with just your name & mobile. Call 7054007733.";
  const keywords = [
    "car cleaner job in varanasi",
    "car wash job near me",
    "auto detailing jobs in varanasi",
    "solar cleaning technician jobs varanasi",
    "cwp careers",
    "part time morning job in varanasi",
    "doorstep technician vacancy varanasi",
    "driver and car washer vacancy varanasi"
  ].join(", ");

  const schemaOrgJobPosting = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    "title": "Doorstep Vehicle Care & Solar Cleaning Specialist",
    "description": description,
    "identifier": {
      "@type": "PropertyValue",
      "name": "CWP Detailers & Motors",
      "value": "CWP-JOB-VNS"
    },
    "datePosted": "2026-01-01",
    "validThrough": "2026-12-31",
    "employmentType": ["FULL_TIME", "PART_TIME"],
    "hiringOrganization": {
      "@type": "Organization",
      "name": "CWP Detailers & Motors",
      "sameAs": BASE_URL,
      "logo": `${BASE_URL}/cwp_logo.jpg`
    },
    "jobLocation": {
      "@type": "Place",
      "address": {
        "@type": "PostalAddress",
        "streetAddress": "FIRST FLOOR, 32/14-4A, Annapurna Nagar Colony, Vidya Vihar Colony, Shivpurwa",
        "addressLocality": "Varanasi",
        "addressRegion": "Uttar Pradesh",
        "postalCode": "221002",
        "addressCountry": "IN"
      }
    }
  };

  return `
    <title>${title}</title>
    <meta name="description" content="${description}">
    <meta name="keywords" content="${keywords}">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="${BASE_URL}/careers">

    <meta property="og:type" content="website">
    <meta property="og:url" content="${BASE_URL}/careers">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${BASE_URL}/cwp_logo.jpg">

    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${description}">

    <script type="application/ld+json">
      ${JSON.stringify(schemaOrgJobPosting)}
    </script>
  `;
}

module.exports = {
  getHomepageSeoHead,
  getCareersSeoHead
};
