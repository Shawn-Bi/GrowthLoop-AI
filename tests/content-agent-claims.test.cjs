const test = require('node:test');
const assert = require('node:assert/strict');
const { generatePosts } = require('../.content-agent-test-build/generate-posts.js');
const { approvePost } = require('../.content-agent-test-build/approve-posts.js');
const registry = [
 { id: 'CL-001', text: 'Our team supports housing access', status: 'approved' },
 { id: 'CL-002', text: 'Unverified impact number', status: 'rejected' },
 { id: 'CL-003', text: 'Pending performance figure', status: 'pending' }
];
const brief = { audience:'Community leaders', campaignGoal:'Improve collaboration', keyMessage:'Work together', approvedClaims:['Legacy text'] };
const options = { experimentVariable:'hook', claimIds:['CL-001'], claimRegistry:registry };
test('registry IDs resolve approved claim text into both drafts',()=>{
 const posts=generatePosts(brief,options);
 for(const post of posts){assert.match(post.content,/Our team supports housing access/);assert.deepEqual(post.claimIds,['CL-001']);}
});
test('rejected, pending, and missing claim IDs cannot generate posts',()=>{
 for(const id of ['CL-002','CL-003','CL-404']) assert.throws(()=>generatePosts(brief,{...options,claimIds:[id]}),/approved|missing/i);
});
test('revoked claims block ready-state approval even after generation',()=>{
 const posts=generatePosts(brief,options);
 const revoked=registry.map(x=>x.id==='CL-001'?{...x,status:'revoked'}:x);
 assert.throws(()=>approvePost(posts,'A',true,{claimIds:['CL-001'],registry:revoked}),/approved/i);
});
test('registry drafts require fresh claim validation and human approval',()=>{
 const posts=generatePosts(brief,options);
 assert.throws(()=>approvePost(posts,'A',true),/revalidation/i);
 assert.throws(()=>approvePost(posts,'A',false,{claimIds:['CL-001'],registry}),/Human approval/);
 assert.equal(approvePost(posts,'A',true,{claimIds:['CL-001'],registry}).approvalStatus,'approved');
});
test('mismatched claim provenance blocks approval',()=>{
 const posts=generatePosts(brief,options);
 assert.throws(()=>approvePost(posts,'A',true,{claimIds:['CL-003'],registry}),/do not match/i);
});
