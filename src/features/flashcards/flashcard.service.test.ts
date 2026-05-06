import { describe, expect, it } from "vitest";

import {
  inferPreviewItemTypes,
  inferTechnicalLanguage,
  isProgrammingFocusedSource,
} from "./flashcard.service";

describe("flashcard programming source detection", () => {
  it("detects C# source and enables programming-heavy item types", () => {
    const noteContent = `
using System;
using System.Collections.Generic;

public class Solution
{
    public static bool ContainsDuplicate(int[] nums)
    {
        HashSet<int> seen = new HashSet<int>();

        foreach (int num in nums)
        {
            if (!seen.Add(num))
            {
                return true;
            }
        }

        return false;
    }
}`;

    expect(isProgrammingFocusedSource(noteContent, "")).toBe(true);
    expect(inferTechnicalLanguage(noteContent)).toBe("C#");
    expect(inferPreviewItemTypes(noteContent, [])).toEqual([
      "Algorithm",
      "CodeReading",
      "OutputPrediction",
      "Debugging",
      "ShortAnswer",
      "Conceptual",
    ]);
  });

  it("detects Java source and enables programming-heavy item types", () => {
    const noteContent = `
import java.util.HashSet;

class Solution {
    public boolean containsDuplicate(int[] nums) {
        HashSet<Integer> seen = new HashSet<>();

        for (int num : nums) {
            if (!seen.add(num)) {
                return true;
            }
        }

        return false;
    }
}`;

    expect(isProgrammingFocusedSource(noteContent, "")).toBe(true);
    expect(inferTechnicalLanguage(noteContent)).toBe("Java");
    expect(inferPreviewItemTypes(noteContent, [])).toContain("Algorithm");
    expect(inferPreviewItemTypes(noteContent, [])).toContain("CodeReading");
    expect(inferPreviewItemTypes(noteContent, [])).toContain("OutputPrediction");
    expect(inferPreviewItemTypes(noteContent, [])).toContain("Debugging");
  });

  it("detects Python source and enables programming-heavy item types", () => {
    const noteContent = `
def contains_duplicate(nums):
    seen = set()

    for num in nums:
        if num in seen:
            return True
        seen.add(num)

    return False`;

    expect(isProgrammingFocusedSource(noteContent, "")).toBe(true);
    expect(inferTechnicalLanguage(noteContent)).toBe("Python");
    expect(inferPreviewItemTypes(noteContent, [])).toContain("Algorithm");
    expect(inferPreviewItemTypes(noteContent, [])).toContain("Debugging");
  });

  it("keeps old defaults for non-programming source material", () => {
    const noteContent = "The Treaty of Versailles reshaped European politics after World War I and imposed penalties on Germany.";

    expect(isProgrammingFocusedSource(noteContent, "")).toBe(false);
    expect(inferTechnicalLanguage(noteContent)).toBe("");
    expect(inferPreviewItemTypes(noteContent, [])).toEqual([
      "Flashcard",
      "Conceptual",
      "ShortAnswer",
      "MultipleChoice",
    ]);
  });
});
