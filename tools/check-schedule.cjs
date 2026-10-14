// Shared behavior fixtures keep the Go save resolver and React preview in sync.
const assert = require('node:assert/strict');
const { resolve } = require('../.tools/schedule-check/schedule.js');
const cases = require('../backend/testdata/schedule.json');
for (const scenario of cases) {
  const before = JSON.stringify(scenario.events);
  if (scenario.error) {
    assert.throws(() => resolve(scenario.events, scenario.edited), undefined, scenario.name);
  } else {
    const result = resolve(scenario.events, scenario.edited);
    assert.deepEqual(Object.fromEntries(result.map(e => [e.id, [e.start, e.end]])), scenario.want, scenario.name);
    for (let i = 0; i < result.length; i++) {
      const e = result[i];
      assert(e.start >= 0 && e.end <= 1440, scenario.name);
      if (i > 0) assert(result[i-1].end <= e.start, scenario.name);
      const old = scenario.events.find(x => x.id === e.id);
      if (old && old.id !== scenario.edited.id) {
        assert.equal(e.end - e.start, old.end - old.start, scenario.name);
        if (old.locked) assert.deepEqual(e, old, scenario.name);
      }
    }
  }
  assert.equal(JSON.stringify(scenario.events), before, `${scenario.name}: input mutated`);
}
console.log(`PASS: frontend resolver matches all ${cases.length} shared scheduling fixtures`);
