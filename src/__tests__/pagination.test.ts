import { adminPageParams, adminPageMeta } from "../routes/admin";

// These two small helpers (used by every admin list endpoint  crud(),
// /users, /evaluations, /certificates, /notifications, /leaderboard) are
// the one part of the pagination work that's pure logic and cleanly
// testable without a real database. The actual end-to-end correctness of
// paginated queries themselves (right documents, right page, right total)
// was verified manually against the real dev database while building
// Phase 3 (see the session's own cursor-pagination cross-check against
// live notification data) rather than re-proven here.
describe("admin pagination helpers", () => {
  describe("adminPageParams", () => {
    it("is not paginated when neither page nor limit is present, defaulting to the flat top-200 behavior", () => {
      const { isPaginated, pageSize, pageNumber } = adminPageParams({ query: {} });
      expect(isPaginated).toBe(false);
      expect(pageSize).toBe(200);
      expect(pageNumber).toBe(1);
    });

    it("opts into pagination when page or limit is present", () => {
      expect(adminPageParams({ query: { page: "2" } }).isPaginated).toBe(true);
      expect(adminPageParams({ query: { limit: "10" } }).isPaginated).toBe(true);
    });

    it("clamps limit to [1, 200] and page to >= 1", () => {
      // "0" is falsy, so `Number(limit) || ADMIN_DEFAULT_LIMIT` falls back
      // to the 200 default rather than clamping to the floor  the same
      // `Number(x) || default` pattern this helper shares with
      // courseController/quizController's pagination, applied consistently
      // (not a bug specific to this helper).
      expect(adminPageParams({ query: { limit: "0" } }).pageSize).toBe(200);
      expect(adminPageParams({ query: { limit: "-5" } }).pageSize).toBe(1); // negative, not falsy, so it clamps
      expect(adminPageParams({ query: { limit: "9999" } }).pageSize).toBe(200);
      expect(adminPageParams({ query: { page: "0" } }).pageNumber).toBe(1); // "0" falls back to the default of 1
      expect(adminPageParams({ query: { page: "-5" } }).pageNumber).toBe(1);
    });

    it("falls back to defaults on non-numeric input rather than producing NaN", () => {
      const { pageSize, pageNumber } = adminPageParams({ query: { page: "abc", limit: "xyz" } });
      expect(Number.isNaN(pageSize)).toBe(false);
      expect(Number.isNaN(pageNumber)).toBe(false);
      expect(pageNumber).toBe(1);
    });
  });

  describe("adminPageMeta", () => {
    it("returns an empty object when not paginated, matching today's un-paginated response shape exactly", () => {
      expect(adminPageMeta(false, 1, 200, undefined)).toEqual({});
    });

    it("reports hasMore correctly across a page boundary", () => {
      expect(adminPageMeta(true, 1, 10, 25)).toEqual({ page: 1, limit: 10, total: 25, hasMore: true });
      expect(adminPageMeta(true, 3, 10, 25)).toEqual({ page: 3, limit: 10, total: 25, hasMore: false });
    });

    it("treats a missing total as zero results rather than throwing", () => {
      expect(adminPageMeta(true, 1, 10, undefined)).toEqual({ page: 1, limit: 10, total: undefined, hasMore: false });
    });
  });
});
