import { describe, it, expect, vi } from 'vitest';
import { createAuthClient, loadToken, saveToken } from '../src/auth.js';
import fs from 'fs';

vi.mock('fs');

describe('auth', () => {
  describe('loadToken', () => {
    it('returns null when token.json does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      const token = loadToken('./token.json');
      expect(token).toBeNull();
    });

    it('returns parsed token when token.json exists', () => {
      const mockToken = { access_token: 'abc', refresh_token: 'def' };
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(mockToken));
      const token = loadToken('./token.json');
      expect(token).toEqual(mockToken);
    });
  });

  describe('saveToken', () => {
    it('writes token to file', () => {
      const mockToken = { access_token: 'abc', refresh_token: 'def' };
      saveToken('./token.json', mockToken);
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        './token.json',
        JSON.stringify(mockToken, null, 2)
      );
    });
  });

  describe('createAuthClient', () => {
    it('creates an OAuth2 client from credentials', () => {
      const creds = {
        installed: {
          client_id: 'test-id',
          client_secret: 'test-secret',
          redirect_uris: ['http://localhost']
        }
      };
      const client = createAuthClient(creds);
      expect(client).toBeDefined();
      expect(client.generateAuthUrl).toBeDefined();
    });
  });
});
