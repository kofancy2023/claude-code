/**
 * 安全工具模块
 *
 * 包含：
 * - 输入验证器
 * - 命令清理器
 * - 敏感信息扫描器
 * - 输出过滤器
 */

export class InputValidator {
  private pathTraversalPattern = /\.\.\/|\.\.\\/g;
  private dangerousCharsPattern = /[\x00-\x08\x0b\x0c\x0e-\x1f]/;
  private commandInjectionPattern = /[;&|`$()<>{}[\]!?*#~%"']/g;
  private urlPattern = /https?:\/\/[^\s]+/g;
  private emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  private ipPattern = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g;

  validatePath(path: string): ValidationResult {
    if (!path || typeof path !== 'string') {
      return {
        valid: false,
        error: 'Path must be a non-empty string',
        sanitized: '',
      };
    }

    if (this.pathTraversalPattern.test(path)) {
      return {
        valid: false,
        error: 'Path traversal detected (../ or ..\\)',
        sanitized: path.replace(this.pathTraversalPattern, ''),
      };
    }

    if (this.dangerousCharsPattern.test(path)) {
      return {
        valid: false,
        error: 'Path contains dangerous characters',
        sanitized: path.replace(this.dangerousCharsPattern, ''),
      };
    }

    return { valid: true, error: undefined, sanitized: path };
  }

  validateCommand(command: string, allowShellSyntax: boolean = false): ValidationResult {
    if (!command || typeof command !== 'string') {
      return {
        valid: false,
        error: 'Command must be a non-empty string',
        sanitized: '',
      };
    }

    const trimmed = command.trim();

    if (trimmed.length === 0) {
      return {
        valid: false,
        error: 'Command cannot be empty',
        sanitized: '',
      };
    }

    if (trimmed.length > 10000) {
      return {
        valid: false,
        error: 'Command too long (max 10000 characters)',
        sanitized: '',
      };
    }

    if (!allowShellSyntax) {
      const dangerousMatches = trimmed.match(this.commandInjectionPattern);
      if (dangerousMatches) {
        const sanitized = trimmed.replace(this.commandInjectionPattern, '');
        return {
          valid: false,
          error: `Command contains potentially dangerous characters: ${dangerousMatches.slice(0, 5).join(', ')}`,
          sanitized,
        };
      }
    }

    return { valid: true, error: undefined, sanitized: trimmed };
  }

  validateUrl(url: string): ValidationResult {
    if (!url || typeof url !== 'string') {
      return {
        valid: false,
        error: 'URL must be a non-empty string',
        sanitized: '',
      };
    }

    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return {
          valid: false,
          error: 'Only HTTP and HTTPS protocols are allowed',
          sanitized: url,
        };
      }
      return { valid: true, error: undefined, sanitized: url };
    } catch {
      return {
        valid: false,
        error: 'Invalid URL format',
        sanitized: '',
      };
    }
  }

  containsPII(text: string): PIIResult {
    const pii = {
      emails: text.match(this.emailPattern) || [],
      urls: text.match(this.urlPattern) || [],
      ips: text.match(this.ipPattern) || [],
    };

    const hasPII = pii.emails.length > 0 || pii.urls.length > 0 || pii.ips.length > 0;

    return {
      hasPII,
      pii,
    };
  }
}

export class CommandSanitizer {
  private dangerousCommands = [
    'rm -rf /',
    'rm -rf /*',
    ':(){ :|:& };:',
    'mkfs',
    'dd if=',
    '> /dev/sda',
    '(wget|curl).*\\|\\s*(bash|sh|korn)',
    'nc -e',
    '/dev/tcp/',
    'exec.*socket',
  ];

  private allowedCommands = new Set([
    'ls', 'dir', 'cat', 'echo', 'pwd', 'cd', 'mkdir', 'rmdir',
    'cp', 'mv', 'rm', 'touch', 'find', 'grep', 'head', 'tail',
    'wc', 'sort', 'uniq', 'cut', 'awk', 'sed', 'tr', 'tee',
    'ps', 'kill', 'killall', 'top', 'htop', 'df', 'du', 'free',
    'uptime', 'whoami', 'id', 'uname', 'hostname', 'ifconfig',
    'ip', 'netstat', 'ss', 'ping', 'traceroute', 'nslookup', 'dig',
    'curl', 'wget', 'tar', 'zip', 'unzip', 'gzip', 'gunzip',
    'git', 'npm', 'yarn', 'pnpm', 'bun', 'node', 'python', 'python3',
    'java', 'go', 'rustc', 'cargo', 'make', 'cmake', 'gcc', 'g++',
  ]);

  sanitizeCommand(input: string, allowlist: boolean = true): SanitizeResult {
    if (!input || typeof input !== 'string') {
      return {
        sanitized: '',
        wasModified: false,
        warnings: ['Empty or invalid input'],
      };
    }

    const trimmed = input.trim();
    const warnings: string[] = [];
    let sanitized = trimmed;

    for (const cmd of this.dangerousCommands) {
      const pattern = new RegExp(cmd, 'i');
      if (pattern.test(sanitized)) {
        return {
          sanitized: '',
          wasModified: true,
          warnings: [`Dangerous command pattern detected: ${cmd}`],
        };
      }
    }

    const firstWord = trimmed.split(/\s+/)[0].toLowerCase();
    if (allowlist && firstWord && !this.allowedCommands.has(firstWord)) {
      warnings.push(`Command "${firstWord}" is not in the allowlist`);
    }

    if (sanitized.includes('|') && !sanitized.startsWith('|')) {
      const parts = sanitized.split('|');
      for (const part of parts) {
        const cmd = part.trim().split(/\s+/)[0];
        if (cmd && !this.allowedCommands.has(cmd.toLowerCase())) {
          warnings.push(`Piped command "${cmd}" is not in the allowlist`);
        }
      }
    }

    sanitized = sanitized
      .replace(/[;&|`$(){}[\]!?*#~%"']/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return {
      sanitized,
      wasModified: sanitized !== trimmed,
      warnings,
    };
  }

  addToAllowlist(command: string): void {
    this.allowedCommands.add(command.toLowerCase());
  }

  removeFromAllowlist(command: string): void {
    this.allowedCommands.delete(command.toLowerCase());
  }

  getAllowlist(): string[] {
    return Array.from(this.allowedCommands);
  }
}

export class SecretScanner {
  private secretPatterns: Array<{
    name: string;
    pattern: RegExp;
    severity: 'critical' | 'high' | 'medium';
  }> = [
    {
      name: 'AWS Access Key',
      pattern: /\b(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}\b/,
      severity: 'critical',
    },
    {
      name: 'AWS Secret Key',
      pattern: /\b[A-Za-z0-9/+=]{40}\b/,
      severity: 'critical',
    },
    {
      name: 'GitHub Token',
      pattern: /\b(gho|ghp|ghu|ghs|ghr)_[A-Za-z0-9_]{36,255}\b/,
      severity: 'critical',
    },
    {
      name: 'OpenAI API Key',
      pattern: /\b(sk-[A-Za-z0-9]{48}|sk-proj-[A-Za-z0-9_-]{60,})\b/,
      severity: 'critical',
    },
    {
      name: 'Anthropic API Key',
      pattern: /\b(sk-ant-[A-Za-z0-9_-]{50,})\b/,
      severity: 'critical',
    },
    {
      name: 'Generic API Key',
      pattern: /\b(api[_-]?key|apikey)[=:\s]+['"]?([A-Za-z0-9_-]{20,})['"]?/i,
      severity: 'high',
    },
    {
      name: 'Bearer Token',
      pattern: /\bBearer\s+[A-Za-z0-9_-]{20,}\b/i,
      severity: 'high',
    },
    {
      name: 'Basic Auth',
      pattern: /\bBasic\s+[A-Za-z0-9+/=]{20,}\b/,
      severity: 'high',
    },
    {
      name: 'Private Key',
      pattern: /-----BEGIN (RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----/,
      severity: 'critical',
    },
    {
      name: 'JWT Token',
      pattern: /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
      severity: 'high',
    },
    {
      name: 'Slack Token',
      pattern: /\b(xox[baprs]-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*)\b/,
      severity: 'high',
    },
    {
      name: 'Discord Token',
      pattern: /\b[MN][A-Za-z\d]{23,}\.[\w-]{6}\.[\w-]{27}\b/,
      severity: 'high',
    },
    {
      name: 'Database URL',
      pattern: /\b(mysql|postgresql|mongodb|redis):\/\/[^\s]+:[^\s]+@[^\s]+/i,
      severity: 'high',
    },
    {
      name: 'Authorization Header',
      pattern: /authorization[=:\s]+['"]?(Bearer|Basic) [A-Za-z0-9_-]+['"]?/i,
      severity: 'medium',
    },
  ];

  scan(text: string): ScanResult {
    const findings: Finding[] = [];

    for (const { name, pattern, severity } of this.secretPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        for (const match of matches) {
          if (!match) continue;
          const startIndex = text.indexOf(match);
          findings.push({
            type: name,
            match: this.maskSecret(match),
            severity,
            range: {
              start: startIndex,
              end: startIndex + match.length,
            },
          });
        }
      }
    }

    const criticalCount = findings.filter((f) => f.severity === 'critical').length;
    const highCount = findings.filter((f) => f.severity === 'high').length;
    const mediumCount = findings.filter((f) => f.severity === 'medium').length;

    return {
      hasSecrets: findings.length > 0,
      findings,
      summary: {
        total: findings.length,
        critical: criticalCount,
        high: highCount,
        medium: mediumCount,
      },
    };
  }

  private maskSecret(secret: string): string {
    if (secret.length <= 8) {
      return '*'.repeat(secret.length);
    }
    return secret.slice(0, 4) + '*'.repeat(secret.length - 8) + secret.slice(-4);
  }
}

export class OutputSanitizer {
  private scanner = new SecretScanner();

  sanitize(text: string): SanitizedOutput {
    const scanResult = this.scanner.scan(text);

    let sanitized = text;

    for (const finding of scanResult.findings) {
      const originalMatch = text.slice(finding.range.start, finding.range.end);
      sanitized = sanitized.replace(originalMatch, `[${finding.type} REDACTED]`);
    }

    return {
      original: text,
      sanitized,
      hadSecrets: scanResult.hasSecrets,
      redactions: scanResult.findings.map((f) => f.type),
    };
  }

  sanitizeError(error: Error): SanitizedOutput {
    return this.sanitize(error.message);
  }
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  sanitized: string;
}

export interface PIIResult {
  hasPII: boolean;
  pii: {
    emails: string[];
    urls: string[];
    ips: string[];
  };
}

export interface SanitizeResult {
  sanitized: string;
  wasModified: boolean;
  warnings: string[];
}

export interface ScanResult {
  hasSecrets: boolean;
  findings: Finding[];
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
  };
}

export interface Finding {
  type: string;
  match: string;
  severity: 'critical' | 'high' | 'medium';
  range: {
    start: number;
    end: number;
  };
}

export interface SanitizedOutput {
  original: string;
  sanitized: string;
  hadSecrets: boolean;
  redactions: string[];
}

export const inputValidator = new InputValidator();
export const commandSanitizer = new CommandSanitizer();
export const secretScanner = new SecretScanner();
export const outputSanitizer = new OutputSanitizer();
