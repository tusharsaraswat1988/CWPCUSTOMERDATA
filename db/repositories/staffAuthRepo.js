/**
 * Repository for table: staff_auth
 */
const db = require('../index');

async function findByStaffId(staffId, client = null) {
  const runner = client || db;
  const res = await runner.query(
    'SELECT * FROM public.staff_auth WHERE staff_id = $1 LIMIT 1',
    [staffId]
  );
  return res.rows[0] || null;
}

async function setPin(staffId, pinHash, salt, client = null, displayPin = null) {
  const runner = client || db;
  const res = await runner.query(
    `INSERT INTO public.staff_auth (staff_id, pin_hash, salt, display_pin, failed_attempts, locked_until, updated_at)
     VALUES ($1, $2, $3, $4, 0, NULL, CURRENT_TIMESTAMP)
     ON CONFLICT (staff_id) DO UPDATE
     SET pin_hash = EXCLUDED.pin_hash,
         salt = EXCLUDED.salt,
         display_pin = COALESCE(EXCLUDED.display_pin, public.staff_auth.display_pin),
         failed_attempts = 0,
         locked_until = NULL,
         updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [staffId, pinHash, salt, displayPin]
  );
  return res.rows[0];
}

async function recordFailedAttempt(staffId, maxAttempts = 5, lockDurationMinutes = 5, client = null) {
  const runner = client || db;
  const auth = await findByStaffId(staffId, runner);
  if (!auth) return null;

  const newAttempts = (auth.failed_attempts || 0) + 1;
  let lockedUntil = null;
  if (newAttempts >= maxAttempts) {
    lockedUntil = new Date(Date.now() + lockDurationMinutes * 60 * 1000);
  }

  const res = await runner.query(
    `UPDATE public.staff_auth
     SET failed_attempts = $2,
         locked_until = COALESCE($3, locked_until),
         updated_at = CURRENT_TIMESTAMP
     WHERE staff_id = $1
     RETURNING *`,
    [staffId, newAttempts, lockedUntil]
  );
  return res.rows[0];
}

async function recordSuccessfulLogin(staffId, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `UPDATE public.staff_auth
     SET failed_attempts = 0,
         locked_until = NULL,
         last_login_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE staff_id = $1
     RETURNING *`,
    [staffId]
  );
  return res.rows[0];
}

async function resetLockout(staffId, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `UPDATE public.staff_auth
     SET failed_attempts = 0,
         locked_until = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE staff_id = $1
     RETURNING *`,
    [staffId]
  );
  return res.rows[0];
}

module.exports = {
  findByStaffId,
  setPin,
  recordFailedAttempt,
  recordSuccessfulLogin,
  resetLockout
};
