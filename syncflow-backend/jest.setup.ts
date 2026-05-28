// Inject environment variables before src/config/env.ts is loaded by the test runner.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.JWT_ACCESS_SECRET = 'test_access_secret_at_least_thirty_two_chars_long_xx';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_at_least_thirty_two_chars_long_x';
process.env.JWT_ACCESS_TTL = '15m';
process.env.JWT_REFRESH_TTL = '7d';
process.env.BCRYPT_COST = '4'; // keep tests fast; production uses 10 (DSD §3.5.5)
