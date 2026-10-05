import { describe, it, expect } from 'vitest';
import { DEFAULT_NET, migrateTools, TOOL_RENAMES } from '../../src/core/Save';

describe('tool ids of earlier saves', () => {
  it('the old nets become the new ones, the long net stays long, nothing is doubled', () => {
    expect(migrateTools(['hand_net', 'shovel'])).toEqual(['net_small', 'shovel']);
    expect(migrateTools(['hand_net', 'hand_net_short', 'hand_net_long', 'shovel'])).toEqual(['net_small', 'net_deep', 'shovel']);
    expect(migrateTools(['hand_net_long', 'hand_net'])).toEqual(['net_deep', 'net_small']);
  });
  it('new ids pass through untouched and the default net is a real tool', () => {
    expect(migrateTools(['net_carbon', 'shovel', 'net_fine'])).toEqual(['net_carbon', 'shovel', 'net_fine']);
    expect(Object.values(TOOL_RENAMES)).toContain(DEFAULT_NET);
    expect(migrateTools([])).toEqual([]);
  });
});
