import test from 'ava';

import { add } from 'jackson-wasm';

test('Can call rust', (t) => {
  t.assert(add(1, 2) === 3);
});
