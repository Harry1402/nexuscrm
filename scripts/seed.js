/**
 * Database Seed Script
 * Pre-populates initial roles, permissions, or system metadata securely.
 */

async function runSeed() {
  console.log('Running database seed script...');
  // Seed logic here
  console.log('Seeding completed.');
}

runSeed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
