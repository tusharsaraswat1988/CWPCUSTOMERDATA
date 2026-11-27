/**
 * =========================================================================
 * AUTOMATED QA SUITE: Milestone 1 — P0 Completion Integrity, Idempotency,
 * Checklist Identity Validation & Cross-Engine Isolation (F1–F6)
 *
 * Uses isolated mocked db/repositories + NODE_ENV=test (ZERO live Neon writes).
 * =========================================================================
 */

'use strict';

process.env.NODE_ENV = 'test';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const db = require('../db/index');
const repos = require('../db/repositories/index');
const serviceJobsRepo = require('../db/repositories/serviceJobsRepo');
const serviceLogsRepo = require('../db/repositories/serviceLogsRepo');
const seeOperationsRepo = require('../db/repositories/seeOperationsRepo');
const seeCatalogueService = require('../services/seeCatalogueService');
const seeExecutionService = require('../services/seeExecutionService');
const seeEntitlementService = require('../services/seeEntitlementService');
const seeStaffCapabilityService = require('../services/seeStaffCapabilityService');
const packageService = require('../services/packageService');
const bookingService = require('../services/bookingService');

let passed = 0;
let failed = 0;

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`✅ PASS: ${name}`);
    passed += 1;
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(err);
    failed += 1;
  }
}

/**
 * Helper to temporarily monkey-patch object properties and restore after callback.
 */
async function withMocks(patches, fn) {
  const backups = [];
  for (const [obj, key, impl] of patches) {
    const hadOwn = Object.prototype.hasOwnProperty.call(obj, key);
    backups.push({ obj, key, hadOwn, prev: obj[key] });
    obj[key] = impl;
  }
  try {
    return await fn();
  } finally {
    for (let i = backups.length - 1; i >= 0; i -= 1) {
      const { obj, key, hadOwn, prev } = backups[i];
      if (hadOwn) {
        obj[key] = prev;
      } else {
        delete obj[key];
      }
    }
  }
}

(async () => {
  console.log('===============================================================');
  console.log('🚀 RUNNING M1 P0 INTEGRITY, IDEMPOTENCY & CHECKLIST QA SUITE');
  console.log('===============================================================\n');

  // -------------------------------------------------------------------------
  // 1. Migration 027 Verification
  // -------------------------------------------------------------------------
  await runTest('Migration 027: additive, idempotent DDL for service_executions & service_logs', async () => {
    const sqlPath = path.resolve(__dirname, '../migrations/027_p0_completion_integrity_and_idempotency.sql');
    assert.ok(fs.existsSync(sqlPath), 'Migration 027 must exist');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    assert.ok(/\bBEGIN\s*;/i.test(sql) && /\bCOMMIT\s*;/i.test(sql), 'Must be wrapped in BEGIN ... COMMIT');
    assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS client_mutation_id UUID NULL'), 'Adds client_mutation_id');
    assert.ok(sql.includes('CREATE UNIQUE INDEX IF NOT EXISTS uq_service_executions_client_mutation'), 'Adds unique client_mutation_id index');
    assert.ok(sql.includes('CREATE UNIQUE INDEX IF NOT EXISTS uq_service_executions_terminal_job'), 'Adds unique terminal job index');
    assert.ok(sql.includes('ALTER COLUMN staff_id DROP NOT NULL'), 'Drops NOT NULL on service_logs.staff_id');
    assert.ok(sql.includes('chk_service_logs_staff_or_job'), 'Adds CHECK (staff_id IS NOT NULL OR job_id IS NOT NULL)');
  });

  // -------------------------------------------------------------------------
  // 2. F4: serviceJobsRepo.findByCustomerId LATERAL join
  // -------------------------------------------------------------------------
  await runTest('F4: serviceJobsRepo.findByCustomerId includes service_executions LATERAL join and latest_execution_* columns', async () => {
    const queries = [];
    const mockClient = {
      query: async (sql, params) => {
        queries.push({ sql, params });
        return { rows: [{ id: 'job-1', latest_execution_id: 'exec-1' }] };
      }
    };
    const rows = await serviceJobsRepo.findByCustomerId('cust-1', { client: mockClient });
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(queries.length, 1);
    const sql = queries[0].sql;
    assert.ok(sql.includes('LEFT JOIN LATERAL'), 'Must include LEFT JOIN LATERAL');
    assert.ok(sql.includes('FROM public.service_executions se'), 'Must join public.service_executions');
    assert.ok(sql.includes('latest_execution_id'), 'Must project latest_execution_id');
    assert.ok(sql.includes('latest_execution_outcome'), 'Must project latest_execution_outcome');
    assert.ok(sql.includes('latest_execution_ended_at'), 'Must project latest_execution_ended_at');
    assert.ok(sql.includes('latest_checklist_results'), 'Must project latest_checklist_results');
    assert.ok(sql.includes('latest_proof_photos'), 'Must project latest_proof_photos');
  });

  // -------------------------------------------------------------------------
  // 3. Repository helpers: seeOperationsRepo & serviceLogsRepo
  // -------------------------------------------------------------------------
  await runTest('Repo contracts: seeOperationsRepo persists client_mutation_id & serviceLogsRepo handles uq_service_logs_job_once', async () => {
    const execQueries = [];
    const mockExecClient = {
      query: async (sql, params) => {
        execQueries.push({ sql, params });
        return { rows: [{ id: 'exec-1', job_id: 'job-1', client_mutation_id: params[2] }] };
      }
    };
    const createdExec = await seeOperationsRepo.createExecution({
      jobId: 'job-1',
      staffId: 'staff-1',
      clientMutationId: '11111111-1111-4111-8111-111111111111',
      outcome: 'completed'
    }, mockExecClient);
    assert.strictEqual(createdExec.client_mutation_id, '11111111-1111-4111-8111-111111111111');
    assert.ok(execQueries[0].sql.includes('client_mutation_id'), 'createExecution SQL includes client_mutation_id');

    // Simulate 23505 on uq_service_logs_job_once
    let callNum = 0;
    const dupLogRunner = {
      query: async (sql) => {
        callNum += 1;
        if (callNum === 1) {
          assert.ok(sql.includes('INSERT INTO public.service_logs'), 'First query must remain INSERT');
          const err = new Error('duplicate key value violates unique constraint "uq_service_logs_job_once"');
          err.code = '23505';
          err.constraint = 'uq_service_logs_job_once';
          throw err;
        }
        return { rows: [{ id: 'log-existing', job_id: 'job-1' }] };
      }
    };
    const dupRes = await serviceLogsRepo.recordCompletion({
      clientMutationId: '22222222-2222-4222-8222-222222222222',
      staffId: null,
      jobId: 'job-1',
      completedAtDevice: '2026-11-27T12:00:00.000Z'
    }, dupLogRunner);
    assert.strictEqual(dupRes.inserted, false);
    assert.strictEqual(dupRes.duplicate, true);
    assert.strictEqual(dupRes.log.id, 'log-existing');
  });

  // -------------------------------------------------------------------------
  // 4. F5 (P0-C): Checklist normalization & strict ID validation
  // -------------------------------------------------------------------------
  await runTest('F5 (P0-C): normalizeChecklistRequirements produces authoritative {id, key, label, required} and rejects invalid configs', async () => {
    const norm = seeCatalogueService.normalizeChecklistRequirements([
      'Rinse',
      'Foam Wash',
      'Rinse',
      { id: 'wheel_clean', label: 'Wheel Clean', required: true },
      { label: 'Air Freshener', required: false }
    ]);

    assert.deepStrictEqual(norm, [
      { id: 'rinse', key: 'rinse', label: 'Rinse', required: true },
      { id: 'foam_wash', key: 'foam_wash', label: 'Foam Wash', required: true },
      { id: 'rinse_2', key: 'rinse_2', label: 'Rinse', required: true },
      { id: 'wheel_clean', key: 'wheel_clean', label: 'Wheel Clean', required: true },
      { id: 'air_freshener', key: 'air_freshener', label: 'Air Freshener', required: false }
    ]);

    assert.throws(() => seeCatalogueService.normalizeChecklistRequirements({ not: 'an-array' }), /must be an array/);
    assert.throws(() => seeCatalogueService.normalizeChecklistRequirements([{ id: 'x', label: '  ' }]), /non-empty label/);
    assert.throws(
      () => seeCatalogueService.normalizeChecklistRequirements([
        { id: 'dup', label: 'A' },
        { id: 'dup', label: 'B' }
      ]),
      /Duplicate checklist item id/
    );
    // Conflicting key vs id across items must be rejected, while key === id on same item is allowed
    const sameKeyAndId = seeCatalogueService.normalizeChecklistRequirements([
      { id: 'ext_same', key: 'ext_same', label: 'Exterior Same' }
    ]);
    assert.deepStrictEqual(sameKeyAndId, [
      { id: 'ext_same', key: 'ext_same', label: 'Exterior Same', required: true }
    ]);
    assert.throws(
      () => seeCatalogueService.normalizeChecklistRequirements([
        { id: 'chk_1', key: 'exterior', label: 'Exterior 1' },
        { id: 'exterior', label: 'Exterior 2' }
      ]),
      /Duplicate checklist item id 'exterior'/
    );
    assert.throws(
      () => seeCatalogueService.normalizeChecklistRequirements([
        { id: 'exterior', label: 'Exterior 1' },
        { id: 'chk_2', key: 'exterior', label: 'Exterior 2' }
      ]),
      /Duplicate checklist item key 'exterior'/
    );
    assert.throws(
      () => seeCatalogueService.normalizeChecklistRequirements([
        { id: 'chk_1', key: 'shared_key', label: 'Item 1' },
        { id: 'chk_2', key: 'shared_key', label: 'Item 2' }
      ]),
      /Duplicate checklist item key 'shared_key'/
    );
    assert.throws(() => seeCatalogueService.normalizeChecklistRequirements([123]), /Invalid checklist item/);
  });

  await runTest('F5 (P0-C): seeCatalogueService.createService and updateService normalize checklistRequirements', async () => {
    let createdPayload = null;
    let updatedPayload = null;
    await withMocks([
      [repos.seeCatalogue, 'findServiceByCode', async () => null],
      [repos.seeCatalogue, 'findServiceById', async () => ({ id: 'svc-1', status: 'active' })],
      [repos.seeCatalogue, 'createService', async (data) => { createdPayload = data; return { id: 'svc-1', ...data }; }],
      [repos.seeCatalogue, 'updateService', async (_id, patch) => { updatedPayload = patch; return { id: 'svc-1', ...patch }; }],
      [repos.auditLogs, 'logChange', async () => ({})],
      [db, 'withTransaction', async (cb) => cb({ query: async () => ({ rows: [] }) })]
    ], async () => {
      await seeCatalogueService.createService({
        serviceCode: 'WASH_PRO',
        name: 'Wash Pro',
        serviceCategoryId: 'car_washing',
        checklistRequirements: ['Exterior Clean', 'Glass Clean']
      });
      assert.deepStrictEqual(createdPayload.checklistRequirements, [
        { id: 'exterior_clean', key: 'exterior_clean', label: 'Exterior Clean', required: true },
        { id: 'glass_clean', key: 'glass_clean', label: 'Glass Clean', required: true }
      ]);

      await seeCatalogueService.updateService('svc-1', {
        checklistRequirements: [{ id: 'opt_scent', label: 'Cabin Scent', required: false }]
      });
      assert.deepStrictEqual(updatedPayload.checklistRequirements, [
        { id: 'opt_scent', key: 'opt_scent', label: 'Cabin Scent', required: false }
      ]);
    });
  });

  await runTest('F5 (P0-C): validateChecklistSubmission enforces exact authoritative IDs and handles optional items', async () => {
    const req = [
      { id: 'exterior_clean', key: 'exterior_clean', label: 'Exterior Clean', required: true },
      { id: 'glass_clean', key: 'glass_clean', label: 'Glass Clean', required: true },
      { id: 'wheel_clean', key: 'wheel_clean', label: 'Wheel Clean', required: true },
      { id: 'fragrance', key: 'fragrance', label: 'Interior Fragrance', required: false }
    ];

    // Valid: all required true, optional omitted
    const res1 = seeExecutionService.validateChecklistSubmission(req, [
      { id: 'exterior_clean', completed: true },
      { id: 'glass_clean', completed: true },
      { id: 'wheel_clean', completed: true }
    ]);
    assert.strictEqual(res1.valid, true);
    assert.strictEqual(res1.normalizedResults.find(i => i.id === 'fragrance').completed, false);

    // Valid: optional explicitly false
    const res2 = seeExecutionService.validateChecklistSubmission(req, [
      { id: 'exterior_clean', completed: true },
      { id: 'glass_clean', completed: true },
      { id: 'wheel_clean', completed: true },
      { id: 'fragrance', completed: false }
    ]);
    assert.strictEqual(res2.valid, true);

    // Reject missing required item
    assert.throws(
      () => seeExecutionService.validateChecklistSubmission(req, [
        { id: 'exterior_clean', completed: true },
        { id: 'glass_clean', completed: true }
      ]),
      /Required checklist items incomplete: wheel_clean/
    );

    // Reject duplicate IDs (even when count matches!)
    assert.throws(
      () => seeExecutionService.validateChecklistSubmission(req, [
        { id: 'exterior_clean', completed: true },
        { id: 'exterior_clean', completed: true },
        { id: 'wheel_clean', completed: true }
      ]),
      /Duplicate checklist item id 'exterior_clean'/
    );

    // Reject id + key alias duplication
    assert.throws(
      () => seeExecutionService.validateChecklistSubmission(
        [{ id: 'ext_1', key: 'ext_alias', label: 'Ext', required: true }],
        [
          { id: 'ext_1', completed: true },
          { key: 'ext_alias', completed: true }
        ]
      ),
      /Duplicate checklist item id 'ext_1'/
    );

    // Reject unknown / wrong-service IDs (right count, wrong IDs)
    assert.throws(
      () => seeExecutionService.validateChecklistSubmission(req, [
        { id: 'solar_panel_wipe', completed: true },
        { id: 'solar_inverter_check', completed: true },
        { id: 'solar_frame_dry', completed: true }
      ]),
      /Unknown or wrong-service checklist item id 'solar_panel_wipe'/
    );

    // Reject label-only substitution
    assert.throws(
      () => seeExecutionService.validateChecklistSubmission(req, [
        { label: 'Exterior Clean', completed: true },
        { label: 'Glass Clean', completed: true },
        { label: 'Wheel Clean', completed: true }
      ]),
      /label-only substitution is not permitted/
    );

    // Reject bare string entries, null, non-array, non-boolean completed, and non-primitive id coercion
    assert.throws(() => seeExecutionService.validateChecklistSubmission(req, ['exterior_clean']), /Malformed checklist entry/);
    assert.throws(() => seeExecutionService.validateChecklistSubmission(req, [null]), /Malformed checklist entry/);
    assert.throws(() => seeExecutionService.validateChecklistSubmission(req, 'bad'), /must be an array/);
    assert.throws(
      () => seeExecutionService.validateChecklistSubmission(req, [
        { id: 'exterior_clean', completed: 'yes' }
      ]),
      /requires boolean completed status/
    );
    assert.throws(
      () => seeExecutionService.validateChecklistSubmission(req, [
        { id: ['exterior_clean'], completed: true },
        { id: 'glass_clean', completed: true },
        { id: 'wheel_clean', completed: true }
      ]),
      /invalid item id type/
    );
    assert.throws(
      () => seeExecutionService.validateChecklistSubmission(req, [
        { id: {}, completed: true },
        { id: 'glass_clean', completed: true },
        { id: 'wheel_clean', completed: true }
      ]),
      /invalid item id type/
    );
  });

  // -------------------------------------------------------------------------
  // 5. F1 & F2: completeExecution atomicity, rollback, unassigned admin, idempotency
  // -------------------------------------------------------------------------
  await runTest('F1: completeExecution rolls back ALL state when service_logs or mutateEntitlement throws', async () => {
    const committed = {
      jobStatus: 'in_progress',
      entitlementConsumed: false,
      executions: [],
      serviceLogs: [],
      entitlementLedger: []
    };

    const makeMockState = (failStage = null) => {
      return async (cb) => {
        const draft = {
          jobStatus: committed.jobStatus,
          entitlementConsumed: committed.entitlementConsumed,
          executions: [...committed.executions],
          serviceLogs: [...committed.serviceLogs],
          entitlementLedger: [...committed.entitlementLedger]
        };
        const txClient = {
          _draft: draft,
          query: async (sql, params) => {
            if (sql.includes('UPDATE public.service_jobs') && sql.includes("status = 'completed'")) {
              draft.jobStatus = 'completed';
              draft.entitlementConsumed = true;
              return { rowCount: 1, rows: [{ id: params[0], status: 'completed' }] };
            }
            return { rowCount: 0, rows: [] };
          }
        };
        const result = await cb(txClient);
        if (failStage === 'after_cb') throw new Error('commit fail');
        // Commit draft
        committed.jobStatus = draft.jobStatus;
        committed.entitlementConsumed = draft.entitlementConsumed;
        committed.executions = draft.executions;
        committed.serviceLogs = draft.serviceLogs;
        committed.entitlementLedger = draft.entitlementLedger;
        return result;
      };
    };

    const baseJob = {
      id: '11111111-1111-4111-8111-111111111111',
      status: 'in_progress',
      before_photos: ['b1.jpg'],
      proof_requirements: { before_min: 1, after_min: 1, required: true },
      checklist_requirements: [{ id: 'rinse', key: 'rinse', label: 'Rinse', required: true }],
      entitlement_account_id: 'acct-1',
      service_payload: { _seeManaged: true }
    };

    let throwInLogs = true;
    let throwInEntitlement = false;

    await withMocks([
      [db, 'withTransaction', makeMockState()],
      [repos.serviceJobs, 'findByIdForUpdate', async () => ({ ...baseJob, status: committed.jobStatus })],
      [repos.seeOperations, 'findJobAddons', async () => []],
      [repos.seeOperations, 'findSolarVerificationByJob', async () => null],
      [repos.seeOperations, 'findExecutionByClientMutationId', async () => null],
      [repos.seeOperations, 'findTerminalExecutionByJobId', async () => null],
      [repos.seeOperations, 'findExecutionsByJob', async () => []],
      [repos.seeOperations, 'createExecution', async (data, client) => {
        const rec = { id: 'exec-1', job_id: data.jobId, staff_id: data.staffId, client_mutation_id: data.clientMutationId, outcome: data.outcome };
        client._draft.executions.push(rec);
        return rec;
      }],
      [repos.serviceLogs, 'findByClientMutationId', async () => null],
      [repos.serviceLogs, 'findByJobId', async () => null],
      [repos.serviceLogs, 'recordCompletion', async (data, client) => {
        if (throwInLogs) throw new Error('simulated service_logs failure');
        const log = { id: 'log-1', job_id: data.jobId, staff_id: data.staffId, client_mutation_id: data.clientMutationId, source: data.source };
        client._draft.serviceLogs.push(log);
        return { inserted: true, log };
      }],
      [seeEntitlementService, 'mutateEntitlement', async (data, client) => {
        if (throwInEntitlement) throw new Error('simulated entitlement failure');
        const entry = { id: 'led-1', ...data };
        client._draft.entitlementLedger.push(entry);
        return entry;
      }],
      [seeStaffCapabilityService, 'resolveStaffRecord', async (sid) => ({ id: sid })]
    ], async () => {
      // Case A: service_logs throws -> full rollback
      await assert.rejects(
        () => seeExecutionService.completeExecution(baseJob.id, {
          staffId: 'staff-uuid-1',
          checklistResults: [{ id: 'rinse', completed: true }],
          proofPhotos: { after: ['a1.jpg'] },
          clientMutationId: 'mut-rollback-1'
        }),
        /simulated service_logs failure/
      );
      assert.strictEqual(committed.jobStatus, 'in_progress', 'Job status rolled back');
      assert.strictEqual(committed.executions.length, 0, 'Executions rolled back');
      assert.strictEqual(committed.entitlementLedger.length, 0, 'Entitlement ledger rolled back');
      assert.strictEqual(committed.serviceLogs.length, 0, 'Service logs rolled back');

      // Case B: mutateEntitlement throws -> full rollback
      throwInLogs = false;
      throwInEntitlement = true;
      await assert.rejects(
        () => seeExecutionService.completeExecution(baseJob.id, {
          staffId: 'staff-uuid-1',
          checklistResults: [{ id: 'rinse', completed: true }],
          proofPhotos: { after: ['a1.jpg'] },
          clientMutationId: 'mut-rollback-2'
        }),
        /simulated entitlement failure/
      );
      assert.strictEqual(committed.jobStatus, 'in_progress');
      assert.strictEqual(committed.executions.length, 0);
      assert.strictEqual(committed.entitlementLedger.length, 0);
      assert.strictEqual(committed.serviceLogs.length, 0);

      // Case C: Happy path commits execution + service_log + entitlement + job atomically
      throwInEntitlement = false;
      const res = await seeExecutionService.completeExecution(baseJob.id, {
        staffId: 'staff-uuid-1',
        checklistResults: [{ id: 'rinse', completed: true }],
        proofPhotos: { after: ['a1.jpg'] },
        clientMutationId: 'mut-ok-1'
      });
      assert.strictEqual(res.idempotent, false);
      assert.ok(res.serviceLog && res.serviceLog.id === 'log-1');
      assert.strictEqual(committed.jobStatus, 'completed');
      assert.strictEqual(committed.executions.length, 1);
      assert.strictEqual(committed.serviceLogs.length, 1);
      assert.strictEqual(committed.entitlementLedger.length, 1);
    });
  });

  await runTest('F1 & F2: completeExecution supports unassigned admin completion and strict clientMutationId replay vs rejection', async () => {
    const state = {
      status: 'assigned',
      exec: null,
      log: null,
      mutateCalls: 0,
      execCalls: 0,
      logCalls: 0
    };

    await withMocks([
      [db, 'withTransaction', async (cb) => cb({
        query: async () => {
          state.status = 'completed';
          return { rowCount: 1, rows: [{ id: 'job-unassigned', status: 'completed' }] };
        }
      })],
      [repos.serviceJobs, 'findByIdForUpdate', async () => ({
        id: 'job-unassigned',
        status: state.status,
        before_photos: [],
        proof_requirements: { before_min: 0, after_min: 0, required: false },
        checklist_requirements: [{ id: 'rinse', key: 'rinse', label: 'Rinse', required: true }],
        entitlement_account_id: 'acct-unassigned',
        service_payload: { _seeManaged: true }
      })],
      [repos.seeOperations, 'findJobAddons', async () => []],
      [repos.seeOperations, 'findSolarVerificationByJob', async () => null],
      [repos.staffAssignments, 'findActiveByJobId', async () => null],
      [repos.seeOperations, 'findExecutionsByJob', async () => []],
      [repos.seeOperations, 'findExecutionByClientMutationId', async (mut) => (state.exec && state.exec.client_mutation_id === mut ? state.exec : null)],
      [repos.seeOperations, 'findTerminalExecutionByJobId', async () => state.exec],
      [repos.seeOperations, 'createExecution', async (data) => {
        state.execCalls += 1;
        state.exec = { id: 'exec-u1', job_id: data.jobId, staff_id: data.staffId, client_mutation_id: data.clientMutationId, outcome: 'completed' };
        return state.exec;
      }],
      [repos.serviceLogs, 'findByClientMutationId', async (mut) => (state.log && state.log.client_mutation_id === mut ? state.log : null)],
      [repos.serviceLogs, 'findByJobId', async () => state.log],
      [repos.serviceLogs, 'recordCompletion', async (data) => {
        state.logCalls += 1;
        state.log = { id: 'log-u1', job_id: data.jobId, staff_id: data.staffId, client_mutation_id: data.clientMutationId, source: data.source };
        return { inserted: true, log: state.log };
      }],
      [seeEntitlementService, 'mutateEntitlement', async () => { state.mutateCalls += 1; return {}; }]
    ], async () => {
      // Unassigned admin completion
      const first = await seeExecutionService.completeExecution('job-unassigned', {
        staffId: null,
        checklistResults: [{ id: 'rinse', completed: true }],
        clientMutationId: 'mut-admin-1',
        actor: 'admin'
      });
      assert.strictEqual(first.idempotent, false);
      assert.strictEqual(first.staff_id, null);
      assert.strictEqual(first.serviceLog.staff_id, null);
      assert.strictEqual(first.serviceLog.source, 'admin_manual');
      assert.strictEqual(state.mutateCalls, 1);

      // Matching clientMutationId replays idempotently without re-executing mutations
      const replay = await seeExecutionService.completeExecution('job-unassigned', {
        staffId: null,
        checklistResults: [{ id: 'rinse', completed: true }],
        clientMutationId: 'mut-admin-1',
        actor: 'admin'
      });
      assert.strictEqual(replay.idempotent, true);
      assert.strictEqual(replay.id, 'exec-u1');
      assert.strictEqual(replay.serviceLog.id, 'log-u1');
      assert.strictEqual(state.mutateCalls, 1);
      assert.strictEqual(state.execCalls, 1);
      assert.strictEqual(state.logCalls, 1);

      // Missing clientMutationId on completed job MUST reject
      await assert.rejects(
        () => seeExecutionService.completeExecution('job-unassigned', {
          staffId: null,
          checklistResults: [{ id: 'rinse', completed: true }]
        }),
        /already in terminal status 'completed'/
      );

      // Mismatched clientMutationId on completed job MUST reject
      await assert.rejects(
        () => seeExecutionService.completeExecution('job-unassigned', {
          staffId: null,
          checklistResults: [{ id: 'rinse', completed: true }],
          clientMutationId: 'mut-different'
        }),
        /already in terminal status 'completed'/
      );
    });
  });

  await runTest('F2: startExecution locks job FOR UPDATE and rejects duplicate in_progress execution', async () => {
    let lockedInTx = false;
    await withMocks([
      [db, 'withTransaction', async (cb) => cb({ query: async () => ({ rowCount: 1, rows: [{}] }) })],
      [repos.serviceJobs, 'findByIdForUpdate', async () => {
        lockedInTx = true;
        return { id: 'job-start-1', status: 'assigned', service_payload: { _seeManaged: true } };
      }],
      [repos.seeOperations, 'findExecutionsByJob', async () => [{ id: 'exec-existing', outcome: 'in_progress' }]]
    ], async () => {
      await assert.rejects(
        () => seeExecutionService.startExecution('job-start-1', 'staff-1'),
        /already has an in_progress execution/
      );
      assert.strictEqual(lockedInTx, true);
    });
  });

  // -------------------------------------------------------------------------
  // 6. F3 & F2: bookingService Neon & Local atomicity, idempotency, locking, package audit tx
  // -------------------------------------------------------------------------
  await runTest('F3: packageService.redeemPackage passes actualClient to repos.auditLogs.logChange', async () => {
    const fakeClient = { query: async () => ({ rows: [] }) };
    let passedAuditClient = null;
    await withMocks([
      [db, 'isConfigured', () => true],
      [repos.packages, 'redeemPackage', async (_id, _data, client) => {
        assert.strictEqual(client, fakeClient);
        return {
          package: { id: 'pkg-1', package_name: 'Wash 4x', remaining_quantity: 3, status: 'active' },
          redemptionLog: { id: 'red-1' }
        };
      }],
      [repos.auditLogs, 'logChange', async (_entry, client) => {
        passedAuditClient = client;
        return { id: 'aud-1' };
      }]
    ], async () => {
      const prevNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      try {
        await packageService.redeemPackage({ packageId: 'pkg-1', quantity: 1, serviceJobId: 'job-1' }, 'admin', fakeClient);
        assert.strictEqual(passedAuditClient, fakeClient, 'auditLogs.logChange must receive actualClient');
      } finally {
        process.env.NODE_ENV = prevNodeEnv;
      }
    });
  });

  await runTest('F2 & F3: bookingService.completeJob (Neon mocked) writes service_logs in tx, rolls back on failure, and supports clientMutationId replay', async () => {
    const committed = {
      status: 'in_progress',
      entitlementConsumed: false,
      redeemCount: 0,
      log: null
    };
    let shouldFailLog = true;

    const txImpl = async (cb) => {
      const draft = { ...committed };
      const client = { _draft: draft, query: async () => ({ rows: [] }) };
      const res = await cb(client);
      committed.status = draft.status;
      committed.entitlementConsumed = draft.entitlementConsumed;
      committed.redeemCount = draft.redeemCount;
      committed.log = draft.log;
      return res;
    };

    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      await withMocks([
        [db, 'isConfigured', () => true],
        [db, 'withTransaction', txImpl],
        [repos.serviceJobs, 'findByIdForUpdate', async () => ({
          id: 'leg-job-1',
          status: committed.status,
          package_id: 'pkg-1',
          entitlement_consumed: committed.entitlementConsumed,
          vehicle_id: 'veh-1',
          location_id: 'loc-1',
          service_id: 'auto-populated-service-id',
          service_payload: {}
        })],
        [repos.seeOperations, 'findJobAddons', async () => []],
        [repos.seeOperations, 'findSolarVerificationByJob', async () => null],
        [repos.packages, 'redeemPackage', async (_id, _data, client) => {
          client._draft.redeemCount += 1;
          return { package: { id: 'pkg-1', package_name: 'Pack', remaining_quantity: 1, status: 'active' }, redemptionLog: { id: 'red-1' } };
        }],
        [repos.auditLogs, 'logChange', async () => ({})],
        [repos.serviceJobs, 'completeJob', async (id, _opts, client) => {
          client._draft.status = 'completed';
          return { id, status: 'completed', completed_at: '2026-11-27T12:00:00.000Z', entitlement_consumed: false };
        }],
        [repos.serviceJobs, 'updateJob', async (_id, updates, client) => {
          if (updates.entitlementConsumed) client._draft.entitlementConsumed = true;
          return {};
        }],
        [repos.staffAssignments, 'findActiveByJobId', async () => ({ staff_id: 'staff-1' })],
        [repos.serviceLogs, 'findByClientMutationId', async (mut) => (committed.log && committed.log.client_mutation_id === mut ? committed.log : null)],
        [repos.serviceLogs, 'findByJobId', async () => committed.log],
        [repos.serviceLogs, 'recordCompletion', async (data, client) => {
          if (shouldFailLog) throw new Error('service_log insert failed');
          const log = { id: 'log-leg-1', ...data, job_id: data.jobId, staff_id: data.staffId, client_mutation_id: data.clientMutationId };
          client._draft.log = log;
          return { inserted: true, log };
        }]
      ], async () => {
        // Rollback when service_logs fails
        await assert.rejects(
          () => bookingService.completeJob({ jobId: 'leg-job-1', clientMutationId: 'mut-leg-1', actor: 'staff' }),
          /service_log insert failed/
        );
        assert.strictEqual(committed.status, 'in_progress');
        assert.strictEqual(committed.redeemCount, 0);
        assert.strictEqual(committed.log, null);

        // Success commits everything
        shouldFailLog = false;
        const done = await bookingService.completeJob({ jobId: 'leg-job-1', clientMutationId: 'mut-leg-1', actor: 'staff' });
        assert.strictEqual(done.idempotent, false);
        assert.ok(done.serviceLog && done.serviceLog.id === 'log-leg-1');
        assert.strictEqual(committed.status, 'completed');
        assert.strictEqual(committed.redeemCount, 1);

        // Replay with matching clientMutationId
        const replay = await bookingService.completeJob({ jobId: 'leg-job-1', clientMutationId: 'mut-leg-1', actor: 'staff' });
        assert.strictEqual(replay.idempotent, true);
        assert.strictEqual(committed.redeemCount, 1);

        // Reject without clientMutationId
        await assert.rejects(
          () => bookingService.completeJob({ jobId: 'leg-job-1', actor: 'staff' }),
          /Cannot complete job in completed status/
        );
      });
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
    }
  });

  await runTest('F2: bookingService.cancelBooking & failJob use db.withTransaction + findByIdForUpdate in Neon mode', async () => {
    let lockCalls = 0;
    let cancelClientSeen = null;
    let failClientSeen = null;
    const txClient = { query: async () => ({ rows: [] }) };
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      await withMocks([
        [db, 'isConfigured', () => true],
        [db, 'withTransaction', async (cb) => cb(txClient)],
        [repos.serviceJobs, 'findByIdForUpdate', async (id) => {
          lockCalls += 1;
          return { id, status: 'assigned', service_payload: {} };
        }],
        [repos.seeOperations, 'findJobAddons', async () => []],
        [repos.seeOperations, 'findSolarVerificationByJob', async () => null],
        [repos.serviceJobs, 'cancelJob', async (id, _opts, client) => {
          cancelClientSeen = client;
          return { id, status: 'cancelled' };
        }],
        [repos.serviceJobs, 'failJob', async (id, _opts, client) => {
          failClientSeen = client;
          return { id, status: 'unable_to_complete' };
        }]
      ], async () => {
        const c = await bookingService.cancelBooking({ jobId: 'leg-c1', reason: 'Test' });
        assert.strictEqual(c.status, 'cancelled');
        assert.strictEqual(cancelClientSeen, txClient);

        const f = await bookingService.failJob({ jobId: 'leg-f1', reason: 'Test' });
        assert.strictEqual(f.status, 'unable_to_complete');
        assert.strictEqual(failClientSeen, txClient);
        assert.strictEqual(lockCalls, 2);
      });
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
    }
  });

  // -------------------------------------------------------------------------
  // 7. F6 (R4): isSeeManagedJob & Cross-Engine Mutual Guards
  // -------------------------------------------------------------------------
  await runTest('F6 (R4): isSeeManagedJob ignores service_id and detects canonical SEE markers', async () => {
    // Legacy job with auto-populated service_id MUST NOT be classified as SEE
    assert.strictEqual(seeExecutionService.isSeeManagedJob({ id: 'j1', service_id: 'svc-auto', service_payload: {} }), false);

    assert.strictEqual(seeExecutionService.isSeeManagedJob({ id: 'j2', service_payload: { _seeManaged: true } }), true);
    assert.strictEqual(seeExecutionService.isSeeManagedJob({ id: 'j3', service_payload: JSON.stringify({ _seeManaged: true }) }), true);
    assert.strictEqual(seeExecutionService.isSeeManagedJob({ id: 'j4', entitlement_account_id: 'ea-1' }), true);
    assert.strictEqual(seeExecutionService.isSeeManagedJob({ id: 'j5', purchase_snapshot_id: 'ps-1' }), true);
    assert.strictEqual(seeExecutionService.isSeeManagedJob({ id: 'j6' }, { hasAddons: true }), true);
    assert.strictEqual(seeExecutionService.isSeeManagedJob({ id: 'j7' }, { hasSolar: true }), true);
    assert.strictEqual(seeExecutionService.isSeeManagedJob({ id: 'j8', hasAddons: true }), true);
    assert.strictEqual(seeExecutionService.isSeeManagedJob({ id: 'j9', has_addons: true }), true);
    assert.strictEqual(seeExecutionService.isSeeManagedJob({ id: 'j10', hasSolar: true }), true);
    assert.strictEqual(seeExecutionService.isSeeManagedJob({ id: 'j11', has_solar: true }), true);
  });

  await runTest('F6 (R4): seeExecutionService rejects non-SEE legacy jobs across assign, start, complete, terminate', async () => {
    const legacyJob = {
      id: 'legacy-with-svc-id',
      status: 'assigned',
      service_id: 'svc-auto-populated',
      service_payload: {}
    };

    await withMocks([
      [db, 'withTransaction', async (cb) => cb({ query: async () => ({ rows: [] }) })],
      [repos.serviceJobs, 'findByIdForUpdate', async () => legacyJob],
      [repos.seeOperations, 'findJobAddons', async () => []],
      [repos.seeOperations, 'findSolarVerificationByJob', async () => null]
    ], async () => {
      await assert.rejects(
        () => seeExecutionService.assignJob(legacyJob.id, 'staff-1'),
        /not a canonical SEE-managed job/
      );
      await assert.rejects(
        () => seeExecutionService.startExecution(legacyJob.id, 'staff-1'),
        /not a canonical SEE-managed job/
      );
      await assert.rejects(
        () => seeExecutionService.completeExecution(legacyJob.id, { staffId: 'staff-1' }),
        /not a canonical SEE-managed job/
      );
      await assert.rejects(
        () => seeExecutionService.terminateJobWithoutCompletion(legacyJob.id, 'cancelled', { reason: 'test' }),
        /not a canonical SEE-managed job/
      );
    });
  });

  await runTest('F6 (R4): bookingService blocks SEE entitlement bookings and rejects SEE jobs in start/complete/cancel/fail', async () => {
    // createBooking rejects entitlementAccountId & purchaseSnapshotId
    await assert.rejects(
      () => bookingService.createBooking({
        customerId: 'cust-1',
        serviceCategory: 'car_washing',
        serviceType: 'Wash',
        entitlementAccountId: 'ea-1'
      }),
      /seeExecutionService\.createCanonicalJob/
    );
    await assert.rejects(
      () => bookingService.createBooking({
        customerId: 'cust-1',
        serviceCategory: 'car_washing',
        serviceType: 'Wash',
        purchaseSnapshotId: 'ps-1'
      }),
      /seeExecutionService\.createCanonicalJob/
    );

    // Neon mode: SEE job detected via entitlement_account_id or hasAddons is rejected without invoking packageService/seeEntitlementService
    let seeMutateCalled = false;
    let pkgRedeemCalled = false;
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      await withMocks([
        [db, 'isConfigured', () => true],
        [db, 'withTransaction', async (cb) => cb({ query: async () => ({ rows: [] }) })],
        [repos.serviceJobs, 'findByIdForUpdate', async () => ({
          id: 'see-job-1',
          status: 'in_progress',
          entitlement_account_id: 'ea-1',
          service_payload: { _seeManaged: true }
        })],
        [repos.seeOperations, 'findJobAddons', async () => []],
        [repos.seeOperations, 'findSolarVerificationByJob', async () => null],
        [seeEntitlementService, 'mutateEntitlement', async () => { seeMutateCalled = true; }],
        [packageService, 'redeemPackage', async () => { pkgRedeemCalled = true; }]
      ], async () => {
        await assert.rejects(() => bookingService.startJob({ jobId: 'see-job-1' }), /canonical SEE-managed job/);
        await assert.rejects(() => bookingService.completeJob({ jobId: 'see-job-1' }), /canonical SEE-managed job/);
        await assert.rejects(() => bookingService.cancelBooking({ jobId: 'see-job-1' }), /canonical SEE-managed job/);
        await assert.rejects(() => bookingService.failJob({ jobId: 'see-job-1' }), /canonical SEE-managed job/);
        assert.strictEqual(seeMutateCalled, false);
        assert.strictEqual(pkgRedeemCalled, false);
      });
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
    }

    // Local mode: bookingService also guards SEE jobs and supports local idempotency
    bookingService.__resetLocalStore();
    const createdLocal = await bookingService.createBooking({
      customerId: 'cust-local-1',
      serviceCategory: 'car_wash',
      serviceType: 'Legacy Foam Wash'
    });
    await bookingService.startJob({ jobId: createdLocal.id });
    const comp1 = await bookingService.completeJob({ jobId: createdLocal.id, clientMutationId: 'local-mut-1' });
    assert.strictEqual(comp1.status, 'completed');
    const compReplay = await bookingService.completeJob({ jobId: createdLocal.id, clientMutationId: '  local-mut-1  ' });
    assert.strictEqual(compReplay.idempotent, true);
    await assert.rejects(
      () => bookingService.completeJob({ jobId: createdLocal.id }),
      /Cannot complete job in completed status/
    );

    // Local mode: cross-job clientMutationId reuse MUST be rejected
    const secondLocal = await bookingService.createBooking({
      customerId: 'cust-local-1',
      serviceCategory: 'car_wash',
      serviceType: 'Legacy Foam Wash 2'
    });
    await bookingService.startJob({ jobId: secondLocal.id });
    await assert.rejects(
      () => bookingService.completeJob({ jobId: secondLocal.id, clientMutationId: 'local-mut-1' }),
      /already been used for another job/
    );

    // Local mode: hasAddons / hasSolar markers on jobs must reject across start/complete/cancel/fail
    for (const marker of [
      { hasAddons: true },
      { has_addons: true },
      { hasSolar: true },
      { has_solar: true }
    ]) {
      const seeLocal = await bookingService.createBooking({
        customerId: 'cust-local-2',
        serviceCategory: 'car_wash',
        serviceType: 'SEE Marked Local Job'
      });
      Object.assign(seeLocal.job, marker);
      await assert.rejects(() => bookingService.startJob({ jobId: seeLocal.id }), /canonical SEE-managed job/);
      await assert.rejects(() => bookingService.completeJob({ jobId: seeLocal.id }), /canonical SEE-managed job/);
      await assert.rejects(() => bookingService.cancelBooking({ jobId: seeLocal.id }), /canonical SEE-managed job/);
      await assert.rejects(() => bookingService.failJob({ jobId: seeLocal.id }), /canonical SEE-managed job/);
    }
  });

  await runTest('F6 (R4): bookingService.createBooking cleanly rejects non-UUID packageId without querying seeEntitlement UUID column', async () => {
    let findAccountCalled = false;
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      await withMocks([
        [db, 'isConfigured', () => true],
        [packageService, 'getCustomerPackages', async () => []],
        [repos.seeEntitlement, 'findAccountById', async () => {
          findAccountCalled = true;
          return null;
        }]
      ], async () => {
        await assert.rejects(
          () => bookingService.createBooking({
            customerId: 'cust-1',
            serviceCategory: 'car_washing',
            serviceType: 'Wash',
            packageId: 'not-a-uuid-pkg'
          }),
          /Package 'not-a-uuid-pkg' does not belong to this customer or does not exist/
        );
        assert.strictEqual(findAccountCalled, false, 'Must not pass non-UUID packageId to findAccountById');
      });
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
    }
  });

  console.log(`\n===============================================================`);
  console.log(`M1 QA SUMMARY: ${passed} passed, ${failed} failed`);
  console.log(`===============================================================`);
  process.exit(failed > 0 ? 1 : 0);
})();
