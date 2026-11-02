import bannedPhrasesFile from "@/data/seed/banned_phrases.json";
import briefFile from "@/data/seed/brief.json";
import icpFile from "@/data/seed/icp.json";
import { bannedPhrasesFileSchema, briefFileSchema, icpFileSchema } from "@/schemas/seed";

// Read-only GrantReady context (GL-02). Static imports bundle these files
// into the server functions. The claim registry lives in the database.
export const grantReadyBrief = briefFileSchema.parse(briefFile);
export const grantReadyIcp = icpFileSchema.parse(icpFile);
export const bannedPhrases = bannedPhrasesFileSchema.parse(bannedPhrasesFile).phrases;
