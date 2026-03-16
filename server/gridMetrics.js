function countTrue(grid) {
  let total = 0;
  for (const row of grid || []) {
    for (const cell of row || []) {
      if (cell) total += 1;
    }
  }
  return total;
}

function countAiOnly(human, ai) {
  let total = 0;
  for (let r = 0; r < Math.max(human.length, ai.length); r++) {
    const humanRow = human[r] || [];
    const aiRow = ai[r] || [];
    for (let c = 0; c < Math.max(humanRow.length, aiRow.length); c++) {
      if (!Boolean(humanRow[c]) && Boolean(aiRow[c])) total += 1;
    }
  }
  return total;
}

function countHumanOnly(human, ai) {
  let total = 0;
  for (let r = 0; r < Math.max(human.length, ai.length); r++) {
    const humanRow = human[r] || [];
    const aiRow = ai[r] || [];
    for (let c = 0; c < Math.max(humanRow.length, aiRow.length); c++) {
      if (Boolean(humanRow[c]) && !Boolean(aiRow[c])) total += 1;
    }
  }
  return total;
}

function countAgreement(human, ai) {
  let total = 0;
  for (let r = 0; r < Math.max(human.length, ai.length); r++) {
    const humanRow = human[r] || [];
    const aiRow = ai[r] || [];
    for (let c = 0; c < Math.max(humanRow.length, aiRow.length); c++) {
      if (Boolean(humanRow[c]) === Boolean(aiRow[c])) total += 1;
    }
  }
  return total;
}

module.exports = {
  countAgreement,
  countAiOnly,
  countHumanOnly,
  countTrue,
};
