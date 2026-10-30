const test = require('node:test');
const assert = require('node:assert/strict');
const { generatePosts } = require('../.content-agent-test-build/generate-posts.js');
const { startRevisionLoop, revisePosts } = require('../.content-agent-test-build/revision-loop.js');
const { approvePost } = require('../.content-agent-test-build/approve-posts.js');
const brief = { audience: 'NYC nonprofit leaders', campaignGoal: 'Increase LinkedIn engagement', keyMessage: 'Better housing outcomes start with collaboration', approvedClaims: ['Our program supports housing access', 'Our team works with community partners'] };
test('A/B have distinct framing and preserve every approved claim', () => {
 const [a,b] = generatePosts(brief);
 assert.notEqual(a.content,b.content);
 assert.match(a.content,/people whose experiences matter/);
 assert.match(b.content,/actionable next step/);
 for (const claim of brief.approvedClaims) { assert.ok(a.content.includes(claim)); assert.ok(b.content.includes(claim)); }
 assert.equal(a.approvalStatus,'pending');
});
test('invalid brief is rejected', () => assert.throws(()=>generatePosts({...brief, approvedClaims: []}),/approved claim/));
test('revision changes copy and never publishes raw feedback', () => {
 const initial = startRevisionLoop(brief);
 const revised = revisePosts(initial, brief, 'Make it shorter');
 assert.equal(revised.currentCycle,2);
 assert.notEqual(revised.history[0].posts[0].content,revised.history[1].posts[0].content);
 for (const post of revised.history[1].posts) { assert.ok(!post.content.includes('Revision guidance:')); for(const claim of brief.approvedClaims) assert.ok(post.content.includes(claim)); }
});
test('unsupported revision requires human review', () => assert.throws(()=>revisePosts(startRevisionLoop(brief),brief,'Use a statistic about homelessness'),/human review/));
test('maximum three cycles', () => {
 const one=startRevisionLoop(brief);
 const two=revisePosts(one,brief,'shorter');
 const three=revisePosts(two,brief,'more detailed');
 assert.equal(three.currentCycle,3);
 assert.throws(()=>revisePosts(three,brief,'shorter'),/Maximum revision cycles/);
});
test('human approval is mandatory', () => {
 const posts=generatePosts(brief);
 assert.throws(()=>approvePost(posts,'A',false),/Human approval/);
 assert.equal(approvePost(posts,'B',true).approvalStatus,'approved');
});
