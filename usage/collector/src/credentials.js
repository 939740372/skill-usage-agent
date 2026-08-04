import os from 'node:os';

const SERVICE_NAME = 'intretech-skill-usage';
const ACCOUNT_NAME = `${os.userInfo().username}@${os.hostname()}`;

export class MemoryCredentialStore {
  constructor() {
    this.values = new Map();
  }

  async get(key) {
    return this.values.get(key) ?? null;
  }

  async set(key, value) {
    this.values.set(key, value);
  }

  async delete(key) {
    this.values.delete(key);
  }
}

class KeytarCredentialStore {
  constructor(keytar) {
    this.keytar = keytar;
  }

  async get(key) {
    return this.keytar.getPassword(`${SERVICE_NAME}:${key}`, ACCOUNT_NAME);
  }

  async set(key, value) {
    await this.keytar.setPassword(`${SERVICE_NAME}:${key}`, ACCOUNT_NAME, value);
  }

  async delete(key) {
    await this.keytar.deletePassword(`${SERVICE_NAME}:${key}`, ACCOUNT_NAME);
  }
}

export async function createCredentialStore() {
  if (process.env.NODE_ENV === 'test' || process.env.USAGE_CREDENTIAL_STORE === 'memory') {
    return new MemoryCredentialStore();
  }

  try {
    const module = await import('keytar');
    const keytar = module.default || module;
    return new KeytarCredentialStore(keytar);
  } catch (error) {
    throw new Error('No OS secure credential store is available; install keytar before running usage-agent login', { cause: error });
  }
}

export const tokenCredentialKey = 'oidc-tokens';
