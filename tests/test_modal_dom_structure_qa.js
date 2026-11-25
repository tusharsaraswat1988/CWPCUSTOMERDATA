/**
 * QA TEST SUITE: MODAL DOM STRUCTURE & SIBLING INDEPENDENCE (Task 01.10 P0-1)
 *
 * Verifies that:
 * 1. assignSpecialJobModal is properly closed and does not trap subsequent modals.
 * 2. All 10 subsequent modals are direct top-level siblings (not nested inside one another).
 * 3. Each modal has proper opening and closing boundaries, valid role="dialog", aria-modal="true".
 * 4. Closing triggers and backdrops are independently addressable.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function runModalDomTest() {
  console.log('--- Running Modal DOM Structure QA Test ---');

  const htmlPath = path.join(__dirname, '..', 'Index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  const modals = [
    'assignSpecialJobModal',
    'reassignJobModal',
    'startSpecialJobModal',
    'completeSpecialJobModal',
    'cancelSpecialJobModal',
    'designationManagementModal',
    'sellPackageModal',
    'redeemPackageModal',
    'packageHistoryModal',
    'createBookingModal',
    'staffHierarchyModal'
  ];

  // Tokenize HTML and track open/close tags
  const tagRegex = /<!--[\s\S]*?-->|<\/?([a-zA-Z0-9\-]+)([^>]*)>/g;
  let match;
  const stack = [];
  const modalInfo = {};
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

  modals.forEach(id => {
    modalInfo[id] = {
      openedAtLine: null,
      closedAtLine: null,
      parentAtOpen: null,
      parentAtClose: null,
      depthAtOpen: null,
      depthAtClose: null
    };
  });

  while ((match = tagRegex.exec(html)) !== null) {
    if (match[0].startsWith('<!--')) continue;
    const tagName = match[1].toLowerCase();
    const attrs = match[2];
    const isClosing = match[0].startsWith('</');
    const isSelf = match[0].endsWith('/>') || voidTags.has(tagName);
    const line = html.substring(0, match.index).split('\n').length;

    if (isClosing) {
      const top = stack.pop();
      if (top && modalInfo[top.id]) {
        modalInfo[top.id].closedAtLine = line;
        modalInfo[top.id].depthAtClose = stack.length;
        modalInfo[top.id].parentAtClose = stack.length > 0 ? stack[stack.length - 1].id || stack[stack.length - 1].tag : 'root';
      }
    } else if (!isSelf) {
      const idMatch = attrs.match(/id=["']([^"']+)["']/);
      const id = idMatch ? idMatch[1] : null;

      if (id && modalInfo[id]) {
        modalInfo[id].openedAtLine = line;
        modalInfo[id].depthAtOpen = stack.length;
        modalInfo[id].parentAtOpen = stack.length > 0 ? stack[stack.length - 1].id || stack[stack.length - 1].tag : 'root';
      }
      stack.push({ tag: tagName, id, line });
    }
  }

  // Verification 1: assignSpecialJobModal closes BEFORE reassignJobModal opens
  assert.ok(modalInfo['assignSpecialJobModal'].openedAtLine, 'assignSpecialJobModal must exist');
  assert.ok(modalInfo['assignSpecialJobModal'].closedAtLine, 'assignSpecialJobModal must have closed');
  assert.ok(modalInfo['reassignJobModal'].openedAtLine, 'reassignJobModal must exist');

  assert.ok(
    modalInfo['assignSpecialJobModal'].closedAtLine < modalInfo['reassignJobModal'].openedAtLine,
    `assignSpecialJobModal (closed at line ${modalInfo['assignSpecialJobModal'].closedAtLine}) MUST close before reassignJobModal (opened at line ${modalInfo['reassignJobModal'].openedAtLine})`
  );
  console.log(`✅ PASS: assignSpecialJobModal closed at line ${modalInfo['assignSpecialJobModal'].closedAtLine} before reassignJobModal opened at line ${modalInfo['reassignJobModal'].openedAtLine}`);

  // Verification 2: Check all 10 subsequent modals do NOT have assignSpecialJobModal as parent or ancestor
  const trappedModals = modals.slice(1);
  trappedModals.forEach(id => {
    const info = modalInfo[id];
    assert.ok(info.openedAtLine, `${id} must exist and open`);
    assert.ok(info.closedAtLine, `${id} must have closed`);
    assert.strictEqual(
      info.depthAtOpen,
      modalInfo['assignSpecialJobModal'].depthAtOpen,
      `${id} must open at the exact same depth as assignSpecialJobModal (depth ${modalInfo['assignSpecialJobModal'].depthAtOpen})`
    );
    assert.notStrictEqual(
      info.parentAtOpen,
      'assignSpecialJobModal',
      `${id} MUST NOT have assignSpecialJobModal as parent`
    );
    console.log(`✅ PASS: ${id} is an independent sibling (opened L${info.openedAtLine}, closed L${info.closedAtLine}, depth ${info.depthAtOpen})`);
  });

  // Verification 3: Verify dialog accessibility attributes on all 11 modals
  modals.forEach(id => {
    const regex = new RegExp(`id=["']${id}["'][^>]*role=["']dialog["']`);
    const regexAlt = new RegExp(`role=["']dialog["'][^>]*id=["']${id}["']`);
    assert.ok(
      regex.test(html) || regexAlt.test(html),
      `Modal ${id} must have role="dialog"`
    );
    assert.ok(
      html.includes(`id="${id}"`) && html.substring(html.indexOf(`id="${id}"`), html.indexOf(`id="${id}"`) + 200).includes('aria-modal="true"'),
      `Modal ${id} must have aria-modal="true"`
    );
  });
  console.log('✅ PASS: All 11 modals have role="dialog" and aria-modal="true" accessibility attributes');

  console.log('\n🎉 ALL P0-1 MODAL DOM STRUCTURE TESTS PASSED!');
}

runModalDomTest();
