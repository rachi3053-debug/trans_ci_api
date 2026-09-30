import { ActivationService } from './activation.service';
import { User, UserStatus } from '../users/entities/user.entity';
import { UserActivationToken } from '../users/entities/user-activation-token.entity';

describe('ActivationService', () => {
  let service: ActivationService;

  const pendingToken = (
    overrides: Partial<UserActivationToken> = {},
  ): UserActivationToken =>
    ({
      id: 'token-uuid',
      userId: 'user-uuid',
      tokenHash: 'h'.repeat(64),
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
      usedAt: null,
      createdBy: 'actor-1',
      createdAt: new Date(),
      ...overrides,
    }) as UserActivationToken;

  const invitedUser = (): User =>
    ({
      id: 'user-uuid',
      nom: 'Dupont',
      prenom: 'Jean',
      email: 'jean.dupont@example.com',
      tenantId: null,
      status: UserStatus.INVITED,
      actif: false,
      passwordHash: null,
    }) as User;

  // Chaîne de QueryBuilder simulée
  const queryResult = { raw: [{ id: 'token-uuid' }] };
  const returningStep = { execute: jest.fn(async () => queryResult) };
  const chain: Record<string, jest.Mock> = {
    update: jest.fn(() => chain),
    set: jest.fn(() => chain),
    where: jest.fn(() => chain),
    andWhere: jest.fn(() => chain),
    returning: jest.fn(() => returningStep),
    execute: jest.fn(async () => ({ raw: [] })),
    getOne: jest.fn(),
  };

  const tokenRepo = {
    createQueryBuilder: jest.fn(() => chain),
    save: jest.fn(async (e: Partial<UserActivationToken>) => ({
      ...e,
      id: 'token-uuid',
    })),
    create: jest.fn((e: Partial<UserActivationToken>) => e),
    findOne: jest.fn(),
    update: jest.fn(async () => ({ affected: 1 })),
  };
  const userRepo = {
    findOneBy: jest.fn(),
    save: jest.fn(async (u: Partial<User>) => u),
    manager: { transaction: jest.fn() },
  };
  const emailService = {
    sendInvitation: jest.fn(async () => undefined),
    sendPasswordReset: jest.fn(async () => undefined),
  };
  const config = {
    get: jest.fn((key: string, fallback: unknown) => {
      const map: Record<string, number | string> = {
        USER_INVITATION_EXPIRES_IN_HOURS: 24,
        USER_INVITATION_RESEND_COOLDOWN_SECONDS: 60,
        FRONTEND_URL: 'http://localhost:4200',
      };
      void fallback;
      return map[key] ?? fallback;
    }),
  };
  const messageService = {
    throwBusiness: jest.fn(() => {
      throw new Error('BUSINESS_EXCEPTION');
    }),
  };
  const passwordService = {
    hash: jest.fn(async (p: string) => `argon2-${p}`),
  };
  const auditService = { log: jest.fn(async () => ({})) };
  const tenantContext = { userId: 'actor-1' };

  beforeEach(() => {
    jest.clearAllMocks();
    tokenRepo.createQueryBuilder.mockReturnValue(chain);
    returningStep.execute.mockResolvedValue(queryResult);
    service = new ActivationService(
      tokenRepo as never,
      userRepo as never,
      emailService as never,
      config as never,
      messageService as never,
      passwordService as never,
      auditService as never,
      tenantContext as never,
    );
  });

  describe('hashToken', () => {
    it('est déterministe et produit 64 caractères hexadécimaux', () => {
      const a = service.hashToken('abc');
      const b = service.hashToken('abc');
      expect(a).toBe(b);
      expect(a).toMatch(/^[0-9a-f]{64}$/);
      expect(a).not.toContain('abc');
    });
  });

  describe('issueActivationToken', () => {
    it('stocke le SHA-256 et ne renvoie que le jeton brut', async () => {
      tokenRepo.save.mockImplementation(
        async (e: Partial<UserActivationToken>) => e,
      );

      const result = await service.issueActivationToken('user-uuid');

      expect(result.rawToken).toMatch(/^[0-9a-f]{64}$/);
      const saved = tokenRepo.save.mock.calls[0][0];
      expect(saved.tokenHash).toBe(service.hashToken(result.rawToken));
      expect(saved.tokenHash).not.toBe(result.rawToken);
      expect(saved.userId).toBe('user-uuid');
      expect(saved.expiresAt.getTime() - Date.now()).toBeGreaterThan(
        23 * 3600 * 1000,
      );
      expect(chain.execute).toHaveBeenCalled(); // révocation des jetons précédents
    });
  });

  describe('sendInvitationEmail', () => {
    it("construit le lien d'activation et envoie le mail", async () => {
      await service.sendInvitationEmail({
        to: 'jean.dupont@example.com',
        recipientName: 'Jean Dupont',
        rawToken: 'raw-token',
        expiresAt: new Date(),
        resend: false,
      });

      expect(emailService.sendInvitation).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'jean.dupont@example.com',
          activationUrl: 'http://localhost:4200/auth/activate?token=raw-token',
        }),
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'USER_INVITATION_SENT',
          description: expect.stringContaining('jean.dupont@example.com'),
        }),
      );
    });

    it('ne journalise jamais le token brut (audit)', async () => {
      await service.sendInvitationEmail({
        to: 'jean.dupont@example.com',
        recipientName: 'Jean Dupont',
        rawToken: 'super-secret-raw-token',
        expiresAt: new Date(),
        resend: false,
      });

      const auditCalls = JSON.stringify(auditService.log.mock.calls);
      const emailCalls = JSON.stringify(emailService.sendInvitation.mock.calls);
      // Le token brut n'apparaît que dans l'URL de l'email, jamais dans l'audit.
      expect(auditCalls).not.toContain('super-secret-raw-token');
      expect(emailCalls).toContain('super-secret-raw-token');
    });
  });

  describe('validateToken', () => {
    it('valide un jeton valide pour un compte invité', async () => {
      chain.getOne.mockResolvedValue(pendingToken());
      userRepo.findOneBy.mockResolvedValue(invitedUser());

      const result = await service.validateToken('raw-token');
      expect(result).toEqual({
        valid: true,
        email: 'jean.dupont@example.com',
        expiresAt: expect.any(Date),
      });
    });

    it('rejette un jeton expiré', async () => {
      chain.getOne.mockResolvedValue(
        pendingToken({ expiresAt: new Date(Date.now() - 1000) }),
      );
      userRepo.findOneBy.mockResolvedValue(invitedUser());

      const result = await service.validateToken('raw-token');
      expect(result.valid).toBe(false);
    });

    it('rejette un jeton inconnu', async () => {
      chain.getOne.mockResolvedValue(null);
      const result = await service.validateToken('raw-token');
      expect(result.valid).toBe(false);
    });
  });

  describe('activate', () => {
    it('active le compte, fixe le mot de passe et consomme le jeton', async () => {
      chain.getOne.mockResolvedValue(pendingToken());
      userRepo.findOneBy.mockResolvedValue(invitedUser());

      const user = await service.activate('raw-token', 'NouveauMdp123!');

      expect(user.status).toBe(UserStatus.ACTIVE);
      expect(user.actif).toBe(true);
      expect(user.emailVerified).toBe(true);
      expect(passwordService.hash).toHaveBeenCalledWith('NouveauMdp123!');
      expect(user.passwordHash).toBe('argon2-NouveauMdp123!');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'USER_ACCOUNT_ACTIVATED' }),
      );
    });

    it('refuse un jeton inconnu', async () => {
      chain.getOne.mockResolvedValue(null);
      await expect(
        service.activate('raw-token', 'NouveauMdp123!'),
      ).rejects.toThrow('BUSINESS_EXCEPTION');
      expect(messageService.throwBusiness).toHaveBeenCalled();
    });

    it('consomme un jeton expiré et refuse', async () => {
      chain.getOne.mockResolvedValue(
        pendingToken({ expiresAt: new Date(Date.now() - 1000) }),
      );
      await expect(
        service.activate('raw-token', 'NouveauMdp123!'),
      ).rejects.toThrow('BUSINESS_EXCEPTION');
      expect(tokenRepo.update).toHaveBeenCalled(); // marquage consommé du jeton expiré
    });

    it("empêche le rejeu d'un jeton déjà consommé", async () => {
      chain.getOne.mockResolvedValue(pendingToken());
      userRepo.findOneBy.mockResolvedValue(invitedUser());
      returningStep.execute.mockResolvedValue({ raw: [] });

      await expect(
        service.activate('raw-token', 'NouveauMdp123!'),
      ).rejects.toThrow('BUSINESS_EXCEPTION');
      expect(userRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('resendInvitation', () => {
    it("renvoie une invitation et révoque l'ancien jeton", async () => {
      tokenRepo.findOne.mockResolvedValue(
        pendingToken({ createdAt: new Date(Date.now() - 5 * 60 * 1000) }),
      );
      tokenRepo.save.mockImplementation(
        async (e: Partial<UserActivationToken>) => e,
      );

      await service.resendInvitation(invitedUser());

      expect(chain.execute).toHaveBeenCalled(); // révocation de l'ancien jeton
      expect(emailService.sendInvitation).toHaveBeenCalledWith(
        expect.objectContaining({ resend: true }),
      );
    });

    it('respecte le cooldown entre deux envois', async () => {
      tokenRepo.findOne.mockResolvedValue(pendingToken());
      await expect(service.resendInvitation(invitedUser())).rejects.toThrow(
        'BUSINESS_EXCEPTION',
      );
      expect(emailService.sendInvitation).not.toHaveBeenCalled();
    });
  });

  describe('requestPasswordReset', () => {
    it("émet un jeton RESET et envoie l'email de réinitialisation", async () => {
      tokenRepo.save.mockImplementation(
        async (e: Partial<UserActivationToken>) => e,
      );
      const activeUser = { ...invitedUser(), status: UserStatus.ACTIVE };

      const result = await service.requestPasswordReset(activeUser);

      expect(result.rawToken).toMatch(/^[0-9a-f]{64}$/);
      const saved = tokenRepo.save.mock.calls[0][0];
      expect(saved.tokenHash).toBe(service.hashToken(result.rawToken));
      expect(emailService.sendPasswordReset).toHaveBeenCalledWith(
        expect.objectContaining({
          to: activeUser.email,
          resetUrl: expect.stringContaining('/auth/reset-password?token='),
        }),
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PASSWORD_RESET_REQUESTED',
        }),
      );
    });
  });

  describe('resetPassword', () => {
    it("réinitialise le mot de passe d'un compte actif", async () => {
      chain.getOne.mockResolvedValue(pendingToken());
      userRepo.findOneBy.mockResolvedValue({
        ...invitedUser(),
        status: UserStatus.ACTIVE,
        passwordHash: 'ancien-hash',
      });
      returningStep.execute.mockResolvedValue(queryResult);
      tokenRepo.save.mockImplementation(
        async (e: Partial<UserActivationToken>) => e,
      );
      userRepo.save.mockImplementation(async (u: Partial<User>) => u);

      const result = await service.resetPassword('raw-token', 'NouveauMdp123!');

      expect(userRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ passwordHash: 'argon2-NouveauMdp123!' }),
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PASSWORD_RESET_COMPLETED' }),
      );
      expect(result.status).toBe(UserStatus.ACTIVE);
    });

    it('refuse un jeton RESET non trouvé', async () => {
      chain.getOne.mockResolvedValue(null);
      await expect(
        service.resetPassword('unknown-token', 'NouveauMdp123!'),
      ).rejects.toThrow('BUSINESS_EXCEPTION');
      expect(userRepo.save).not.toHaveBeenCalled();
    });

    it('consomme un jeton RESET expiré et refuse', async () => {
      chain.getOne.mockResolvedValue(
        pendingToken({ expiresAt: new Date(Date.now() - 1000) }),
      );
      await expect(
        service.resetPassword('raw-token', 'NouveauMdp123!'),
      ).rejects.toThrow('BUSINESS_EXCEPTION');
      expect(tokenRepo.update).toHaveBeenCalled();
    });

    it('refuse pour un compte non actif', async () => {
      chain.getOne.mockResolvedValue(pendingToken());
      userRepo.findOneBy.mockResolvedValue(invitedUser());
      await expect(
        service.resetPassword('raw-token', 'NouveauMdp123!'),
      ).rejects.toThrow('BUSINESS_EXCEPTION');
      expect(userRepo.save).not.toHaveBeenCalled();
    });
  });
});
