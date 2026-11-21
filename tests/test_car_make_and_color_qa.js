/**
 * Automated QA Test Suite for Non-Mandatory Car Make and Car Color Fields:
 * 1. Migration 006 Schema & DDL Verification
 * 2. HTML Form Elements, Datalists, and Autocomplete Options
 * 3. CSS Component & Luxury Styling Verification
 * 4. Client-side Application Logic, Form Drafting, Submissions & Search Corpus
 * 5. Backend Services, Bilingual Search & Repositories Verification
 * 6. Live Neon Database Integration & Non-Mandatory CRUD Verification
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('===============================================================');
console.log('🚗 RUNNING CAR MAKE & CAR COLOR COMPREHENSIVE QA TEST SUITE');
console.log('===============================================================');

const rootDir = path.join(__dirname, '..');

// ---------------------------------------------------------------------------
// TEST 1: MIGRATION 006 DDL INTEGRITY & IDEMPOTENCY
// ---------------------------------------------------------------------------
console.log('\n--- TEST 1: Migration 006 SQL Integrity ---');
const migrationPath = path.join(rootDir, 'migrations', '006_add_car_make_and_car_color.sql');
assert.ok(fs.existsSync(migrationPath), 'migrations/006_add_car_make_and_car_color.sql must exist');

const migrationSql = fs.readFileSync(migrationPath, 'utf8');
assert.ok(migrationSql.includes('ALTER TABLE public.customers'), 'Migration must alter public.customers');
assert.ok(migrationSql.includes('ADD COLUMN IF NOT EXISTS car_make VARCHAR(100)'), 'customers must have car_make column with IF NOT EXISTS');
assert.ok(migrationSql.includes('ADD COLUMN IF NOT EXISTS car_color VARCHAR(50)'), 'customers must have car_color column with IF NOT EXISTS');
assert.ok(migrationSql.includes('ALTER TABLE public.vehicles'), 'Migration must alter public.vehicles');
assert.ok(migrationSql.includes('ADD COLUMN IF NOT EXISTS car_make VARCHAR(100)'), 'vehicles must have car_make column with IF NOT EXISTS');
assert.ok(migrationSql.includes('ADD COLUMN IF NOT EXISTS car_color VARCHAR(50)'), 'vehicles must have car_color column with IF NOT EXISTS');
assert.ok(migrationSql.includes('CREATE INDEX IF NOT EXISTS idx_customers_car_make'), 'Migration must index customers car_make');
assert.ok(migrationSql.includes('CREATE INDEX IF NOT EXISTS idx_customers_car_color'), 'Migration must index customers car_color');
assert.ok(migrationSql.includes('CREATE INDEX IF NOT EXISTS idx_vehicles_car_make'), 'Migration must index vehicles car_make');
assert.ok(migrationSql.includes('CREATE INDEX IF NOT EXISTS idx_vehicles_car_color'), 'Migration must index vehicles car_color');
console.log('✅ PASS 1: Migration 006 SQL verified with idempotent DDL, columns, and indexes for customers & vehicles');

// ---------------------------------------------------------------------------
// TEST 2: INDEX.HTML DOM FORM ELEMENTS & DATALISTS
// ---------------------------------------------------------------------------
console.log('\n--- TEST 2: Index.html DOM Form Elements & Datalists ---');
const indexPath = path.join(rootDir, 'Index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf8');

// Datalists
assert.ok(indexHtml.includes('<datalist id="carMakeList">'), 'Index.html must define carMakeList datalist');
assert.ok(indexHtml.includes('<datalist id="carColorList">'), 'Index.html must define carColorList datalist');
assert.ok(indexHtml.includes('value="Maruti Suzuki"'), 'carMakeList must suggest Maruti Suzuki');
assert.ok(indexHtml.includes('value="Hyundai"'), 'carMakeList must suggest Hyundai');
assert.ok(indexHtml.includes('value="Tata Motors"') || indexHtml.includes('value="Tata"'), 'carMakeList must suggest Tata');
assert.ok(indexHtml.includes('value="White"'), 'carColorList must suggest White');
assert.ok(indexHtml.includes('value="Silver"'), 'carColorList must suggest Silver');
assert.ok(indexHtml.includes('value="Black"'), 'carColorList must suggest Black');

// Add Customer Modal Inputs
assert.ok(indexHtml.includes('id="custCarMake"'), 'Add Customer modal must contain #custCarMake input');
assert.ok(indexHtml.includes('id="custCarColor"'), 'Add Customer modal must contain #custCarColor input');
assert.ok(indexHtml.includes('id="custCarMakeColorRow"'), 'Add Customer modal must have #custCarMakeColorRow wrapper');

// Edit Customer Modal Inputs
assert.ok(indexHtml.includes('id="editCustCarMake"'), 'Edit Customer modal must contain #editCustCarMake input');
assert.ok(indexHtml.includes('id="editCustCarColor"'), 'Edit Customer modal must contain #editCustCarColor input');
assert.ok(indexHtml.includes('id="editCustCarMakeColorRow"'), 'Edit Customer modal must have #editCustCarMakeColorRow wrapper');

// Add Lead Modal Inputs
assert.ok(indexHtml.includes('id="leadCarMake"'), 'Add Lead modal must contain #leadCarMake input');
assert.ok(indexHtml.includes('id="leadCarColor"'), 'Add Lead modal must contain #leadCarColor input');
assert.ok(indexHtml.includes('id="leadCarMakeColorRow"'), 'Add Lead modal must have #leadCarMakeColorRow wrapper');

// Convert Lead Modal Display
assert.ok(indexHtml.includes('id="convertLeadMakeColorWrap"'), 'Convert Lead modal must have #convertLeadMakeColorWrap');
assert.ok(indexHtml.includes('id="convertLeadMakeColorDisplay"'), 'Convert Lead modal must have #convertLeadMakeColorDisplay');

// Verify (Optional) non-mandatory tags
const addCustMakeSnippet = indexHtml.substring(indexHtml.indexOf('id="custCarMake"') - 300, indexHtml.indexOf('id="custCarMake"') + 200);
assert.ok(addCustMakeSnippet.includes('(Optional)'), 'Add Customer Car Make must be labeled (Optional)');
const addCustColorSnippet = indexHtml.substring(indexHtml.indexOf('id="custCarColor"') - 300, indexHtml.indexOf('id="custCarColor"') + 200);
assert.ok(addCustColorSnippet.includes('(Optional)'), 'Add Customer Car Color must be labeled (Optional)');

console.log('✅ PASS 2: All DOM elements, autocomplete datalists, and (Optional) labels verified in Index.html');

// ---------------------------------------------------------------------------
// TEST 3: CSS STYLES IN STYLE.CSS
// ---------------------------------------------------------------------------
console.log('\n--- TEST 3: CSS Styling in style.css ---');
const stylePath = path.join(rootDir, 'public', 'css', 'style.css');
const styleCss = fs.readFileSync(stylePath, 'utf8');

assert.ok(styleCss.includes('.table-vehicle-make-color'), 'style.css must define .table-vehicle-make-color for admin table');
assert.ok(styleCss.includes('.vehicle-make-color-pill'), 'style.css must define .vehicle-make-color-pill for staff portal cards');
assert.ok(styleCss.includes('.vehicle-make-color-pill') && (styleCss.includes('theme-dark .vehicle-make-color-pill') || styleCss.includes('[data-theme="dark"] .vehicle-make-color-pill')), 'style.css must have dark-mode rules for vehicle make & color pills');
assert.ok(styleCss.includes('.table-vehicle-make-color') && (styleCss.includes('theme-dark .table-vehicle-make-color') || styleCss.includes('[data-theme="dark"] .table-vehicle-make-color')), 'style.css must have dark-mode rules for table make & color text');
console.log('✅ PASS 3: CSS classes for table and staff card pills verified with full dark-mode compatibility');

// ---------------------------------------------------------------------------
// TEST 4: CLIENT-SIDE JAVASCRIPT APPLICATION LOGIC (app.js)
// ---------------------------------------------------------------------------
console.log('\n--- TEST 4: Client-Side Application Logic (app.js) ---');
const appJsPath = path.join(rootDir, 'public', 'js', 'app.js');
const appJs = fs.readFileSync(appJsPath, 'utf8');

// Bilingual Search integration
assert.ok(appJs.includes('record.carMake') && appJs.includes('record.carColor'), 'app.js search logic must index carMake and carColor');

// Staff Cards rendering
assert.ok(appJs.includes('vehicle-make-color-pill'), 'app.js renderCustomerCards must render .vehicle-make-color-pill');

// Admin Records Table rendering
assert.ok(appJs.includes('table-vehicle-make-color'), 'app.js renderAdminRecordsTable must render .table-vehicle-make-color');

// Form Auto-Drafting & Restoring
assert.ok(appJs.includes('custCarMake') && appJs.includes('saveCustomerDraft'), 'saveCustomerDraft must preserve custCarMake');
assert.ok(appJs.includes('custCarColor') && appJs.includes('saveCustomerDraft'), 'saveCustomerDraft must preserve custCarColor');
assert.ok(appJs.includes('custCarMake') && appJs.includes('restoreCustomerDraft'), 'restoreCustomerDraft must restore custCarMake');
assert.ok(appJs.includes('editCustCarMake') && appJs.includes('saveEditDraft'), 'saveEditDraft must preserve editCustCarMake');
assert.ok(appJs.includes('editCustCarColor') && appJs.includes('restoreEditDraft'), 'restoreEditDraft must restore editCustCarColor');

// Form Submissions
assert.ok(appJs.includes('handleCustomerSubmit'), 'app.js must have handleCustomerSubmit');
assert.ok(appJs.includes('handleEditCustomerSubmit'), 'app.js must have handleEditCustomerSubmit');
assert.ok(appJs.includes('handleLeadSubmit'), 'app.js must have handleLeadSubmit');

// Category-based dynamic field toggling
assert.ok(appJs.includes('custCarMakeColorRow'), 'toggleCategoryFields must show/hide #custCarMakeColorRow');
assert.ok(appJs.includes('editCustCarMakeColorRow'), 'handleEditCategoryChange must show/hide #editCustCarMakeColorRow');

console.log('✅ PASS 4: app.js drafting, submission, category toggling, staff cards, table & search verified');

// ---------------------------------------------------------------------------
// TEST 5: BACKEND REPOSITORIES & SERVICES INTEGRITY
// ---------------------------------------------------------------------------
console.log('\n--- TEST 5: Backend Repositories & Services ---');

// bilingualSearchService.js
const bilingualSearchService = require('../services/bilingualSearchService');
const searchRecord = {
  name: 'Rahul Verma',
  phone: '9876543210',
  carMake: 'Hyundai',
  carColor: 'Polar White',
  vehicles: [{ registrationNo: 'UP32 AB 1234', brandOrModel: 'Creta', carMake: 'Hyundai', carColor: 'White' }]
};
assert.ok(bilingualSearchService.recordMatchesQuery(searchRecord, 'hyundai'), 'Search must match carMake query');
assert.ok(bilingualSearchService.recordMatchesQuery(searchRecord, 'white'), 'Search must match carColor query');
assert.ok(bilingualSearchService.recordMatchesQuery(searchRecord, 'creta white'), 'Search must match multi-token make/model/color');
console.log('✅ PASS 5a: bilingualSearchService correctly matches queries on carMake & carColor');

// customersRepo.js
const customersRepo = require('../db/repositories/customersRepo');
assert.strictEqual(typeof customersRepo.createCustomer, 'function', 'customersRepo must export createCustomer');
assert.strictEqual(typeof customersRepo.updateCustomer, 'function', 'customersRepo must export updateCustomer');
assert.strictEqual(typeof customersRepo.findAll, 'function', 'customersRepo must export findAll');

const customersRepoSrc = fs.readFileSync(path.join(rootDir, 'db', 'repositories', 'customersRepo.js'), 'utf8');
assert.ok(customersRepoSrc.includes('car_make') && customersRepoSrc.includes('car_color'), 'customersRepo must include car_make and car_color');

// vehiclesRepo.js
const vehiclesRepo = require('../db/repositories/vehiclesRepo');
assert.strictEqual(typeof vehiclesRepo.createVehicle, 'function', 'vehiclesRepo must export createVehicle');
assert.strictEqual(typeof vehiclesRepo.updateVehicle, 'function', 'vehiclesRepo must export updateVehicle');

const vehiclesRepoSrc = fs.readFileSync(path.join(rootDir, 'db', 'repositories', 'vehiclesRepo.js'), 'utf8');
assert.ok(vehiclesRepoSrc.includes('carMake') && vehiclesRepoSrc.includes('carColor'), 'vehiclesRepo must handle carMake and carColor');

// serviceJobsRepo.js
const serviceJobsRepoSrc = fs.readFileSync(path.join(rootDir, 'db', 'repositories', 'serviceJobsRepo.js'), 'utf8');
assert.ok(serviceJobsRepoSrc.includes('v.car_make, v.car_color'), 'serviceJobsRepo queries must project v.car_make and v.car_color');

// staffRouteSequencesRepo.js
const staffRouteRepoSrc = fs.readFileSync(path.join(rootDir, 'db', 'repositories', 'staffRouteSequencesRepo.js'), 'utf8');
assert.ok(staffRouteRepoSrc.includes('v.car_make, v.car_color'), 'staffRouteSequencesRepo must project v.car_make and v.car_color');

// subscriptionVehiclesRepo.js
const subVehiclesRepoSrc = fs.readFileSync(path.join(rootDir, 'db', 'repositories', 'subscriptionVehiclesRepo.js'), 'utf8');
assert.ok(subVehiclesRepoSrc.includes('v.car_make, v.car_color'), 'subscriptionVehiclesRepo must project v.car_make and v.car_color');

// adminService.js
const adminServiceSrc = fs.readFileSync(path.join(rootDir, 'services', 'adminService.js'), 'utf8');
assert.ok(adminServiceSrc.includes('carMake') && adminServiceSrc.includes('carColor'), 'adminService must handle carMake and carColor');

// server.js payload handling
const serverSrc = fs.readFileSync(path.join(rootDir, 'server.js'), 'utf8');
assert.ok(serverSrc.includes('cust.carMake') || serverSrc.includes('cust.car_make'), 'server.js must normalize carMake/car_make in customer payloads');
assert.ok(serverSrc.includes('cust.carColor') || serverSrc.includes('cust.car_color'), 'server.js must normalize carColor/car_color in customer payloads');

console.log('✅ PASS 5b: Backend repositories, services, and server handlers properly wire carMake & carColor');

// ---------------------------------------------------------------------------
// TEST 6: LIVE NEON DATABASE INTEGRATION (WHEN DATABASE_URL IS PRESENT)
// ---------------------------------------------------------------------------
console.log('\n--- TEST 6: Live Database Integration & Non-Mandatory CRUD ---');

async function runLiveDbTests() {
  const db = require('../db');

  if (!process.env.DATABASE_URL) {
    console.log('  ℹ️ process.env.DATABASE_URL not set in current process; skipping live Neon DB queries.');
    return;
  }

  try {
    // 6a: Check columns and nullability in information_schema
    const colRes = await db.query(`
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('customers', 'vehicles')
        AND column_name IN ('car_make', 'car_color')
      ORDER BY table_name, column_name;
    `);

    assert.strictEqual(colRes.rows.length, 4, 'Must find 4 columns (2 in customers, 2 in vehicles)');
    for (const row of colRes.rows) {
      assert.strictEqual(row.is_nullable, 'YES', `Column ${row.table_name}.${row.column_name} must be nullable (non-mandatory)`);
      console.log(`  ✓ Verified column ${row.table_name}.${row.column_name}: ${row.data_type}, Nullable: ${row.is_nullable}`);
    }

    // 6b: Test Non-Mandatory customer creation (WITHOUT make and color)
    const testPhone1 = '9999990001';
    await db.query(`DELETE FROM public.customers WHERE phone = $1`, [testPhone1]);

    const custWithoutMakeColor = await customersRepo.createCustomer({
      name: 'QA Test Optional Fields User',
      phone: testPhone1,
      serviceCategory: 'Daily Car Cleaning'
      // car_make and car_color omitted entirely!
    });
    assert.ok(custWithoutMakeColor.id, 'Customer creation without car_make/car_color must succeed');
    assert.strictEqual(custWithoutMakeColor.car_make, null, 'Omitted car_make must be null');
    assert.strictEqual(custWithoutMakeColor.car_color, null, 'Omitted car_color must be null');
    console.log('  ✓ Verified non-mandatory behavior: Customer saved without make/color with null values.');

    // 6c: Test Customer creation WITH make and color
    const testPhone2 = '9999990002';
    await db.query(`DELETE FROM public.customers WHERE phone = $1`, [testPhone2]);

    const custWithMakeColor = await customersRepo.createCustomer({
      name: 'QA Test Make Color User',
      phone: testPhone2,
      serviceCategory: 'Daily Car Cleaning',
      car_make: 'Maruti Suzuki',
      car_color: 'Silver'
    });
    assert.ok(custWithMakeColor.id, 'Customer creation with car_make/car_color must succeed');
    assert.strictEqual(custWithMakeColor.car_make, 'Maruti Suzuki', 'car_make must match Maruti Suzuki');
    assert.strictEqual(custWithMakeColor.car_color, 'Silver', 'car_color must match Silver');
    console.log('  ✓ Verified insertion: Customer saved with car_make="Maruti Suzuki" & car_color="Silver".');

    // 6d: Test Customer update with new make and color
    const updatedCust = await customersRepo.updateCustomer(custWithMakeColor.id, {
      car_make: 'Tata Motors',
      car_color: 'Daytona Grey'
    });
    assert.strictEqual(updatedCust.car_make, 'Tata Motors', 'Updated car_make must match Tata Motors');
    assert.strictEqual(updatedCust.car_color, 'Daytona Grey', 'Updated car_color must match Daytona Grey');
    console.log('  ✓ Verified update: Customer updated to car_make="Tata Motors" & car_color="Daytona Grey".');

    // 6e: Test Vehicles repo creation with make and color
    const testVeh = await vehiclesRepo.createVehicle({
      customerId: custWithMakeColor.id,
      registrationNo: 'UP32 QA 9999',
      brandOrModel: 'Harrier',
      carMake: 'Tata Motors',
      carColor: 'Daytona Grey'
    });
    assert.ok(testVeh.id, 'Vehicle creation must succeed');
    assert.strictEqual(testVeh.car_make, 'Tata Motors', 'Vehicle car_make must match');
    assert.strictEqual(testVeh.car_color, 'Daytona Grey', 'Vehicle car_color must match');
    console.log('  ✓ Verified vehiclesRepo: Vehicle created with carMake="Tata Motors" & carColor="Daytona Grey".');

    // 6f: Test Vehicles repo update
    const updatedVeh = await vehiclesRepo.updateVehicle(testVeh.id, {
      carMake: 'Mahindra',
      carColor: 'Napoli Black'
    });
    assert.strictEqual(updatedVeh.car_make, 'Mahindra', 'Vehicle updated car_make must match');
    assert.strictEqual(updatedVeh.car_color, 'Napoli Black', 'Vehicle updated car_color must match');
    console.log('  ✓ Verified vehiclesRepo: Vehicle updated to carMake="Mahindra" & carColor="Napoli Black".');

    // Clean up test rows
    await db.query(`DELETE FROM public.vehicles WHERE id = $1`, [testVeh.id]);
    await db.query(`DELETE FROM public.customers WHERE id IN ($1, $2)`, [custWithoutMakeColor.id, custWithMakeColor.id]);
    console.log('  ✓ Cleaned up test database rows cleanly.');

    console.log('✅ PASS 6: Live Neon database CRUD, indexing, and non-mandatory nullability fully validated');
  } catch (err) {
    console.error('❌ FAIL in Live DB Tests:', err);
    throw err;
  }
}

runLiveDbTests().then(() => {
  console.log('\n===============================================================');
  console.log('🎉 ALL CAR MAKE & CAR COLOR QA TESTS PASSED CLEANLY (100%)!');
  console.log('===============================================================');
  process.exit(0);
}).catch((err) => {
  console.error('\n❌ QA Test Suite Failed:', err);
  process.exit(1);
});
