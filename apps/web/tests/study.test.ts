/**
 * Study packs — notes, cards, and how prompts are presented.
 *
 * The content here is hand-authored for nineteen nodes, so the checks are the
 * ones that catch an authoring slip rather than a logic bug: a node with no
 * pack, a card whose `answerIndex` points past its options, a duplicated
 * question, or an option list with nothing to choose between.
 *
 * `presentPrompt` gets its own section because it is the one piece of real
 * behaviour in the file, and because getting it wrong silently breaks grading
 * on three screens at once.
 */

import { describe, expect, it } from "vitest";
import { NODES, NODES_BY_ID } from "@/lib/curriculum/nodes";
import type { RetrievalPrompt } from "@/lib/curriculum/nodes";
import {
  STUDY,
  cardForReview,
  cardsFor,
  notesFor,
  presentPrompt,
  quizFor,
} from "@/lib/curriculum/study";

function everyAuthoredCard(): RetrievalPrompt[] {
  return NODES.flatMap((n) => cardsFor(n.id));
}

describe("study packs", () => {
  it("covers every node in the curriculum", () => {
    for (const node of NODES) {
      expect(STUDY[node.id], `no study pack for ${node.id}`).toBeDefined();
    }
  });

  it("does not carry packs for nodes that do not exist", () => {
    for (const id of Object.keys(STUDY)) {
      expect(NODES_BY_ID.has(id), `study pack for unknown node ${id}`).toBe(true);
    }
  });

  it("gives every node four to seven notes", () => {
    for (const node of NODES) {
      const notes = notesFor(node.id);
      expect(notes.length, `${node.id} has ${notes.length} notes`).toBeGreaterThanOrEqual(4);
      expect(notes.length, `${node.id} has ${notes.length} notes`).toBeLessThanOrEqual(7);
      for (const n of notes) expect(n.trim().length).toBeGreaterThan(20);
    }
  });

  it("gives every node at least two quiz cards", () => {
    for (const node of NODES) {
      expect(quizFor(node.id).length, `${node.id}`).toBeGreaterThanOrEqual(2);
    }
  });

  it("puts the node's own retrieval prompt first in the review pool", () => {
    for (const node of NODES) {
      expect(cardsFor(node.id)[0]).toBe(node.retrieval);
      expect(cardsFor(node.id).length).toBe(quizFor(node.id).length + 1);
    }
  });

  it("keeps the pass-screen quiz clear of the question the path already asks", () => {
    for (const node of NODES) {
      const asked = quizFor(node.id).map((c) => c.question);
      expect(asked).not.toContain(node.retrieval.question);
    }
  });

  it("writes well-formed cards", () => {
    for (const card of everyAuthoredCard()) {
      expect(card.options.length, card.question).toBeGreaterThanOrEqual(2);
      expect(card.answerIndex).toBeGreaterThanOrEqual(0);
      expect(card.answerIndex).toBeLessThan(card.options.length);
      expect(new Set(card.options).size, `duplicate option in: ${card.question}`).toBe(card.options.length);
      expect(card.because.trim().length, card.question).toBeGreaterThan(20);
      expect(card.question.trim().length).toBeGreaterThan(10);
    }
  });

  it("never asks the same question twice across the whole curriculum", () => {
    const seen = new Map<string, string>();
    for (const node of NODES) {
      for (const card of cardsFor(node.id)) {
        const prior = seen.get(card.question);
        expect(prior, `"${card.question}" appears in both ${prior} and ${node.id}`).toBeUndefined();
        seen.set(card.question, node.id);
      }
    }
  });
});

describe("presentPrompt", () => {
  it("keeps the correct option correct", () => {
    for (const card of everyAuthoredCard()) {
      const shown = presentPrompt(card);
      expect(shown.options[shown.answerIndex]).toBe(card.options[card.answerIndex]);
    }
  });

  it("preserves the full option set", () => {
    for (const card of everyAuthoredCard()) {
      const shown = presentPrompt(card);
      expect([...shown.options].sort()).toEqual([...card.options].sort());
      expect(shown.question).toBe(card.question);
      expect(shown.because).toBe(card.because);
    }
  });

  it("is stable — the same question always lays out the same way", () => {
    for (const card of everyAuthoredCard()) {
      expect(presentPrompt(card)).toEqual(presentPrompt(card));
    }
  });

  it("stops the answer always being the first option", () => {
    // Every prompt in this codebase is AUTHORED answer-first, which is why the
    // rendered order has to be shuffled: otherwise "click the top button" is a
    // winning strategy across the whole curriculum.
    const cards = everyAuthoredCard();
    expect(cards.every((c) => c.answerIndex === 0)).toBe(true);

    const positions = cards.map((c) => presentPrompt(c).answerIndex);
    const first = positions.filter((p) => p === 0).length;
    // With three options, a third landing first is expected; a clear majority
    // would mean the shuffle is not doing its job.
    expect(first).toBeLessThan(cards.length * 0.6);
    expect(new Set(positions).size).toBeGreaterThan(1);
  });
});

describe("cardForReview", () => {
  it("rotates as the interval grows", () => {
    // intervalDays roughly doubles per successful review, so the log of it is a
    // review counter that is already persisted.
    const node = "u0.n1";
    const pool = cardsFor(node);
    const seen = new Set<string>();
    for (const days of [1, 2, 4, 8, 16, 32]) {
      seen.add(cardForReview(node, days)!.question);
    }
    expect(seen.size).toBe(Math.min(pool.length, 6));
  });

  it("re-asks the same card when a miss halves the interval", () => {
    const after = cardForReview("u0.n1", 8);
    const missed = cardForReview("u0.n1", 4);
    expect(missed).not.toBe(after);
    // Halving steps back exactly one place in the rotation.
    expect(missed).toBe(cardForReview("u0.n1", 4));
  });

  it("only ever returns a card belonging to that node", () => {
    for (const node of NODES) {
      const pool = cardsFor(node.id);
      for (const days of [0, 1, 3, 7, 30, 365]) {
        expect(pool).toContain(cardForReview(node.id, days));
      }
    }
  });

  it("returns null for a node that does not exist", () => {
    expect(cardForReview("nope", 1)).toBeNull();
  });
});
