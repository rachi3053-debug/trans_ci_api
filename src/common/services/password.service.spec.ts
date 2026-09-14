import { PasswordService } from './password.service';
import * as bcrypt from 'bcrypt';

describe('PasswordService', () => {
  let service: PasswordService;

  beforeEach(() => {
    service = new PasswordService();
  });

  describe('hash', () => {
    it('produit un hash Argon2id non réversible', async () => {
      const hash = await service.hash('MotDePasse123!');
      expect(hash).toMatch(/^\$argon2id\$/);
      expect(hash).not.toContain('MotDePasse123!');
    });

    it('produit des hash différents pour des mots de passe différents', async () => {
      const h1 = await service.hash('MotDePasse123!');
      const h2 = await service.hash('AutreMdp456!');
      expect(h1).not.toBe(h2);
    });
  });

  describe('verify', () => {
    it('accepte le bon mot de passe (argon2id)', async () => {
      const hash = await service.hash('MotDePasse123!');
      await expect(service.verify(hash, 'MotDePasse123!')).resolves.toBe(true);
    });

    it('refuse un mauvais mot de passe', async () => {
      const hash = await service.hash('MotDePasse123!');
      await expect(service.verify(hash, 'MauvaisPass1!')).resolves.toBe(false);
    });

    it('vérifie un hash bcrypt hérité (migration transparente)', async () => {
      const legacy = await bcrypt.hash('AncienMdp123!', 12);
      await expect(service.verify(legacy, 'AncienMdp123!')).resolves.toBe(true);
      await expect(service.verify(legacy, 'MauvaisPass1!')).resolves.toBe(
        false,
      );
    });

    it('refuse un hash vide (compte invité non activé)', async () => {
      await expect(service.verify('', 'QuoiQueCeSoit1')).resolves.toBe(false);
    });
  });
});
