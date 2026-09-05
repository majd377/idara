// Vercel adapter. Important: the default local database remains SQLite,
// but Vercel's filesystem is ephemeral, so this adapter is intended for
// a hosted database configuration before using the deployment for real data.
module.exports = require('../server/index');
