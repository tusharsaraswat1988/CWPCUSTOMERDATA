/**
 * CWP Detailers & Motors - Job Applications Repository
 * Manages career / job recruitment submissions
 */

const db = require('../index');

async function createJobApplication(data, client = null) {
  const runner = client || db;
  const {
    name,
    mobile,
    age = null,
    gender = null,
    city = null,
    email = null,
    resumeUrl = null,
    resumeFilename = null,
    remark = null
  } = data;

  if (!name || !name.trim()) {
    throw new Error('Name is required');
  }
  if (!mobile || !mobile.trim()) {
    throw new Error('Mobile number is required');
  }

  const query = `
    INSERT INTO public.job_applications (
      name, mobile, age, gender, city, email,
      resume_url, resume_filename, remark, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'new')
    RETURNING *
  `;

  const values = [
    name.trim(),
    mobile.trim(),
    age ? parseInt(age, 10) || null : null,
    gender ? gender.trim() : null,
    city ? city.trim() : null,
    email ? email.trim().toLowerCase() : null,
    resumeUrl || null,
    resumeFilename || null,
    remark ? remark.trim() : null
  ];

  const res = await runner.query(query, values);
  return res.rows[0];
}

async function listJobApplications(options = {}, client = null) {
  const runner = client || db;
  const { status = null, limit = 100, offset = 0 } = options;
  const conditions = [];
  const params = [];

  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const query = `
    SELECT * FROM public.job_applications
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  const res = await runner.query(query, params);
  return res.rows;
}

async function updateJobApplicationStatus(id, status, adminNotes = null, client = null) {
  const runner = client || db;
  const query = `
    UPDATE public.job_applications
    SET status = $2,
        admin_notes = COALESCE($3, admin_notes),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *
  `;
  const res = await runner.query(query, [id, status, adminNotes]);
  return res.rows[0] || null;
}

module.exports = {
  createJobApplication,
  listJobApplications,
  updateJobApplicationStatus
};
