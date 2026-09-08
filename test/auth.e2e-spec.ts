import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

interface ApiResponse<T> {
  success: boolean;
  code: string;
  message: string;
  data: T | null;
}

interface RegisterData {
  id: string;
  email: string;
  passwordHash?: string;
}

interface LoginData {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; passwordHash?: string };
}

interface MeData {
  id: string;
  email: string;
  passwordHash?: string;
}

interface RefreshData {
  accessToken: string;
}

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;

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
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('should register a new user', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          nom: 'Test',
          prenom: 'User',
          email: `test-${Date.now()}@example.com`,
          password: 'TestPass123!',
        })
        .expect(201)
        .expect((res) => {
          const body = res.body as ApiResponse<RegisterData>;
          expect(body.success).toBe(true);
          expect(body.data).toHaveProperty('id');
          expect(body.data).toHaveProperty('email');
          expect(body.data).not.toHaveProperty('passwordHash');
        });
    });

    it('should reject duplicate email', async () => {
      const email = `dup-${Date.now()}@example.com`;
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ nom: 'A', prenom: 'B', email, password: 'TestPass123!' })
        .expect(201);

      return request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ nom: 'C', prenom: 'D', email, password: 'TestPass123!' })
        .expect(409);
    });

    it('should reject invalid email', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          nom: 'A',
          prenom: 'B',
          email: 'not-an-email',
          password: 'TestPass123!',
        })
        .expect(400);
    });

    it('should reject short password', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          nom: 'A',
          prenom: 'B',
          email: 'short@example.com',
          password: '123',
        })
        .expect(400);
    });
  });

  describe('POST /auth/login', () => {
    const testEmail = `login-${Date.now()}@example.com`;
    const testPassword = 'LoginTest123!';

    beforeAll(async () => {
      await request(app.getHttpServer()).post('/api/v1/auth/register').send({
        nom: 'Login',
        prenom: 'Test',
        email: testEmail,
        password: testPassword,
      });
    });

    it('should login with valid credentials', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: testEmail, password: testPassword })
        .expect(200)
        .expect((res) => {
          const body = res.body as ApiResponse<LoginData>;
          expect(body.success).toBe(true);
          expect(body.data).toHaveProperty('accessToken');
          expect(body.data).toHaveProperty('refreshToken');
          expect(body.data).toHaveProperty('user');
          expect(body.data.user).not.toHaveProperty('passwordHash');
        });
    });

    it('should reject invalid password', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: testEmail, password: 'WrongPassword!' })
        .expect(401);
    });

    it('should reject non-existent email', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'nonexistent@example.com', password: 'TestPass123!' })
        .expect(401);
    });
  });

  describe('GET /auth/me', () => {
    const testEmail = `me-${Date.now()}@example.com`;
    const testPassword = 'MeTest123!';
    let accessToken: string;

    beforeAll(async () => {
      await request(app.getHttpServer()).post('/api/v1/auth/register').send({
        nom: 'Me',
        prenom: 'Test',
        email: testEmail,
        password: testPassword,
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: testEmail, password: testPassword });

      const body = res.body as ApiResponse<LoginData>;
      accessToken = body.data.accessToken;
    });

    it('should return current user with valid token', () => {
      return request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          const body = res.body as ApiResponse<MeData>;
          expect(body.success).toBe(true);
          expect(body.data).toHaveProperty('id');
          expect(body.data.email).toBe(testEmail);
          expect(body.data).not.toHaveProperty('passwordHash');
        });
    });

    it('should reject request without token', () => {
      return request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    });

    it('should reject request with invalid token', () => {
      return request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });

  describe('POST /auth/refresh', () => {
    const testEmail = `refresh-${Date.now()}@example.com`;
    const testPassword = 'RefreshTest123!';
    let refreshToken: string;

    beforeAll(async () => {
      await request(app.getHttpServer()).post('/api/v1/auth/register').send({
        nom: 'Refresh',
        prenom: 'Test',
        email: testEmail,
        password: testPassword,
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: testEmail, password: testPassword });

      const body = res.body as ApiResponse<LoginData>;
      refreshToken = body.data.refreshToken;
    });

    it('should refresh access token', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200)
        .expect((res) => {
          const body = res.body as ApiResponse<RefreshData>;
          expect(body.success).toBe(true);
          expect(body.data).toHaveProperty('accessToken');
        });
    });

    it('should reject invalid refresh token', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'invalid-refresh-token' })
        .expect(401);
    });
  });
});
