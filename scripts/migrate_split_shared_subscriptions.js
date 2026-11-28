/**
 * Migration Script: Split Shared Multi-Car Subscriptions
 * 
 * Ensures that each vehicle enrolled in Daily Car Cleaning has its own
 * dedicated subscription record, enabling independent staff assignment,
 * route sequencing, and plan management.
 */

const fs = require('fs');
const path = require('path');

// Load environment variables from .env
if (fs.existsSync(path.resolve('.env'))) {
  const envContent = fs.readFileSync(path.resolve('.env'), 'utf8');
  for (const line of envContent.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf('=');
    if (idx > 0) {
      let val = t.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[t.slice(0, idx).trim()]) {
        process.env[t.slice(0, idx).trim()] = val;
      }
    }
  }
}

const db = require('../db');

async function runSplitMigration() {
  console.log('[Migration] Starting split of shared multi-vehicle subscriptions...');

  const sharedQuery = `
    SELECT sv.subscription_id, count(sv.id) as veh_count, 
           array_agg(sv.vehicle_id) as vehicle_ids,
           sub.customer_id, c.name as customer_name, sub.package_name
    FROM public.subscription_vehicles sv
    JOIN public.subscriptions sub ON sv.subscription_id = sub.id
    JOIN public.customers c ON sub.customer_id = c.id
    WHERE sub.deleted_at IS NULL
    GROUP BY sv.subscription_id, sub.customer_id, c.name, sub.package_name
    HAVING count(sv.id) > 1
  `;

  const { rows: sharedSubs } = await db.query(sharedQuery);
  console.log(`[Migration] Found ${sharedSubs.length} shared subscriptions to process.`);

  if (sharedSubs.length === 0) {
    console.log('[Migration] No shared subscriptions found. All subscriptions are already 1:1 per vehicle!');
    return;
  }

  let splitVehiclesCount = 0;

  for (const shared of sharedSubs) {
    console.log(`\n[Migration] Processing customer: ${shared.customer_name} (${shared.customer_id})`);
    console.log(`  Original Sub ID: ${shared.subscription_id} has ${shared.veh_count} vehicles.`);

    // Fetch existing subscription details
    const origSubRes = await db.query('SELECT * FROM public.subscriptions WHERE id = $1', [shared.subscription_id]);
    const origSub = origSubRes.rows[0];
    if (!origSub) continue;

    // Fetch active staff assignment for the original sub (if any)
    const saRes = await db.query(
      'SELECT * FROM public.staff_assignments WHERE subscription_id = $1 AND is_active = TRUE LIMIT 1',
      [origSub.id]
    );
    const activeSa = saRes.rows[0] || null;

    // Fetch staff route sequence (if any)
    const srsRes = await db.query(
      'SELECT * FROM public.staff_route_sequences WHERE subscription_id = $1',
      [origSub.id]
    );
    const activeSrs = srsRes.rows;

    // Vehicle 0 stays on origSub. Vehicle 1..N get new subscriptions
    for (let i = 1; i < shared.vehicle_ids.length; i++) {
      const vId = shared.vehicle_ids[i];
      await db.withTransaction(async (client) => {
        // 1. Create new subscription
        const newSubRes = await client.query(
          `INSERT INTO public.subscriptions (
             customer_id, service_category_id, package_name, packages_purchased,
             rotation_type, rotation_notes, status, start_date, end_date
           ) VALUES ($1, $2, $3, 1, $4, $5, $6, $7, $8)
           RETURNING *`,
          [
            origSub.customer_id,
            origSub.service_category_id || 'daily_car_cleaning',
            origSub.package_name || 'Daily Clean',
            origSub.rotation_type || 'none',
            origSub.rotation_notes || null,
            origSub.status || 'active',
            origSub.start_date || new Date(),
            origSub.end_date || null
          ]
        );
        const newSub = newSubRes.rows[0];

        // 2. Re-point subscription_vehicles to new subscription
        await client.query(
          'UPDATE public.subscription_vehicles SET subscription_id = $1 WHERE subscription_id = $2 AND vehicle_id = $3',
          [newSub.id, origSub.id, vId]
        );

        // 3. Clone staff assignment if original was assigned
        if (activeSa) {
          await client.query(
            `INSERT INTO public.staff_assignments (
               staff_id, subscription_id, job_id, assigned_by, is_active
             ) VALUES ($1, $2, NULL, $3, TRUE)`,
            [activeSa.staff_id, newSub.id, 'split_migration']
          );
        }

        // 4. Clone staff route sequence if present
        if (activeSrs.length > 0) {
          for (const srs of activeSrs) {
            const maxSeqRes = await client.query(
              'SELECT COALESCE(MAX(sequence_order), 0) AS max_seq FROM public.staff_route_sequences WHERE staff_id = $1',
              [srs.staff_id]
            );
            const nextSeq = (parseInt(maxSeqRes.rows[0]?.max_seq, 10) || 0) + 1;
            await client.query(
              `INSERT INTO public.staff_route_sequences (
                 staff_id, subscription_id, sequence_order, updated_by
               ) VALUES ($1, $2, $3, 'split_migration')`,
              [srs.staff_id, newSub.id, nextSeq]
            );
          }
        }

        // 5. Update route_stops if any
        await client.query(
          'UPDATE public.route_stops SET subscription_id = $1 WHERE subscription_id = $2 AND vehicle_id = $3',
          [newSub.id, origSub.id, vId]
        );

        // 6. Update service_logs if any
        await client.query(
          'UPDATE public.service_logs SET subscription_id = $1 WHERE subscription_id = $2 AND vehicle_id = $3',
          [newSub.id, origSub.id, vId]
        );

        splitVehiclesCount++;
        console.log(`  -> Vehicle ${vId} moved to new subscription ${newSub.id} (Staff: ${activeSa?.staff_id || 'unassigned'})`);
      });
    }
  }

  console.log(`\n[Migration] Successfully completed! Split ${splitVehiclesCount} vehicles into independent subscriptions.`);
}

runSplitMigration()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[Migration] Failed:', err);
    process.exit(1);
  });
