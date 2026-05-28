import { PrismaClient } from '@prisma/client';

/**
 * Single PrismaClient instance for the process. Prisma is intentionally a
 * heavy-weight resource (manages its own connection pool), so we avoid
 * re-creating it per request.
 */
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

// Graceful shutdown — Prisma docs recommend this for production deployments.
async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}
process.on('beforeExit', () => {
  void disconnect();
});
