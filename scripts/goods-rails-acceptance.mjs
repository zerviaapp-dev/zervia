// Goods rails Phase A-1 acceptance — pure logic (no DOM, no DB).
// 1. Hidden categories rejected (plumbing, room_rentals, …)
// 2. buy_sell + errands pass the rail gate
// 3. buy_sell sub-rails: 11 permitted, old sale-types rejected
// 4. Form groups: no hidden category rendered as an option
import { execSync } from 'node:child_process';
import assert from 'node:assert/strict';

execSync('npx esbuild lib/goods-rails.ts --bundle --format=esm --platform=node --outfile=/tmp/goods-rails.test.mjs --log-level=error',
  { cwd: new URL('..', import.meta.url).pathname });
const R = await import('/tmp/goods-rails.test.mjs');

let pass = 0;
const case_ = (name, fn) => {
  try { fn(); pass++; console.log('PASS ' + name); }
  catch (e) { console.error('FAIL ' + name + ': ' + e.message); process.exitCode = 1; }
};

case_('hidden categories rejected', () => {
  for (const c of ['plumbing', 'electrical', 'caregiving', 'massage', 'legal_services',
    'insurance', 'mortgage_brokerage', 'locksmith', 'solar_install',
    'room_rentals', 'house_rent', 'basement_suite', 'apartment_condo',
    'drafting', 'home_renovation', 'basement_renovation', 'cabinetry',
    'bathroom_renovation', 'led_lighting', 'sealants',
    'content_creator', 'web_developer', 'app_developer', 'flower_shop']) {
    assert.equal(R.isHiddenCategory(c), true, c);
  }
  assert.equal(R.HIDDEN_CATEGORIES.length, 24);
});

case_('buy_sell and errands pass the gate', () => {
  assert.equal(R.isHiddenCategory('buy_sell'), false);
  assert.equal(R.isHiddenCategory('errands'), false);
  assert.equal(R.isHiddenCategory('cleaning'), false);
});

case_('11 goods sub-rails permitted', () => {
  assert.equal(R.GOODS_SUB_RAILS.length, 11);
  for (const r of ['furniture', 'appliances', 'home_decor', 'garden', 'tools',
    'outdoor', 'sports', 'toys', 'books', 'music', 'crafts']) {
    assert.equal(R.isGoodsSubRail(r), true, r);
  }
});

case_('old sale-type subcategories rejected as rails', () => {
  for (const s of ['furniture_sale', 'electronics_sale', 'vehicles_sale', 'clothing_sale']) {
    assert.equal(R.isGoodsSubRail(s), false, s);
  }
});

case_('form groups contain zero hidden categories', () => {
  const groups = R.visibleCategoryGroups();
  const all = groups.flatMap((g) => g.categories);
  assert.ok(all.length > 0, 'groups must not be empty');
  for (const c of all) assert.equal(R.isHiddenCategory(c), false, c);
  assert.ok(all.includes('buy_sell'), 'buy_sell still visible');
  assert.ok(all.includes('errands'), 'errands still visible');
  assert.ok(!all.includes('plumbing'), 'plumbing gone from form');
  assert.ok(!all.includes('room_rentals'), 'room_rentals gone from form');
});

console.log(`\n${pass} goods-rails cases passed${process.exitCode ? ' (WITH FAILURES)' : ''}.`);
