import test from "node:test";
import assert from "node:assert/strict";
import { mockSolutions } from "../src/mocks/solutions.ts";
import {
  SOLUTION_DESTINATIONS,
  solutionRoute,
  solutionVisualCode,
} from "../src/config/solutionPresentation.ts";

test("solution catalog exposes the implemented products including orders", () => {
  assert.deepEqual(
    mockSolutions.map((solution) => solution.code).sort(),
    ["admin_messages", "autopost", "booking", "leads", "orders"],
  );
  assert.equal(mockSolutions.some((solution) => solution.code === "sales"), false);
});

test("every catalog solution opens its operational workspace", () => {
  for (const solution of mockSolutions) {
    assert.equal(solutionRoute(solution.code), SOLUTION_DESTINATIONS[solution.code]);
    assert.notEqual(solutionRoute(solution.code), "/solutions");
  }
  assert.equal(solutionVisualCode("admin_messages"), "sales");
  assert.equal(solutionRoute("future_solution"), "/solutions");
});
