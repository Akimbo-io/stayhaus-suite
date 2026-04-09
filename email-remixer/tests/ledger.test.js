import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadLedger, saveLedger, isProcessed, markProcessed, pruneOldEntries } from '../src/ledger.js';
import fs from 'fs';

vi.mock('fs');

describe('ledger', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('loadLedger', () => {
    it('returns empty array when file does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      const ledger = loadLedger('./processed.json');
      expect(ledger).toEqual([]);
    });

    it('returns parsed entries when file exists', () => {
      const data = { processedIds: [{ id: 'a', date: '2026-04-01' }] };
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(data));
      const ledger = loadLedger('./processed.json');
      expect(ledger).toEqual([{ id: 'a', date: '2026-04-01' }]);
    });
  });

  describe('isProcessed', () => {
    it('returns true if message ID is in ledger', () => {
      const ledger = [{ id: 'abc', date: '2026-04-01' }];
      expect(isProcessed(ledger, 'abc')).toBe(true);
    });

    it('returns false if message ID is not in ledger', () => {
      const ledger = [{ id: 'abc', date: '2026-04-01' }];
      expect(isProcessed(ledger, 'xyz')).toBe(false);
    });
  });

  describe('pruneOldEntries', () => {
    it('removes entries older than 90 days', () => {
      const now = new Date('2026-04-03');
      const ledger = [
        { id: 'old', date: '2025-12-01' },
        { id: 'recent', date: '2026-03-15' },
      ];
      const pruned = pruneOldEntries(ledger, now);
      expect(pruned).toEqual([{ id: 'recent', date: '2026-03-15' }]);
    });
  });

  describe('markProcessed', () => {
    it('adds entry with id and date', () => {
      const ledger = [];
      const result = markProcessed(ledger, 'msg-1', '2026-04-03');
      expect(result).toEqual([{ id: 'msg-1', date: '2026-04-03' }]);
    });
  });
});
