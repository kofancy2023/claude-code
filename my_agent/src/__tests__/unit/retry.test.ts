import { describe, it, expect, beforeEach } from 'vitest';
import { CircuitBreaker } from '../../utils/retry.js';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      name: 'test-circuit-' + Date.now(),
      failureThreshold: 3,
      resetTimeout: 1000,
      windowSize: 5000,
    });
  });

  it('should execute function successfully', async () => {
    const fn = async () => 'result';

    const result = await breaker.execute(fn);

    expect(result).toBe('result');
  });

  it('should return initial closed state', () => {
    expect(breaker.getState()).toBe('closed');
  });

  it('should call the function exactly once', async () => {
    let callCount = 0;
    const fn = async () => {
      callCount++;
      return 'success';
    };

    await breaker.execute(fn);

    expect(callCount).toBe(1);
  });
});
