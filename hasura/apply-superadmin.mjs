#!/usr/bin/env node
/**
 * Setup role `super_admin` di Hasura MySimoka.
 *
 *   HASURA_ENDPOINT=https://hasura.mysimoka.sunhouse.co.id \
 *   HASURA_ADMIN_SECRET=xxx \
 *   node hasura/apply-superadmin.mjs [--apply] [--harden] [--grant-email=a@b.id]
 *
 * Tanpa --apply script hanya menampilkan rencana (dry-run), tidak mengubah apa pun.
 *
 *   --apply              jalankan perubahan (metadata di-backup dulu ke hasura/backups/).
 *   --harden             tutup celah: role non-super_admin tidak bisa membuat/mengubah/menghapus
 *                        role `super_admin` (auth.roles & auth.user_roles), dan kolom rahasia
 *                        auth.users (password_hash, token) disembunyikan dari semua role.
 *   --grant-email=EMAIL  buat baris auth.roles `super_admin` (bila belum ada) dan berikan ke user
 *                        dengan email tsb (is_default=false). Bisa diulang untuk beberapa email.
 *
 * Kolom permission diambil dari information_schema DB live, bukan dari snapshot metadata,
 * sehingga tetap benar walau skema sudah berubah sejak snapshot.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROLE = 'super_admin';

const TABLES = [
  ['public', 'schools'],
  ['public', 'school_memberships'],
  ['public', 'classes'],
  ['public', 'student_enrollments'],
  ['public', 'students'],
  ['public', 'academic_years'],
  ['public', 'grade_levels'],
  ['public', 'measurement_sessions'],
  ['public', 'student_measurement_records'],
  ['public', 'immunization_sessions'],
  ['public', 'student_immunization_records'],
  ['public', 'face_embeddings'],
  ['auth', 'users'],
  ['auth', 'roles'],
  ['auth', 'user_roles'],
];

// Kolom yang tidak boleh terbaca oleh role apa pun selain admin.
const SECRET_COLUMN = /(password|secret|token|hash)/i;

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const HARDEN = args.includes('--harden');
const GRANT_EMAILS = args
  .filter(arg => arg.startsWith('--grant-email='))
  .map(arg => arg.slice('--grant-email='.length).trim().toLowerCase())
  .filter(Boolean);

const endpoint = (process.env.HASURA_ENDPOINT ?? 'https://hasura.mysimoka.sunhouse.co.id').replace(/\/+$/, '');
const secret = process.env.HASURA_ADMIN_SECRET;
if (!secret) {
  console.error('HASURA_ADMIN_SECRET belum di-set.');
  process.exit(1);
}

async function call(path, body) {
  const response = await fetch(`${endpoint}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hasura-admin-secret': secret },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${path} ${response.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

const sqlLiteral = value => `'${String(value).replace(/'/g, "''")}'`;

async function runSql(source, sql, readOnly = true) {
  const result = await call('/v2/query', {
    type: 'run_sql',
    args: { source, sql, read_only: readOnly },
  });
  const [header, ...rows] = result.result ?? [];
  return rows.map(row => Object.fromEntries(header.map((key, index) => [key, row[index]])));
}

const and = (...parts) => {
  const filtered = parts.filter(part => part && Object.keys(part).length > 0);
  if (filtered.length === 0) return {};
  if (filtered.length === 1) return filtered[0];
  return { _and: filtered };
};

// ---------------------------------------------------------------------------

const exported = await call('/v1/metadata', { type: 'export_metadata', version: 2, args: {} });
const metadata = exported.metadata;
const source = metadata.sources[0];
const sourceName = source.name;
const tracked = new Map(source.tables.map(t => [`${t.table.schema}.${t.table.name}`, t]));

const columnRows = await runSql(
  sourceName,
  `SELECT table_schema, table_name, column_name, data_type, udt_name
     FROM information_schema.columns
    WHERE (table_schema, table_name) IN (${TABLES.map(([s, n]) => `(${sqlLiteral(s)}, ${sqlLiteral(n)})`).join(', ')})
    ORDER BY table_schema, table_name, ordinal_position`,
);
const columnsOf = key =>
  columnRows.filter(row => `${row.table_schema}.${row.table_name}` === key);

const ops = [];
const plan = [];

// 1) Select permission read-only lintas sekolah untuk super_admin.
for (const [schema, name] of TABLES) {
  const key = `${schema}.${name}`;
  const entry = tracked.get(key);
  if (!entry) {
    plan.push(`SKIP ${key}: tabel tidak di-track Hasura`);
    continue;
  }
  const columns = columnsOf(key)
    .filter(col => !SECRET_COLUMN.test(col.column_name))
    // vektor embedding wajah tidak perlu terbaca dari dashboard
    .filter(col => !(key === 'public.face_embeddings' && (col.udt_name === 'vector' || /embedding/i.test(col.column_name))))
    .map(col => col.column_name);
  if (columns.length === 0) {
    plan.push(`SKIP ${key}: kolom tidak ditemukan di information_schema`);
    continue;
  }
  const table = { schema, name };
  if ((entry.select_permissions ?? []).some(p => p.role === ROLE)) {
    ops.push({ type: 'pg_drop_select_permission', args: { source: sourceName, table, role: ROLE } });
  }
  ops.push({
    type: 'pg_create_select_permission',
    args: {
      source: sourceName,
      table,
      role: ROLE,
      permission: { columns, filter: {}, allow_aggregations: true },
    },
  });
  plan.push(`SELECT ${ROLE} ${key}: ${columns.length} kolom, tanpa filter, agregasi aktif`);
}

// 2) Hardening opsional.
if (HARDEN) {
  const guards = {
    'auth.roles': { code: { _neq: ROLE } },
  };
  const userRoles = tracked.get('auth.user_roles');
  const roleRel = (userRoles?.object_relationships ?? []).find(rel => {
    const fk = rel.using?.foreign_key_constraint_on;
    return fk === 'role_id' || (typeof fk === 'object' && fk?.column === 'role_id') ||
      rel.using?.manual_configuration?.column_mapping?.role_id;
  });
  if (roleRel) {
    guards['auth.user_roles'] = { [roleRel.name]: { code: { _neq: ROLE } } };
  } else {
    plan.push('HARDEN WARNING auth.user_roles: relationship ke auth.roles tidak ditemukan, tidak dijaga');
  }

  for (const [key, guard] of Object.entries(guards)) {
    const entry = tracked.get(key);
    if (!entry) continue;
    const table = entry.table;
    for (const perm of entry.insert_permissions ?? []) {
      if (perm.role === ROLE) continue;
      ops.push({ type: 'pg_drop_insert_permission', args: { source: sourceName, table, role: perm.role } });
      ops.push({
        type: 'pg_create_insert_permission',
        args: {
          source: sourceName, table, role: perm.role,
          permission: { ...perm.permission, check: and(perm.permission.check, guard) },
        },
      });
      plan.push(`HARDEN insert ${perm.role} ${key}: tolak ${ROLE}`);
    }
    for (const perm of entry.update_permissions ?? []) {
      if (perm.role === ROLE) continue;
      ops.push({ type: 'pg_drop_update_permission', args: { source: sourceName, table, role: perm.role } });
      ops.push({
        type: 'pg_create_update_permission',
        args: {
          source: sourceName, table, role: perm.role,
          permission: {
            ...perm.permission,
            filter: and(perm.permission.filter, guard),
            check: and(perm.permission.check, guard),
          },
        },
      });
      plan.push(`HARDEN update ${perm.role} ${key}: tolak ${ROLE}`);
    }
    for (const perm of entry.delete_permissions ?? []) {
      if (perm.role === ROLE) continue;
      ops.push({ type: 'pg_drop_delete_permission', args: { source: sourceName, table, role: perm.role } });
      ops.push({
        type: 'pg_create_delete_permission',
        args: {
          source: sourceName, table, role: perm.role,
          permission: { ...perm.permission, filter: and(perm.permission.filter, guard) },
        },
      });
      plan.push(`HARDEN delete ${perm.role} ${key}: tolak ${ROLE}`);
    }
  }

  // Sembunyikan kolom rahasia auth.users dari semua role (select/insert/update).
  const users = tracked.get('auth.users');
  for (const kind of ['select', 'insert', 'update']) {
    for (const perm of users?.[`${kind}_permissions`] ?? []) {
      if (perm.role === ROLE) continue;
      const cols = perm.permission.columns;
      if (!Array.isArray(cols)) {
        plan.push(`HARDEN WARNING ${kind} ${perm.role} auth.users: columns="*", tinjau manual`);
        continue;
      }
      const safe = cols.filter(col => !SECRET_COLUMN.test(col));
      // insert/update password_hash tetap dibutuhkan untuk membuat akun guru dari app.
      if (kind !== 'select' || safe.length === cols.length) continue;
      ops.push({ type: `pg_drop_${kind}_permission`, args: { source: sourceName, table: users.table, role: perm.role } });
      ops.push({
        type: `pg_create_${kind}_permission`,
        args: { source: sourceName, table: users.table, role: perm.role, permission: { ...perm.permission, columns: safe } },
      });
      plan.push(`HARDEN select ${perm.role} auth.users: sembunyikan ${cols.filter(c => SECRET_COLUMN.test(c)).join(', ')}`);
    }
  }
}

// 3) SQL untuk role & pemberian role ke user.
const roleColumns = columnsOf('auth.roles').map(c => c.column_name);
const userRoleColumns = columnsOf('auth.user_roles').map(c => c.column_name);
const sqlStatements = [];
if (GRANT_EMAILS.length > 0) {
  const roleValues = { code: ROLE, name: 'Super Admin', description: 'Akses baca lintas sekolah (dashboard admin)', is_system: true };
  const roleCols = Object.keys(roleValues).filter(col => roleColumns.includes(col));
  sqlStatements.push(
    `INSERT INTO auth.roles (${roleCols.join(', ')})
     SELECT ${roleCols.map(col => (typeof roleValues[col] === 'boolean' ? String(roleValues[col]) : sqlLiteral(roleValues[col]))).join(', ')}
     WHERE NOT EXISTS (SELECT 1 FROM auth.roles WHERE code = ${sqlLiteral(ROLE)});`,
  );
  const hasDefault = userRoleColumns.includes('is_default');
  for (const email of GRANT_EMAILS) {
    sqlStatements.push(
      `INSERT INTO auth.user_roles (user_id, role_id${hasDefault ? ', is_default' : ''})
       SELECT u.id, r.id${hasDefault ? ', false' : ''}
         FROM auth.users u JOIN auth.roles r ON r.code = ${sqlLiteral(ROLE)}
        WHERE lower(u.email) = ${sqlLiteral(email)}
          AND NOT EXISTS (SELECT 1 FROM auth.user_roles x WHERE x.user_id = u.id AND x.role_id = r.id);`,
    );
    plan.push(`GRANT ${ROLE} -> ${email}`);
  }
}

// ---------------------------------------------------------------------------

console.log(`Hasura: ${endpoint} (source: ${sourceName})`);
console.log(plan.map(line => `  - ${line}`).join('\n'));
console.log(`Total operasi metadata: ${ops.length}, SQL: ${sqlStatements.length}`);

if (!APPLY) {
  console.log('\nDry-run. Tambahkan --apply untuk menjalankan.');
  process.exit(0);
}

const here = dirname(fileURLToPath(import.meta.url));
const backupDir = join(here, 'backups');
mkdirSync(backupDir, { recursive: true });
const backupFile = join(backupDir, `metadata-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(backupFile, JSON.stringify(exported, null, 2));
console.log(`\nBackup metadata: ${backupFile}`);

if (GRANT_EMAILS.length > 0) {
  // Satu run_sql = satu transaksi.
  await runSql(sourceName, sqlStatements.join('\n'), false);
  const holders = await runSql(
    sourceName,
    `SELECT u.email FROM auth.user_roles ur
       JOIN auth.roles r ON r.id = ur.role_id JOIN auth.users u ON u.id = ur.user_id
      WHERE r.code = ${sqlLiteral(ROLE)} ORDER BY u.email`,
  );
  console.log(`Pemegang ${ROLE}: ${holders.map(h => h.email).join(', ') || '(belum ada — cek email)'}`);
}

if (ops.length > 0) {
  // bulk = atomik: gagal satu, batal semua. resource_version mencegah menimpa perubahan lain.
  await call('/v1/metadata', {
    type: 'bulk',
    resource_version: exported.resource_version,
    args: ops,
  });
  console.log('Metadata diperbarui.');
}

console.log(`\nRollback: POST ${endpoint}/v1/metadata {"type":"replace_metadata","version":2,"args":{"metadata": <isi "metadata" di file backup>}}`);
