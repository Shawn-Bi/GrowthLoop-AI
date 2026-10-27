const test = require('node:test');
const assert = require('node:assert/strict');
const { generatePosts } = require('../.content-agent-test-build/generate-posts.js');

const brief = {
  audience: 'NYC nonprofit leaders',
  campaignGoal: 'Increase LinkedIn engagement',
  keyMessage: 'Better housing outcomes start with collaboration',
  approvedClaims: ['Our program supports housing access', 'Our team works with community partners']
};

test('single-variable experiment requires explicit tested dimension', () => {
  assert.throws(
    () => generatePosts(brief),
    /variable|dimension|experiment/i,
    'Generation must not silently create an untracked multi-variable experiment'
  );
});

test('single-variable experiment exposes its controlled dimension', () => {
  const posts = generatePosts(brief, { experimentVariable: 'hook' });
  assert.equal(posts.length, 2);
  for (const post of posts) {
    assert.equal(post.experimentVariable, 'hook');
    assert.equal(post.approvalStatus, 'pending');
  }
});

test('hook-only experiment keeps message, evidence, and CTA identical', () => {
  const [a, b] = generatePosts(brief, { experimentVariable: 'hook' });
  assert.notEqual(a.hook, b.hook);
  for (const field of ['pain_point', 'value_proposition', 'evidence', 'cta']) {
    assert.deepEqual(a[field], b[field], field + ' must remain controlled');
  }
});

test('unsupported experiment dimensions are rejected', () => {
  assert.throws(() => generatePosts(brief, { experimentVariable: 'tone' }), /variable|dimension|unsupported/i);
});
