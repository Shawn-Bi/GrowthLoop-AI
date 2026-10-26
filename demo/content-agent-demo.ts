import { generatePosts } from "../lib/content-agent/generate-posts";
import { startRevisionLoop, revisePosts } from "../lib/content-agent/revision-loop";
import { approvePost } from "../lib/content-agent/approve-posts";

const brief = {
  audience: "Brooklyn residents",
  campaignGoal: "Increase community wellness participation",
  keyMessage: "Free wellness workshops are available",
  approvedClaims: ["Workshops are free"],
};

function section(title: string) {
  console.log("\n" + "=".repeat(55));
  console.log(title);
  console.log("=".repeat(55));
}

section("GROWTHLOOP AI — CONTENT AGENT DEMO");

section("1. CAMPAIGN BRIEF");
console.log(JSON.stringify(brief, null, 2));

section("2. GENERATE A/B DRAFTS");
const posts = generatePosts(brief);
for (const post of posts) {
  console.log(`\nDRAFT ${post.id}`);
  console.log(post.content);
  console.log("Content DNA:", JSON.stringify(post.contentDna, null, 2));
  console.log("Approval:", post.approvalStatus);
}

section("3. HUMAN FEEDBACK AND REVISION");
const initial = startRevisionLoop(brief);
const revised = revisePosts(initial, brief, "Make it shorter");
console.log("Revision cycle:", revised.currentCycle);
for (const post of revised.history.at(-1)!.posts) {
  console.log(`\nREVISED DRAFT ${post.id}`);
  console.log(post.content);
}

section("4. HUMAN APPROVAL SAFEGUARD");
try {
  approvePost(posts, "A", false);
} catch (error) {
  console.log("Unauthorized approval blocked:", (error as Error).message);
}

const approved = approvePost(posts, "A", true);
console.log("Human-approved draft:", approved.id);
console.log("Status:", approved.approvalStatus);

section("5. DEMO SUMMARY");
console.log("Two distinct A/B drafts generated.");
console.log("Content DNA assigned to both drafts.");
console.log("Feedback applied and revision history preserved.");
console.log("Human approval required before approval.");
console.log("Content Agent demonstration complete.");
