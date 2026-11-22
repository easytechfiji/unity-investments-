import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config/env.js';

describe('loadConfig', () => {
  it('uses safe defaults in development', () => {
    const config = loadConfig({});
    expect(config).toMatchObject({
      NODE_ENV: 'development',
      PORT: 4000,
      CORS_ORIGINS: [],
      TAX_ENABLED: false,
    });
  });

  it('treats empty values as not set', () => {
    expect(loadConfig({ PORT: '', TAX_ENABLED: '' }).PORT).toBe(4000);
  });

  it('splits and checks CORS origins', () => {
    const config = loadConfig({ CORS_ORIGINS: 'https://a.example, http://localhost:3000' });
    expect(config.CORS_ORIGINS).toEqual(['https://a.example', 'http://localhost:3000']);
    expect(() => loadConfig({ CORS_ORIGINS: 'https://a.example/' })).toThrow(ConfigError);
    expect(() => loadConfig({ CORS_ORIGINS: '*' })).toThrow(ConfigError);
  });

  it('requires CORS origins in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/CORS_ORIGINS/);
  });

  it('rejects a lowercase or long currency code', () => {
    expect(() => loadConfig({ SHOP_CURRENCY: 'nzd' })).toThrow(ConfigError);
    expect(loadConfig({ SHOP_CURRENCY: 'NZD' }).SHOP_CURRENCY).toBe('NZD');
  });

  it('accepts an https Supabase URL and rejects plain http', () => {
    expect(loadConfig({ SUPABASE_URL: 'https://abcd1234.supabase.co' }).SUPABASE_URL).toBe(
      'https://abcd1234.supabase.co',
    );
    expect(() => loadConfig({ SUPABASE_URL: 'http://abcd1234.supabase.co' })).toThrow(
      /SUPABASE_URL/,
    );
  });

  it('never echoes a malformed secret key', () => {
    try {
      loadConfig({ SUPABASE_SECRET_KEY: 'sb_secret_short' });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).toContain('SUPABASE_SECRET_KEY');
      expect(String(error)).not.toContain('sb_secret_short');
    }
  });

  it('names the bad setting but never echoes its value', () => {
    try {
      loadConfig({ PORT: 'secret-looking-value' });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).toContain('PORT');
      expect(String(error)).not.toContain('secret-looking-value');
    }
  });
});
