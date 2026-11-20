/**
 * =========================================================================
 * CWP DATA APP - PHASE 1E.1 PART B: FORENSIC GOOGLE SHEETS DATA AUDIT
 * Downloads raw CSV data directly for both master sheets and analyzes every record.
 * Generates exact counts, duplicate sets, alternate-day patterns, locations, and missing fields.
 * =========================================================================
 */

const https = require('https');
const fs = require('fs');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1IXs46tRE324YYgBBAKxD1aCCnYVzmqfX4jxCWvfiALY';
const GIDS = {
  'Daily Clean': process.env.GID_DAILY_CLEAN || '508927146',
  'All Other Work': process.env.GID_ALL_OTHER_WORK || '866987332'
};

function fetchCSV(gid) {
  return new Promise((resolve, reject) => {
    const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${gid}`;
    function doGet(targetUrl, redirects = 0) {
      if (redirects > 5) return reject(new Error('Too many redirects'));
      https.get(targetUrl, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return doGet(res.headers.location, redirects + 1);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Failed to fetch CSV: HTTP ${res.statusCode}`));
        }
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      }).on('error', reject);
    }
    doGet(url);
  });
}

function parseCSV(text) {
  const lines = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(cell.trim());
      cell = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      row.push(cell.trim());
      lines.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell || row.length > 0) {
    row.push(cell.trim());
    lines.push(row);
  }
  return lines;
}

function normalizeIndianMobile(raw) {
  if (!raw) return '';
  const digits = raw.toString().replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits.slice(-10);
}

function isValidIndianMobile(raw) {
  const norm = normalizeIndianMobile(raw);
  return /^[6-9]\d{9}$/.test(norm);
}

async function auditSheets() {
  console.log('================================================================');
  console.log('CWP DATA APP - PHASE 1E.1 GOOGLE SHEETS FORENSIC AUDIT');
  console.log(`Spreadsheet ID: ${SPREADSHEET_ID}`);
  console.log('================================================================\n');

  const auditReport = {
    sheets: {},
    totalSourceRows: 0,
    validCustomerRows: 0,
    blankRows: 0,
    malformedRows: 0,
    customersByPhone: {},
    duplicatePhoneSets: [],
    multiVehicleRows: [],
    multiLocationRows: [],
    alternateDayRows: [],
    unassignedRows: [],
    inactiveRows: [],
    photoStats: { hasPhoto: 0, missingPhoto: 0 },
    staffCounts: {},
    categoryCounts: {},
    manifest: []
  };

  for (const [sheetName, gid] of Object.entries(GIDS)) {
    console.log(`[Fetching Tab]: "${sheetName}" (GID: ${gid})...`);
    const csvRaw = await fetchCSV(gid);
    const parsed = parseCSV(csvRaw);
    
    if (parsed.length === 0) {
      console.warn(`Tab ${sheetName} is empty!`);
      continue;
    }

    const headers = parsed[0];
    const dataRows = parsed.slice(1);
    console.log(`  Headers (${headers.length}):`, headers);
    console.log(`  Total Data Rows in Sheet: ${dataRows.length}`);

    auditReport.sheets[sheetName] = {
      gid,
      headers,
      rowCount: dataRows.length,
      rows: []
    };

    const normHeaders = headers.map(h => (h || '').toLowerCase().replace(/[^a-z0-9]/g, ''));

    dataRows.forEach((rowVals, rIdx) => {
      const sheetRowNumber = rIdx + 2; // 1-based header is row 1
      auditReport.totalSourceRows++;

      // Check if completely blank row
      const isBlank = rowVals.every(v => !v || v.trim() === '');
      if (isBlank) {
        auditReport.blankRows++;
        return;
      }

      function getCol(aliases) {
        for (const a of aliases) {
          const idx = normHeaders.indexOf(a);
          if (idx >= 0 && rowVals[idx]) return rowVals[idx].trim();
        }
        return '';
      }

      const custName = getCol(['customername', 'custname', 'name']);
      const custPhone = getCol(['customernumber', 'custphone', 'number', 'phone', 'mob']);
      const mapUrl = getCol(['googlemapsurl', 'mapurl', 'maps', 'location']);
      const photoUrl = getCol(['customervehiclephotourl', 'vehiclesitephotourl', 'photourl', 'photo']);
      const address = getCol(['address']);
      const vehicle = getCol(['vehiclenumbersmodels', 'vehiclenumbersitename', 'vehiclenumbers', 'vehicle']);
      const pkgType = getCol(['packagetype', 'servicetypecarwashsolarcleaning', 'servicetype']) || (sheetName === 'Daily Clean' ? 'Daily Clean' : 'Car Washing');
      const pkgCount = getCol(['packagespurchased', 'pkgcount']) || '1';
      const staffName = getCol(['staffname', 'staff']) || 'Unassigned';
      const notes = getCol(['staffnotescleaninginstructions', 'staffnotesspecialinstructions', 'staffnotes', 'notes']);
      const secAddress = getCol(['secondaryaddressifany', 'secondaryaddress']);
      const secMaps = getCol(['secondarymapsurl']);
      const activeRaw = getCol(['active', 'status']) || 'Yes';
      const isActive = activeRaw.toLowerCase() === 'yes';

      // Check validity
      const hasValidPhone = isValidIndianMobile(custPhone);
      const normPhone = hasValidPhone ? normalizeIndianMobile(custPhone) : custPhone;
      
      const sheetCode = sheetName === 'Daily Clean' ? 'DC' : 'AOW';
      const rowPad = String(sheetRowNumber).padStart(2, '0');
      const customerCode = `CUST_${sheetCode}_R${rowPad}_${normPhone || 'NOPARSE'}`;

      let serviceCategory = 'Daily Car Cleaning';
      if (sheetName === 'All Other Work') {
        const lowerScope = (pkgType + ' ' + notes + ' ' + vehicle).toLowerCase();
        if (lowerScope.includes('solar')) {
          serviceCategory = 'Solar Panel Cleaning';
        } else {
          serviceCategory = 'Car Washing';
        }
      }

      const recordAudit = {
        sheetName,
        sourceRowIndex: sheetRowNumber,
        customerCode,
        customerName: custName,
        customerPhone: custPhone,
        normalizedPhone: normPhone,
        hasValidPhone,
        address,
        mapUrl,
        secondaryAddress: secAddress,
        secondaryMapsUrl: secMaps,
        vehicle,
        packageType: pkgType,
        packagesPurchased: pkgCount,
        staffName,
        notes,
        photoUrl,
        active: activeRaw,
        isActive,
        serviceCategory,
        migrationEligibility: hasValidPhone && custName ? 'ELIGIBLE' : 'REQUIRES_REVIEW'
      };

      auditReport.sheets[sheetName].rows.push(recordAudit);
      auditReport.manifest.push(recordAudit);

      if (recordAudit.migrationEligibility === 'ELIGIBLE') {
        auditReport.validCustomerRows++;
      } else {
        auditReport.malformedRows++;
      }

      // Track by phone
      if (!auditReport.customersByPhone[normPhone]) {
        auditReport.customersByPhone[normPhone] = [];
      }
      auditReport.customersByPhone[normPhone].push(recordAudit);

      // Track multi-vehicle strings (e.g. / or Aaj / Kal or &)
      if (vehicle && (vehicle.includes('/') || vehicle.includes('&') || vehicle.toLowerCase().includes('aaj') || vehicle.toLowerCase().includes('kal'))) {
        auditReport.multiVehicleRows.push(recordAudit);
      }

      // Track multi-location rows
      if (secAddress && secAddress.trim().length > 0) {
        auditReport.multiLocationRows.push(recordAudit);
      }

      // Track alternate-day notes
      if (notes && (notes.includes('एक दिन') || notes.toLowerCase().includes('alternate') || notes.toLowerCase().includes('aaj'))) {
        auditReport.alternateDayRows.push(recordAudit);
      }

      // Track unassigned
      if (!staffName || staffName.toLowerCase() === 'unassigned' || staffName.toLowerCase() === 'none') {
        auditReport.unassignedRows.push(recordAudit);
      }

      // Track inactive
      if (!isActive) {
        auditReport.inactiveRows.push(recordAudit);
      }

      // Photo stats
      if (photoUrl && photoUrl.trim().length > 0) {
        auditReport.photoStats.hasPhoto++;
      } else {
        auditReport.photoStats.missingPhoto++;
      }

      // Staff counts
      auditReport.staffCounts[staffName] = (auditReport.staffCounts[staffName] || 0) + 1;

      // Category counts
      auditReport.categoryCounts[serviceCategory] = (auditReport.categoryCounts[serviceCategory] || 0) + 1;
    });
  }

  // Identify duplicate phone sets
  for (const [phone, list] of Object.entries(auditReport.customersByPhone)) {
    if (list.length > 1) {
      auditReport.duplicatePhoneSets.push({
        phone,
        count: list.length,
        rows: list.map(r => ({ sheet: r.sheetName, row: r.sourceRowIndex, name: r.customerName, vehicle: r.vehicle }))
      });
    }
  }

  console.log('\n================================================================');
  console.log('AUDIT FINDINGS SUMMARY');
  console.log('================================================================');
  console.log(`Total Source Rows Processed: ${auditReport.totalSourceRows}`);
  console.log(`Valid & Eligible Customer Rows: ${auditReport.validCustomerRows}`);
  console.log(`Blank / Ignored Rows: ${auditReport.blankRows}`);
  console.log(`Malformed / Review Required Rows: ${auditReport.malformedRows}`);
  console.log(`Duplicate Phone Groups: ${auditReport.duplicatePhoneSets.length}`);
  console.log(`Multi-Vehicle Rows (/ or & or Aaj/Kal): ${auditReport.multiVehicleRows.length}`);
  console.log(`Multi-Location Rows (Secondary Address present): ${auditReport.multiLocationRows.length}`);
  console.log(`Alternate-Day Hindi Rotation Rows: ${auditReport.alternateDayRows.length}`);
  console.log(`Unassigned Records: ${auditReport.unassignedRows.length}`);
  console.log(`Inactive Records: ${auditReport.inactiveRows.length}`);
  console.log(`Records with Cloudinary/Drive Photos: ${auditReport.photoStats.hasPhoto}`);
  console.log(`Records with Missing Photos: ${auditReport.photoStats.missingPhoto}`);
  console.log('\nStaff Assignment Breakdown:', auditReport.staffCounts);
  console.log('Service Category Breakdown:', auditReport.categoryCounts);
  console.log('\nDuplicate Phone Groups Detail:');
  console.dir(auditReport.duplicatePhoneSets, { depth: null });

  fs.writeFileSync('fixtures/audit_report_cache.json', JSON.stringify(auditReport, null, 2), 'utf8');
  console.log('\n[Saved Audit Cache]: fixtures/audit_report_cache.json');
}

auditSheets().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
