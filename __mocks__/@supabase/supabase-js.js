// Mock manuel de @supabase/supabase-js
// Empêche Jest de parser le module ESM réel.
const createClient = jest.fn();

module.exports = { createClient };