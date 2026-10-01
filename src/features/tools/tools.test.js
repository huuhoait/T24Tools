import { describe, expect, it, vi } from 'vitest';
import { BRIDGE_KEYS, handleBridgeMessage } from './EmbeddedTools';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => (data[k] = v),
    removeItem: (k) => delete data[k],
  };
}

describe('embedded tool bridge', () => {
  it('shares only the OFS configuration and the Log Analyzer handoff', () => {
    expect(BRIDGE_KEYS).toEqual(['t24tools.ofs.config', 't24tools.t24.ofsContext']);
  });

  it('answers bridge-ready with a snapshot of the allow-listed keys only', () => {
    const storage = memoryStorage({
      't24tools.ofs.config': '{"application":"FT"}',
      't24tools.theme': 'dark',
    });
    const reply = vi.fn();
    expect(handleBridgeMessage({ type: 't24tools:bridge-ready' }, { reply, storage })).toBe(true);
    expect(reply).toHaveBeenCalledWith({
      type: 't24tools:storage-snapshot',
      values: { 't24tools.ofs.config': '{"application":"FT"}' },
    });
  });

  it('only stores allow-listed keys with string values', () => {
    const storage = memoryStorage();
    const opts = { reply: vi.fn(), storage };
    expect(
      handleBridgeMessage({ type: 't24tools:storage-set', key: BRIDGE_KEYS[0], value: '{}' }, opts),
    ).toBe(true);
    expect(storage.data[BRIDGE_KEYS[0]]).toBe('{}');
    expect(
      handleBridgeMessage(
        { type: 't24tools:storage-set', key: 't24tools.theme', value: 'x' },
        opts,
      ),
    ).toBe(false);
    expect(
      handleBridgeMessage({ type: 't24tools:storage-set', key: BRIDGE_KEYS[0], value: {} }, opts),
    ).toBe(false);
    expect(storage.data['t24tools.theme']).toBeUndefined();
  });

  it('rejects oversized values', () => {
    const storage = memoryStorage();
    const value = 'x'.repeat(1_000_001);
    expect(
      handleBridgeMessage(
        { type: 't24tools:storage-set', key: BRIDGE_KEYS[1], value },
        { reply: vi.fn(), storage },
      ),
    ).toBe(false);
    expect(storage.data[BRIDGE_KEYS[1]]).toBeUndefined();
  });

  it('removes allow-listed keys only', () => {
    const storage = memoryStorage({ [BRIDGE_KEYS[1]]: '{}', other: 'kept' });
    const opts = { reply: vi.fn(), storage };
    expect(
      handleBridgeMessage({ type: 't24tools:storage-remove', key: BRIDGE_KEYS[1] }, opts),
    ).toBe(true);
    expect(handleBridgeMessage({ type: 't24tools:storage-remove', key: 'other' }, opts)).toBe(
      false,
    );
    expect(storage.data).toEqual({ other: 'kept' });
  });

  it('only allows opening the OFS tool', () => {
    const onOpenTool = vi.fn();
    expect(handleBridgeMessage({ type: 't24tools:open-tool', tool: 'ofs' }, { onOpenTool })).toBe(
      true,
    );
    expect(
      handleBridgeMessage({ type: 't24tools:open-tool', tool: 'routine' }, { onOpenTool }),
    ).toBe(false);
    expect(onOpenTool).toHaveBeenCalledTimes(1);
    expect(onOpenTool).toHaveBeenCalledWith('ofs');
  });

  it('ignores the old repomind:* protocol and unknown messages', () => {
    const storage = memoryStorage();
    const opts = { reply: vi.fn(), storage, onOpenTool: vi.fn() };
    expect(
      handleBridgeMessage({ type: 'repomind:storage-set', key: BRIDGE_KEYS[0], value: '{}' }, opts),
    ).toBe(false);
    expect(handleBridgeMessage({ type: 'repomind:open-tool', tool: 'ofs' }, opts)).toBe(false);
    expect(handleBridgeMessage({ type: 'something-else' }, opts)).toBe(false);
    expect(handleBridgeMessage(null, opts)).toBe(false);
    expect(storage.data).toEqual({});
    expect(opts.onOpenTool).not.toHaveBeenCalled();
  });
});
