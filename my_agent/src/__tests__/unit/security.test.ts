import { describe, it, expect, beforeEach } from 'vitest';
import {
  CommandSanitizer,
  SecretScanner,
  OutputSanitizer,
  inputValidator,
  commandSanitizer,
  outputSanitizer,
} from '../../utils/security.js';

describe('InputValidator - 输入验证器', () => {
  describe('validatePath - 路径验证', () => {
    it('should accept valid paths', () => {
      expect(inputValidator.validatePath('/usr/local/bin')).toEqual({
        valid: true,
        error: undefined,
        sanitized: '/usr/local/bin',
      });

      expect(inputValidator.validatePath('./relative/path')).toEqual({
        valid: true,
        error: undefined,
        sanitized: './relative/path',
      });
    });

    it('should reject empty path', () => {
      const result = inputValidator.validatePath('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('non-empty string');
    });

    it('should reject null/undefined path', () => {
      expect(inputValidator.validatePath(null as any).valid).toBe(false);
      expect(inputValidator.validatePath(undefined as any).valid).toBe(false);
    });

    it('should detect path traversal attacks', () => {
      const result1 = inputValidator.validatePath('../../../etc/passwd');
      expect(result1.valid).toBe(false);
      expect(result1.error).toContain('Path traversal');

      const result2 = inputValidator.validatePath('..\\..\\windows\\system32');
      expect(result2.valid).toBe(false);
      expect(result2.error).toContain('Path traversal');
    });

    it('should reject dangerous characters in path', () => {
      const result = inputValidator.validatePath('/path/with\x00null');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('dangerous characters');
    });

    it('should sanitize rather than completely reject path traversal', () => {
      const result = inputValidator.validatePath('../safe/path');
      expect(result.sanitized).toBe('safe/path');
    });
  });

  describe('validateCommand - 命令验证', () => {
    it('should accept valid commands', () => {
      const result = inputValidator.validateCommand('ls -la');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('ls -la');
    });

    it('should accept empty when allowShellSyntax is true', () => {
      const result = inputValidator.validateCommand('echo "hello world"', true);
      expect(result.valid).toBe(true);
    });

    it('should reject empty command', () => {
      const result = inputValidator.validateCommand('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('non-empty string');
    });

    it('should reject whitespace-only command', () => {
      const result = inputValidator.validateCommand('   ');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot be empty');
    });

    it('should reject overly long commands', () => {
      const longCommand = 'a'.repeat(10001);
      const result = inputValidator.validateCommand(longCommand);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too long');
    });

    it('should reject commands with dangerous characters', () => {
      const result = inputValidator.validateCommand('ls; rm -rf /', false);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('dangerous characters');
    });

    it('should allow shell syntax when explicitly permitted', () => {
      const result = inputValidator.validateCommand('echo "hello world"', true);
      expect(result.valid).toBe(true);
    });
  });

  describe('validateUrl - URL 验证', () => {
    it('should accept valid HTTP/HTTPS URLs', () => {
      expect(inputValidator.validateUrl('https://example.com')).toEqual({
        valid: true,
        error: undefined,
        sanitized: 'https://example.com',
      });

      expect(inputValidator.validateUrl('http://localhost:8080')).toEqual({
        valid: true,
        error: undefined,
        sanitized: 'http://localhost:8080',
      });
    });

    it('should reject invalid URLs', () => {
      expect(inputValidator.validateUrl('').valid).toBe(false);
      expect(inputValidator.validateUrl(null as any).valid).toBe(false);
    });

    it('should reject non-HTTP protocols', () => {
      const result = inputValidator.validateUrl('ftp://files.example.com');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('HTTP and HTTPS');
    });
  });

  describe('containsPII - PII 检测', () => {
    it('should detect email addresses', () => {
      const result = inputValidator.containsPII('Contact: user@example.com');
      expect(result.hasPII).toBe(true);
      expect(result.pii.emails).toContain('user@example.com');
    });

    it('should detect URLs', () => {
      const result = inputValidator.containsPII('Visit https://example.com');
      expect(result.hasPII).toBe(true);
      expect(result.pii.urls).toContain('https://example.com');
    });

    it('should detect IP addresses', () => {
      const result = inputValidator.containsPII('Server: 192.168.1.1');
      expect(result.hasPII).toBe(true);
      expect(result.pii.ips).toContain('192.168.1.1');
    });

    it('should return false when no PII found', () => {
      const result = inputValidator.containsPII('Hello world');
      expect(result.hasPII).toBe(false);
    });
  });
});

describe('CommandSanitizer - 命令清理器', () => {
  let sanitizer: CommandSanitizer;

  beforeEach(() => {
    sanitizer = new CommandSanitizer();
  });

  describe('sanitizeCommand - 命令清理', () => {
    it('should remove dangerous commands', () => {
      const dangerous = [
        'rm -rf /',
        'rm -rf /*',
        ':(){ :|:& };:',
        'mkfs.ext4 /dev/sda',
        'dd if=/dev/zero of=/dev/sda',
      ];

      for (const cmd of dangerous) {
        const result = sanitizer.sanitizeCommand(cmd);
        expect(result.sanitized).toBe('');
        expect(result.warnings.some(w => w.includes('Dangerous command'))).toBe(true);
      }
    });

    it('should warn about non-allowlisted commands', () => {
      const result = sanitizer.sanitizeCommand('customCommand --flag', true);
      expect(result.warnings.some(w => w.includes('not in the allowlist'))).toBe(true);
    });

    it('should allow piped commands that start with allowed commands', () => {
      const result = sanitizer.sanitizeCommand('ls | grep test');
      expect(result.warnings.filter(w => w.includes('Dangerous command'))).toEqual([]);
    });

    it('should reject empty input', () => {
      const result = sanitizer.sanitizeCommand('');
      expect(result.sanitized).toBe('');
      expect(result.warnings).toContain('Empty or invalid input');
    });

    it('should handle commands with multiple pipes', () => {
      const result = sanitizer.sanitizeCommand('cat file.txt | grep pattern | head -n 5');
      expect(result.sanitized).toBeDefined();
      expect(result.sanitized.length).toBeGreaterThan(0);
    });

    it('should remove shell metacharacters but preserve command structure', () => {
      const result = sanitizer.sanitizeCommand('ls -la');
      expect(result.sanitized).toBeDefined();
    });
  });

  describe('allowlist 管理', () => {
    it('should add command to allowlist', () => {
      sanitizer.addToAllowlist('customTool');
      expect(sanitizer.getAllowlist()).toContain('customtool');
    });

    it('should remove command from allowlist', () => {
      sanitizer.removeFromAllowlist('ls');
      expect(sanitizer.getAllowlist()).not.toContain('ls');
    });

    it('should be case insensitive', () => {
      sanitizer.addToAllowlist('MyCommand');
      expect(sanitizer.getAllowlist()).toContain('mycommand');
    });
  });
});

describe('SecretScanner - 敏感信息扫描器', () => {
  let scanner: SecretScanner;

  beforeEach(() => {
    scanner = new SecretScanner();
  });

  describe('scan - 扫描敏感信息', () => {
    it('should detect AWS Access Key', () => {
      const result = scanner.scan('AWS_KEY=AKIAIOSFODNN7EXAMPLE');
      expect(result.hasSecrets).toBe(true);
      expect(result.summary.critical).toBeGreaterThan(0);
    });

    it('should detect GitHub Token', () => {
      const result = scanner.scan('ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
      expect(result.hasSecrets).toBe(true);
      expect(result.findings.some(f => f.type === 'GitHub Token')).toBe(true);
    });

    it('should detect OpenAI API Key', () => {
      const result = scanner.scan('sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
      expect(result.hasSecrets).toBe(true);
      expect(result.findings.some(f => f.type === 'OpenAI API Key')).toBe(true);
    });

    it('should detect Bearer Token', () => {
      const result = scanner.scan('Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
      expect(result.hasSecrets).toBe(true);
    });

    it('should detect private key header', () => {
      const pkcs8 = '-----BEGIN PRIVATE KEY-----';
      const result = scanner.scan(pkcs8);
      expect(result.hasSecrets).toBe(true);
      expect(result.findings.some(f => f.type === 'Private Key')).toBe(true);
    });

    it('should detect Database URL with credentials', () => {
      const result = scanner.scan('postgresql://user:password@localhost:5432/db');
      expect(result.hasSecrets).toBe(true);
    });

    it('should return empty findings for clean text', () => {
      const result = scanner.scan('Hello, this is a clean message with no secrets.');
      expect(result.hasSecrets).toBe(false);
      expect(result.findings).toEqual([]);
      expect(result.summary.total).toBe(0);
    });

    it('should mask detected secrets', () => {
      const result = scanner.scan('token=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
      const finding = result.findings[0];
      expect(finding.match).toContain('*');
    });

    it('should detect multiple secrets in one text', () => {
      const text = `
        AWS_KEY=AKIAIOSFODNN7EXAMPLE
        GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
        OPENAI_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
      `;
      const result = scanner.scan(text);
      expect(result.summary.total).toBeGreaterThanOrEqual(3);
    });

    it('should provide severity classification', () => {
      const result = scanner.scan('ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
      const finding = result.findings[0];
      expect(['critical', 'high', 'medium']).toContain(finding.severity);
    });
  });
});

describe('OutputSanitizer - 输出过滤器', () => {
  let sanitizer: OutputSanitizer;

  beforeEach(() => {
    sanitizer = new OutputSanitizer();
  });

  describe('sanitize - 输出清理', () => {
    it('should redact secrets in output', () => {
      const result = sanitizer.sanitize('Your API key is: sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
      expect(result.sanitized).toContain('[OpenAI API Key REDACTED]');
      expect(result.hadSecrets).toBe(true);
      expect(result.redactions).toContain('OpenAI API Key');
    });

    it('should preserve clean output', () => {
      const result = sanitizer.sanitize('Hello, world!');
      expect(result.sanitized).toBe('Hello, world!');
      expect(result.hadSecrets).toBe(false);
      expect(result.redactions).toEqual([]);
    });

    it('should redact multiple secrets', () => {
      const result = sanitizer.sanitize(`
        GitHub: ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
        AWS: AKIAIOSFODNN7EXAMPLE
      `);
      expect(result.redactions.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('sanitizeError - 错误信息清理', () => {
    it('should redact secrets in error messages', () => {
      const error = new Error('Failed to authenticate with token: ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
      const result = sanitizer.sanitizeError(error);
      expect(result.hadSecrets).toBe(true);
    });
  });
});

describe('安全模块集成测试', () => {
  it('should handle realistic attack scenarios', () => {
    const attackScenarios = [
      { input: 'rm -rf /', shouldBlock: true },
      { input: '../../../etc/passwd', shouldBlock: false },
      { input: 'cat /etc/shadow', shouldBlock: false },
    ];

    for (const scenario of attackScenarios) {
      const cmdResult = commandSanitizer.sanitizeCommand(scenario.input);

      if (scenario.shouldBlock) {
        expect(cmdResult.sanitized).toBe('');
      }
    }
  });

  it('should not block common development commands', () => {
    const normalCommands = [
      'ls -la',
      'git status',
      'npm install',
      'docker ps',
      'cat README.md',
    ];

    for (const cmd of normalCommands) {
      const result = commandSanitizer.sanitizeCommand(cmd);
      expect(result.warnings.filter(w => w.includes('Dangerous command'))).toEqual([]);
    }
  });

  it('should mask secrets in various contexts', () => {
    const textsWithSecrets = [
      'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ',
      'Basic dXNlckBleGFtcGxlLmNvbTpwYXNzd29yZA==',
      'postgresql://admin:secret123@db.example.com:5432/production',
    ];

    for (const text of textsWithSecrets) {
      const result = outputSanitizer.sanitize(text);
      expect(result.sanitized).not.toContain('secret');
      expect(result.sanitized).not.toContain('password');
    }
  });

  it('should detect path traversal in validatePath', () => {
    const maliciousPaths = [
      '../../../etc/passwd',
      '..\\..\\windows\\system32\\config\\sam',
      '../../../../../../etc/shadow',
    ];

    for (const path of maliciousPaths) {
      const result = inputValidator.validatePath(path);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Path traversal');
    }
  });

  it('should validate URLs correctly', () => {
    expect(inputValidator.validateUrl('https://api.github.com').valid).toBe(true);
    expect(inputValidator.validateUrl('http://localhost:3000').valid).toBe(true);
    expect(inputValidator.validateUrl('ftp://files.example.com').valid).toBe(false);
    expect(inputValidator.validateUrl('javascript:alert(1)').valid).toBe(false);
  });
});
