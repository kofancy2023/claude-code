import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Config } from '../../config/index.js';
import * as fs from 'fs';
import * as path from 'path';

describe('Config', () => {
  const testConfigPath = path.join(process.cwd(), 'test-config.json');
  const testHomeConfigPath = path.join(process.cwd(), '.my-agent-test');

  beforeEach(() => {
    process.env.AI_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    if (fs.existsSync(testConfigPath)) {
      fs.unlinkSync(testConfigPath);
    }
    if (fs.existsSync(testHomeConfigPath)) {
      fs.rmSync(testHomeConfigPath, { recursive: true });
    }
  });

  describe('load', () => {
    it('should load configuration from environment', () => {
      const config = new Config();
      config.load();

      expect(config.get('apiKey')).toBe('test-api-key');
      expect(config.get('provider')).toBe('glm');
    });

    it('should accept custom provider from environment', () => {
      process.env.AI_PROVIDER = 'anthropic';

      const config = new Config();
      config.load();

      expect(config.get('provider')).toBe('anthropic');
    });
  });

  describe('get', () => {
    it('should return configured value', () => {
      const config = new Config();
      config.load();

      expect(config.get('apiKey')).toBe('test-api-key');
    });

    it('should return undefined for unknown key', () => {
      const config = new Config();
      config.load();

      expect(config.get('unknownKey' as any)).toBeUndefined();
    });
  });

  describe('set', () => {
    it('should set a value in memory', () => {
      const config = new Config();
      config.load();

      config.setExtra('customKey', 'customValue');

      expect(config.get('customKey' as any)).toBe('customValue');
    });
  });

  describe('getSource', () => {
    it('should return source of a value', () => {
      process.env.AI_API_KEY = 'env-key';

      const config = new Config();
      config.load();

      const source = config.getSource('apiKey');

      expect(source?.source).toBe('env');
      expect(source?.value).toBe('env-key');
    });
  });

  describe('validate', () => {
    it('should return valid for complete config', () => {
      const config = new Config();
      config.load();

      const result = config.validate();

      expect(result.valid).toBe(true);
    });
  });

  describe('exportToFile', () => {
    it('should export config to file', async () => {
      const config = new Config();
      config.load();
      config.setExtra('customField', 'value');

      await config.exportToFile(testConfigPath);

      expect(fs.existsSync(testConfigPath)).toBe(true);

      const content = JSON.parse(fs.readFileSync(testConfigPath, 'utf-8'));

      expect(content.customField).toBe('value');
    });

    it('should exclude apiKey from exported file', async () => {
      const config = new Config();
      config.load();

      await config.exportToFile(testConfigPath);

      const content = JSON.parse(fs.readFileSync(testConfigPath, 'utf-8'));

      expect(content.apiKey).toBeUndefined();
    });
  });
});
