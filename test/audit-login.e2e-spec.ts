import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module';

interface ApiResponse<T> {
  success: boolean;
  code: string;
  message: string;
  data: T | null;
}

interface LoginData {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; passwordHash?: string };
}

describe('Audit Login (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  const testEmail = `audit-login-${Date.now()}@example.com`;
  const testPassword = 'AuditTest123!';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix(process.env.API_PREFIX ?? 'api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
    dataSource = app.get(DataSource);

    // Create a test user for login
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        nom: 'Audit',
        prenom: 'Login',
        email: testEmail,
        password: testPassword,
      })
      .expect(201);
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/login with audit', () => {
    it('should login successfully and create an audit log', async () => {
      // 1. Verify no open transaction before login
      const beforeCount = await dataSource.query(
        `SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'idle in transaction'`,
      );
      expect(beforeCount[0].count).toBe('0');

      // 2. Perform login
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testEmail,
          password: testPassword,
        })
        .expect(200);

      // 3. Verify login succeeded
      const body = response.body as ApiResponse<LoginData>;
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('accessToken');
      expect(body.data).toHaveProperty('refreshToken');
      expect(body.data).toHaveProperty('user');
      expect(body.data.user.email).toBe(testEmail);

      // 4. Verify audit log was created
      const auditLogs = await dataSource.query(
        `SELECT * FROM audit_logs WHERE user_email = $1 AND action = $2 ORDER BY created_at DESC LIMIT 1`,
        [testEmail, 'LOGIN'],
      );
      expect(auditLogs.length).toBe(1);
      expect(auditLogs[0].action).toBe('LOGIN');
      expect(auditLogs[0].entity_type).toBe('Auth');
      expect(auditLogs[0].user_email).toBe(testEmail);

      // 5. Verify no open transaction after login
      const afterCount = await dataSource.query(
        `SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'idle in transaction'`,
      );
      expect(afterCount[0].count).toBe('0');
    });

    it('should not leave open transaction when audit fails', async () => {
      // Temporarily rename audit_logs table to simulate audit failure
      await dataSource.query(`ALTER TABLE audit_logs RENAME TO audit_logs_backup`);

      try {
        // Attempt login - should still succeed even if audit fails
        const response = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({
            email: testEmail,
            password: testPassword,
          });

        // Login should succeed (audit failure should not block login)
        expect(response.status).toBe(200);

        // Verify no open transaction remains
        const afterCount = await dataSource.query(
          `SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'idle in transaction'`,
        );
        expect(afterCount[0].count).toBe('0');
      } finally {
        // Restore audit_logs table
        await dataSource.query(`ALTER TABLE audit_logs_backup RENAME TO audit_logs`);
      }
    });

    it('should handle failed login without leaving open transaction', async () => {
      // Attempt login with wrong password
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testEmail,
          password: 'WrongPassword123!',
        })
        .expect(401);

      expect(response.body.success).toBe(false);

      // Verify no open transaction after failed login
      const afterCount = await dataSource.query(
        `SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'idle in transaction'`,
      );
      expect(afterCount[0].count).toBe('0');
    });
  });
});
