/**
 * Signature verification for skill files.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';

export interface VerificationResult {
  valid: boolean;
  signed: boolean;
  signer?: string;
  error?: string;
}

export class SkillVerifier {
  private trustedKeys: Map<string, string> = new Map();

  addTrustedKey(name: string, publicKeyPem: string): void {
    this.trustedKeys.set(name, publicKeyPem);
  }

  /**
   * Verify a skill file's signature.
   * Signature is expected in the YAML's `skill.signature` field as base64-encoded Ed25519 sig.
   */
  verify(filePath: string, signature?: string): VerificationResult {
    if (!signature) {
      return { valid: false, signed: false, error: 'No signature provided' };
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    // Strip the signature field itself before verifying
    const contentWithoutSig = content.replace(/^\s*signature:.*$/m, '');

    for (const [name, pubKey] of this.trustedKeys) {
      try {
        const verify = crypto.createVerify('SHA256');
        verify.update(contentWithoutSig);
        verify.end();

        const isValid = verify.verify(pubKey, Buffer.from(signature, 'base64'));
        if (isValid) {
          return { valid: true, signed: true, signer: name };
        }
      } catch {
        continue;
      }
    }

    return { valid: false, signed: true, error: 'Signature does not match any trusted key' };
  }

  /**
   * Sign a skill file with a private key.
   */
  sign(filePath: string, privateKeyPem: string): string {
    const content = fs.readFileSync(filePath, 'utf-8');
    const sign = crypto.createSign('SHA256');
    sign.update(content);
    sign.end();
    return sign.sign(privateKeyPem, 'base64');
  }
}
