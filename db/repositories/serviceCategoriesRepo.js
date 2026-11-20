/**
 * Repository for table: service_categories
 */
const db = require('../index');

async function findAll(client = null) {
  const runner = client || db;
  const res = await runner.query(
    'SELECT * FROM public.service_categories WHERE is_active = TRUE ORDER BY id ASC'
  );
  return res.rows;
}

async function findById(id, client = null) {
  const runner = client || db;
  const res = await runner.query(
    'SELECT * FROM public.service_categories WHERE id = $1 LIMIT 1',
    [id]
  );
  return res.rows[0] || null;
}

module.exports = {
  findAll,
  findById
};
