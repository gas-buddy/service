import { createKmsCryptoProvider, KmsCrypto } from '@gasbuddy/kms-crypto';
import { ConfigStore } from './types';

interface KmsWrapper extends Pick<KmsCrypto, 'decryptorInContext' | 'textDecryptorInContext'> {
  configureIfNecessary(store: ConfigStore): Promise<boolean>;
}

// When confit loads, we need configuration to know how to configure KMS decryption.
// So we "wrap" the real implementation and look for usage. If KMS is used, we recreate
// the configuration after setting up the real KMS implementation.
export async function getKmsWrapper(): Promise<KmsWrapper> {
  const kms = await createKmsCryptoProvider();
  let kmsWasUsed = false;
  let kmsIsReady = false;

  return {
    decryptorInContext: (context, returnOriginal) => (cipherText) => {
      if (kmsIsReady) {
        return kms.decryptorInContext(context, returnOriginal)(cipherText);
      }
      kmsWasUsed = true;
      return Promise.resolve(Buffer.from(''));
    },
    textDecryptorInContext: (context, returnOriginal) => async (cipherText) => {
      if (kmsIsReady) {
        return kms.textDecryptorInContext(context, returnOriginal)(cipherText);
      }
      kmsWasUsed = true;
      return Promise.resolve('');
    },
    async configureIfNecessary(config: ConfigStore) {
      if (kmsWasUsed && !kmsIsReady) {
        const kmsConfig = config.get('crypto:kms');
        await kms.reconfigure(kmsConfig || {});
        kmsIsReady = true;
        return true;
      }
      return false;
    },
  };
}
