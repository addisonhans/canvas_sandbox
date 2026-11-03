const NOTE_TEXT =
  "Note: This is not your actual grade, this is your grade with added hypothetical assignments";

function initWeightedGradeSandbox() {
  const gradeTable = document.querySelector("#grades_summary tbody");
  if (!gradeTable) return;

  const assignmentGroups = parseAssignmentGroups();

  // Remember what Canvas originally displayed so we can restore it
  const gradeTargets = getGradeTargets();
  const originalGrades = gradeTargets.map((el) => el.textContent);
  const notes = createNotes(gradeTargets);

  // Control row: the "Add" button lives here, and new rows appear right under it
  const controlRow = document.createElement("tr");
  controlRow.className = "sandbox-control-row";
  controlRow.innerHTML = `
    <td colspan="5" style="padding: 10px;">
      <button id="add-sandbox-row" type="button" class="btn btn-primary">+ Add Hypothetical Assignment</button>
    </td>
  `;
  gradeTable.insertBefore(controlRow, gradeTable.firstChild);

  let lastInserted = controlRow;

  const update = () =>
    recalculateWeightedGrade(assignmentGroups, gradeTargets, originalGrades, notes);

  document.getElementById("add-sandbox-row").addEventListener("click", () => {
    const newRow = document.createElement("tr");
    // Own class (not Canvas's "student_assignment") so Canvas scripts don't touch it
    newRow.className = "sandbox-row";

    let groupOptions = Object.keys(assignmentGroups)
      .map((name) => `<option value="${name.replace(/"/g, "&quot;")}">${name}</option>`)
      .join("");
    if (!groupOptions) {
      groupOptions = `<option value="Default">All Assignments (Unweighted)</option>`;
    }

    newRow.innerHTML = `
      <td class="title">
        <div style="font-weight: bold; margin-bottom: 4px;">Hypothetical Assignment</div>
        <select class="sandbox-group-select" style="max-width: 100%;">
          ${groupOptions}
        </select>
      </td>
      <td class="due">---</td>
      <td class="status"></td>
      <td class="assignment_score">
        <div style="display: flex; align-items: center; justify-content: flex-end;">
          <input type="text" class="sandbox-score" value="0" style="width: 50px; text-align: right; margin-right: 5px;">
          <span>/</span>
          <input type="text" class="sandbox-possible" value="100" style="width: 50px; text-align: right; margin-left: 5px;">
          <button type="button" class="sandbox-remove" title="Remove" style="margin-left: 8px; cursor: pointer;">✕</button>
        </div>
      </td>
      <td class="possible">100</td>
    `;

    // Insert directly below the add button (stacking in order of creation)
    lastInserted.after(newRow);
    lastInserted = newRow;

    const scoreInput = newRow.querySelector(".sandbox-score");
    const possibleInput = newRow.querySelector(".sandbox-possible");
    const groupSelect = newRow.querySelector(".sandbox-group-select");
    const staticPossibleCell = newRow.querySelector(".possible");

    const trigger = () => {
      staticPossibleCell.textContent = possibleInput.value || "0";
      update();
    };

    scoreInput.addEventListener("input", trigger);
    possibleInput.addEventListener("input", trigger);
    groupSelect.addEventListener("change", trigger);

    newRow.querySelector(".sandbox-remove").addEventListener("click", () => {
      if (lastInserted === newRow) {
        lastInserted = newRow.previousElementSibling || controlRow;
      }
      newRow.remove();
      update();
    });

    update();
  });
}

// Elements that display the final grade (sidebar + bottom row)
function getGradeTargets() {
  const selectors = [
    "#student-grades-final .grade",
    "#grades_summary .final_grade .grade",
    ".student_assignment.final_grade .grade",
    ".total_grade .grade",
    "#student-grades_final-grade .grade",
  ];
  const found = new Set();
  selectors.forEach((sel) =>
    document.querySelectorAll(sel).forEach((el) => found.add(el))
  );
  return Array.from(found);
}

// Adds a hidden note after each displayed final grade
function createNotes(gradeTargets) {
  return gradeTargets.map((el) => {
    const note = document.createElement("div");
    note.className = "sandbox-note";
    note.textContent = NOTE_TEXT;
    note.style.cssText =
      "display:none; font-size:12px; font-style:italic; color:#a94442; margin-top:4px; font-weight:normal; white-space:normal;";
    // Place after the element's container so it sits near the grade
    const host = el.closest("#student-grades-final") || el.parentElement;
    host.appendChild(note);
    return note;
  });
}

// Read group names + weights from Canvas's assignment-group weighting table
function parseAssignmentGroups() {
  const groups = {};
  const weightRows = document.querySelectorAll(
    "#assignments-weighting tr, .weight-table-row, #group_totals_table tr, table.summary:not(#grades_summary) tr"
  );

  weightRows.forEach((row) => {
    const titleEl = row.querySelector("th, td:first-child");
    const weightEl = row.querySelector("td:last-child");
    if (!titleEl || !weightEl || titleEl === weightEl) return;

    const title = titleEl.textContent.trim();
    const match = weightEl.textContent.trim().match(/([0-9.]+)\s*%/);
    if (match && title.toLowerCase() !== "total") {
      groups[title] = {
        weight: parseFloat(match[1]) / 100,
        earnedPoints: 0,
        possiblePoints: 0,
      };
    }
  });

  return groups;
}

function parseNumber(text) {
  const m = (text || "").match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : NaN;
}

// Read a real assignment's score. Canvas keeps a hidden clean value in .score_value;
// otherwise strip helper text like "Click to test a different score" from .grade.
function getNativeScore(row) {
  const cell = row.querySelector(".assignment_score");
  if (!cell) return NaN;

  const hidden = cell.querySelector(".score_value");
  if (hidden) {
    const n = parseNumber(hidden.textContent);
    if (!isNaN(n)) return n;
  }

  const grade = cell.querySelector(".grade");
  if (grade) {
    const clone = grade.cloneNode(true);
    clone.querySelectorAll(".screenreader-only, .tooltip, i").forEach((e) => e.remove());
    const n = parseNumber(clone.textContent);
    if (!isNaN(n)) return n;
  }
  return NaN;
}

// Read a real assignment's points possible
function getNativePossible(row) {
  const el = row.querySelector("td.possible, .points_possible");
  const n = parseNumber(el ? el.textContent : "");
  if (!isNaN(n)) return n;

  // Fallback: look for "x / y" in the score cell
  const text = (row.querySelector(".assignment_score") || {}).textContent || "";
  const m = text.match(/\/\s*(\d+(\.\d+)?)/);
  return m ? parseFloat(m[1]) : NaN;
}

function normName(s) {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

// Match an assignment's group name to a weighted group (exact, then loose)
function matchGroup(groups, name) {
  const target = normName(name);
  if (!target) return null;
  const keys = Object.keys(groups);
  const exact = keys.find((k) => normName(k) === target);
  if (exact) return exact;
  return keys.find((k) => {
    const nk = normName(k);
    return nk.includes(target) || target.includes(nk);
  }) || null;
}

function recalculateWeightedGrade(assignmentGroups, gradeTargets, originalGrades, notes) {
  for (const key in assignmentGroups) {
    assignmentGroups[key].earnedPoints = 0;
    assignmentGroups[key].possiblePoints = 0;
  }

  const hasWeights = Object.keys(assignmentGroups).length > 0;
  let unweightedEarned = 0;
  let unweightedPossible = 0;
  let sandboxCount = 0;
  let nativeCount = 0;
  let unmatchedNative = 0;

  const rows = document.querySelectorAll(
    "#grades_summary tbody tr.student_assignment, #grades_summary tbody tr.sandbox-row"
  );

  rows.forEach((row) => {
    // Skip Canvas's group-total / final-grade summary rows
    if (row.classList.contains("group_total") || row.classList.contains("final_grade")) return;

    let earned;
    let possible;
    let category = "";

    if (row.classList.contains("sandbox-row")) {
      sandboxCount++;
      earned = parseFloat(row.querySelector(".sandbox-score").value);
      possible = parseFloat(row.querySelector(".sandbox-possible").value);
      if (isNaN(earned)) earned = 0;
      if (isNaN(possible)) possible = 0;
      category = row.querySelector(".sandbox-group-select").value;
    } else {
      // Native row: skip if not graded / excused
      if (row.classList.contains("excused")) return;

      earned = getNativeScore(row);
      possible = getNativePossible(row);
      if (isNaN(earned) || isNaN(possible)) return; // ungraded or non-numeric

      nativeCount++;
      const contextEl = row.querySelector(".context");
      category = contextEl ? contextEl.textContent.trim() : "";
    }

    unweightedEarned += earned;
    unweightedPossible += possible;

    if (hasWeights) {
      const key = matchGroup(assignmentGroups, category);
      if (key) {
        assignmentGroups[key].earnedPoints += earned;
        assignmentGroups[key].possiblePoints += possible;
      } else if (!row.classList.contains("sandbox-row")) {
        unmatchedNative++;
      }
    }
  });

  console.log("[Canvas Grade Sandbox]", {
    nativeCount,
    sandboxCount,
    unmatchedNative,
    groups: Object.keys(assignmentGroups),
  });

  // No hypotheticals: restore Canvas's real grade and hide the note
  if (sandboxCount === 0) {
    gradeTargets.forEach((el, i) => (el.textContent = originalGrades[i]));
    notes.forEach((n) => (n.style.display = "none"));
    return;
  }

  let finalPercentage = 0;

  // If some real assignments couldn't be matched to a weighted group, weighting would
  // silently drop them, so fall back to total points across everything instead.
  if (hasWeights && unmatchedNative === 0) {
    let totalWeightUsed = 0;
    let weightedScoreSum = 0;

    for (const key in assignmentGroups) {
      const g = assignmentGroups[key];
      if (g.possiblePoints > 0) {
        weightedScoreSum += (g.earnedPoints / g.possiblePoints) * g.weight;
        totalWeightUsed += g.weight;
      }
    }
    finalPercentage = totalWeightUsed > 0 ? (weightedScoreSum / totalWeightUsed) * 100 : 0;
  } else {
    finalPercentage = unweightedPossible > 0 ? (unweightedEarned / unweightedPossible) * 100 : 0;
  }

  const display = `${finalPercentage.toFixed(2)}%`;
  gradeTargets.forEach((el) => (el.textContent = display));
  notes.forEach((n) => (n.style.display = "block"));
}

initWeightedGradeSandbox();