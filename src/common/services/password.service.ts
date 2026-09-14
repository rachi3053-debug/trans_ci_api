import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as argon2 from 'argon2';

/**
 * Service de hachage / vérification des mots de passe.
 * - Nouveaux comptes : Argon2id (albums recommandés).
 * - Comptes hérités : bcrypt (migration transparente lors du prochain changement de mot de passe).
 * - La vérification détecte automatiquement le format.
 */
@Injectable()
export class PasswordService {
  async hash(plain: string): Promise<string> {
    return argon2.hash(plain, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    if (hash.startsWith('$argon2')) {
      return argon2.verify(hash, plain);
    }
    return bcrypt.compare(plain, hash);
  }
}
