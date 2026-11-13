import { describe, expect, it } from "vitest";
import { historyCommunityScoreForSession } from "@/lib/historyRules";

// S10 WP4a review (Kim C5): a history row written while a GROUP session is still
// open (deleting an open session does it) carries no community score.
describe("historyCommunityScoreForSession", () => {
  const agg = { communityScore: 83.5, participantCount: 4 };
  it("null for an open group session, whatever the stored aggregate says", () => {
    expect(historyCommunityScoreForSession(agg, { isGroup: true, status: "active" })).toBeNull();
    expect(historyCommunityScoreForSession(agg, { isGroup: true, status: "open" })).toBeNull();
  });
  it("the stored score for a closed group session", () => {
    expect(historyCommunityScoreForSession(agg, { isGroup: true, status: "closed" })).toBe(83.5);
  });
  it("solo sessions are unchanged (open or closed)", () => {
    expect(historyCommunityScoreForSession(agg, { isGroup: false, status: "active" })).toBe(83.5);
    expect(historyCommunityScoreForSession(agg, { isGroup: false, status: "closed" })).toBe(83.5);
  });
  it("still null without an included evaluation", () => {
    expect(historyCommunityScoreForSession({ communityScore: 0, participantCount: 0 }, { isGroup: false, status: "closed" })).toBeNull();
    expect(historyCommunityScoreForSession(null, { isGroup: true, status: "closed" })).toBeNull();
  });
});
