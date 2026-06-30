const QUESTIONS_URL = "./outputs/xuexitong_exam_export/questions.json";
const STORAGE_KEY = "final_review_exam_state_v1";

const TYPE_WEIGHTS = {
  single: 5,
  multiple: 3,
  judge: 2,
};

const dom = {
  statTotal: document.getElementById("stat-total"),
  statWrong: document.getElementById("stat-wrong"),
  statAnswered: document.getElementById("stat-answered"),
  availableNormal: document.getElementById("available-normal"),
  availableWrong: document.getElementById("available-wrong"),
  latestScore: document.getElementById("latest-score"),
  modeHint: document.getElementById("mode-hint"),
  modeCards: [...document.querySelectorAll(".mode-card")],
  countInput: document.getElementById("question-count-input"),
  startExamBtn: document.getElementById("start-exam-btn"),
  resetRecordsBtn: document.getElementById("reset-records-btn"),
  clearWrongbookBtn: document.getElementById("clear-wrongbook-btn"),
  submitExamTriggers: [...document.querySelectorAll(".submit-exam-trigger")],
  configPanel: document.getElementById("config-panel"),
  examPanel: document.getElementById("exam-panel"),
  resultPanel: document.getElementById("result-panel"),
  examModeLabel: document.getElementById("exam-mode-label"),
  examProgressLabel: document.getElementById("exam-progress-label"),
  examProgressFill: document.getElementById("exam-progress-fill"),
  questionType: document.getElementById("question-type"),
  questionText: document.getElementById("question-text"),
  optionsList: document.getElementById("options-list"),
  answerFeedback: document.getElementById("answer-feedback"),
  prevQuestionBtn: document.getElementById("prev-question-btn"),
  nextQuestionBtn: document.getElementById("next-question-btn"),
  submitExamBtn: document.getElementById("submit-exam-btn"),
  questionIndex: document.getElementById("question-index"),
  examSubmitHint: document.getElementById("exam-submit-hint"),
  resultScore: document.getElementById("result-score"),
  resultAccuracy: document.getElementById("result-accuracy"),
  resultWrongCount: document.getElementById("result-wrong-count"),
  resultReviewList: document.getElementById("result-review-list"),
  restartBtn: document.getElementById("restart-btn"),
  wrongbookList: document.getElementById("wrongbook-list"),
  optionTemplate: document.getElementById("option-template"),
};

const state = {
  mode: "normal",
  questions: [],
  records: {},
  sessions: [],
  exam: null,
};

init().catch((error) => {
  console.error(error);
  alert("题库加载失败，请确认 questions.json 存在且本页面通过本地服务器打开。");
});

async function init() {
  if (new URL(window.location.href).searchParams.get("reset") === "1") {
    localStorage.removeItem(STORAGE_KEY);
    window.history.replaceState({}, "", window.location.pathname);
  }

  const response = await fetch(QUESTIONS_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load question bank: ${response.status}`);
  }

  const rawQuestions = await response.json();
  state.questions = rawQuestions
    .map(normalizeQuestion)
    .filter((question) => question && question.id != null);

  hydrateRecords();
  bindEvents();
  updateModeUI();
  updateDashboard();
  renderWrongbook();
}

function normalizeQuestion(raw) {
  const optionKeys = ["A", "B", "C", "D", "E", "F"];
  const type = cleanText(raw.type || "未知题型");
  const options = optionKeys
    .map((key) => ({
      key,
      text: cleanText(raw[key] ?? ""),
    }))
    .filter((item) => item.text);

  return {
    id: Number(raw.id),
    type,
    bucket: detectTypeBucket(type),
    score: Number(raw.score || 1),
    question: cleanText(raw.question || ""),
    options,
    answer: cleanAnswer(raw.answer || ""),
    explanation: cleanText(raw.explanation || ""),
    knowledgePoint: cleanText(raw.knowledge_point || ""),
    initialWrong: cleanText(raw.is_wrong || "") === "是",
  };
}

function detectTypeBucket(type) {
  if (type.includes("多选")) {
    return "multiple";
  }
  if (type.includes("判断")) {
    return "judge";
  }
  if (type.includes("单选")) {
    return "single";
  }
  return "single";
}

function cleanText(value) {
  return String(value ?? "").replace(/\r/g, "").trim();
}

function cleanAnswer(value) {
  return cleanText(value).replace(/\s+/g, "");
}

function answerParts(answer) {
  const normalized = cleanText(answer)
    .replace(/[，、;；/|]/g, ",")
    .replace(/\s+/g, ",");

  return normalized
    .split(",")
    .map((part) => part.trim())
    .flatMap((part) => (/^[A-H]{2,}$/i.test(part) ? part.toUpperCase().split("") : [part]))
    .filter(Boolean);
}

function hydrateRecords() {
  const saved = loadStorage();
  state.records = {};

  for (const question of state.questions) {
    const savedRecord = saved.records?.[question.id] || {};
    state.records[question.id] = {
      wrongCount: Number(savedRecord.wrongCount || 0),
      correctCount: Number(savedRecord.correctCount || 0),
      lastResult: savedRecord.lastResult || "",
      inWrongBook:
        typeof savedRecord.inWrongBook === "boolean"
          ? savedRecord.inWrongBook
          : question.initialWrong,
    };

    if (!saved.records?.[question.id] && question.initialWrong) {
      state.records[question.id].wrongCount = Math.max(1, state.records[question.id].wrongCount);
      state.records[question.id].lastResult = "wrong";
    }
  }

  state.sessions = Array.isArray(saved.sessions) ? saved.sessions.slice(0, 20) : [];
  persistState();
}

function loadStorage() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch (_error) {
    return {};
  }
}

function persistState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      records: state.records,
      sessions: state.sessions,
    }),
  );
}

function bindEvents() {
  dom.modeCards.forEach((card) => {
    card.addEventListener("click", () => {
      state.mode = card.dataset.mode;
      updateModeUI();
    });
  });

  dom.startExamBtn.addEventListener("click", startExam);
  dom.prevQuestionBtn.addEventListener("click", () => navigateQuestion(-1));
  dom.nextQuestionBtn.addEventListener("click", () => navigateQuestion(1));
  dom.submitExamTriggers.forEach((button) => button.addEventListener("click", submitExam));
  dom.restartBtn.addEventListener("click", finishReview);
  dom.resetRecordsBtn.addEventListener("click", resetAllRecords);
  dom.clearWrongbookBtn.addEventListener("click", clearWrongbook);
}

function updateModeUI() {
  dom.modeCards.forEach((card) => {
    card.classList.toggle("active", card.dataset.mode === state.mode);
  });

  dom.modeHint.textContent =
    state.mode === "normal"
      ? "普通考试会自动跳过当前错题池中的题。"
      : "错题专项只从错题池抽题，答对后会移出错题池。";
}

function updateDashboard() {
  const wrongCount = getWrongQuestions().length;
  const answeredCount = Object.values(state.records).reduce(
    (sum, record) => sum + record.correctCount + record.wrongCount,
    0,
  );
  const latestSession = state.sessions[0];

  dom.statTotal.textContent = String(state.questions.length);
  dom.statWrong.textContent = String(wrongCount);
  dom.statAnswered.textContent = String(answeredCount);
  dom.availableNormal.textContent = String(getNormalQuestions().length);
  dom.availableWrong.textContent = String(wrongCount);
  dom.latestScore.textContent = latestSession
    ? `${latestSession.correctCount} / ${latestSession.totalCount}`
    : "暂无";
}

function getNormalQuestions() {
  return state.questions.filter((question) => !state.records[question.id]?.inWrongBook);
}

function getWrongQuestions() {
  return state.questions.filter((question) => state.records[question.id]?.inWrongBook);
}

function startExam() {
  const count = Number(dom.countInput.value);
  if (!Number.isInteger(count) || count <= 0) {
    alert("请输入大于 0 的抽题数量。");
    return;
  }

  const pool = state.mode === "wrong" ? getWrongQuestions() : getNormalQuestions();
  if (!pool.length) {
    alert(state.mode === "wrong" ? "错题池为空，先去普通模式做题。" : "普通模式可抽题为空。");
    return;
  }

  const selected = pickQuestionsByRatio(pool, Math.min(count, pool.length));
  state.exam = {
    mode: state.mode,
    currentIndex: 0,
    questions: selected,
    answers: {},
    results: {},
  };

  dom.configPanel.classList.add("hidden");
  dom.resultPanel.classList.add("hidden");
  dom.examPanel.classList.remove("hidden");
  renderExam();
}

function shuffle(items) {
  const array = [...items];
  for (let index = array.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [array[index], array[randomIndex]] = [array[randomIndex], array[index]];
  }
  return array;
}

function pickQuestionsByRatio(pool, targetCount) {
  const grouped = {
    single: shuffle(pool.filter((question) => question.bucket === "single")),
    multiple: shuffle(pool.filter((question) => question.bucket === "multiple")),
    judge: shuffle(pool.filter((question) => question.bucket === "judge")),
  };

  const keys = Object.keys(TYPE_WEIGHTS);
  const totalWeight = keys.reduce((sum, key) => sum + TYPE_WEIGHTS[key], 0);
  const targetByType = {};
  let assigned = 0;

  keys.forEach((key) => {
    const idealCount = (targetCount * TYPE_WEIGHTS[key]) / totalWeight;
    const baseCount = Math.min(grouped[key].length, Math.floor(idealCount));
    targetByType[key] = baseCount;
    assigned += baseCount;
  });

  let remaining = targetCount - assigned;
  while (remaining > 0) {
    const candidates = keys
      .map((key) => ({
        key,
        room: grouped[key].length - targetByType[key],
        remainder: (targetCount * TYPE_WEIGHTS[key]) / totalWeight - targetByType[key],
      }))
      .filter((item) => item.room > 0)
      .sort((left, right) => right.remainder - left.remainder);

    if (!candidates.length) {
      break;
    }

    for (const candidate of candidates) {
      if (remaining === 0) {
        break;
      }
      if (targetByType[candidate.key] < grouped[candidate.key].length) {
        targetByType[candidate.key] += 1;
        remaining -= 1;
      }
    }
  }

  const selected = [];
  const selectedIds = new Set();

  keys.forEach((key) => {
    grouped[key].slice(0, targetByType[key]).forEach((question) => {
      if (!selectedIds.has(question.id)) {
        selected.push(question);
        selectedIds.add(question.id);
      }
    });
  });

  if (selected.length < targetCount) {
    shuffle(pool).forEach((question) => {
      if (selected.length >= targetCount) {
        return;
      }
      if (!selectedIds.has(question.id)) {
        selected.push(question);
        selectedIds.add(question.id);
      }
    });
  }

  return shuffle(selected);
}

function renderExam() {
  const exam = state.exam;
  if (!exam) {
    return;
  }

  const question = exam.questions[exam.currentIndex];
  const result = exam.results[question.id];
  const correctKeys = normalizeAnswerToKeys(question, question.answer);
  dom.examModeLabel.textContent = exam.mode === "wrong" ? "错题专项" : "普通考试";
  dom.examProgressLabel.textContent = `第 ${exam.currentIndex + 1} / ${exam.questions.length} 题`;
  dom.examProgressFill.style.width = `${((exam.currentIndex + 1) / exam.questions.length) * 100}%`;
  dom.questionType.textContent = `${question.type} · ${question.score} 分`;
  dom.questionText.textContent = question.question;

  dom.optionsList.innerHTML = "";
  for (const option of question.options) {
    const fragment = dom.optionTemplate.content.cloneNode(true);
    const label = fragment.querySelector(".option-item");
    const input = fragment.querySelector("input");
    const badge = fragment.querySelector(".option-badge");
    const text = fragment.querySelector(".option-text");

    input.type = question.bucket === "multiple" ? "checkbox" : "radio";
    input.name = question.bucket === "multiple" ? `question-option-${question.id}` : "question-option";
    input.value = option.key;
    input.checked = isOptionSelected(question, option.key);
    input.disabled = Boolean(result);
    input.addEventListener("change", () => {
      if (state.exam.results[question.id]) {
        return;
      }
      updateAnswerSelection(question, option.key, input.checked);
      maybeGradeQuestion(question);
      renderQuestionIndex();
      renderExam();
    });

    badge.textContent = option.key;
    text.textContent = option.text;
    label.classList.toggle("selected", input.checked);
    label.classList.toggle("locked", Boolean(result));
    label.classList.toggle("correct", Boolean(result) && correctKeys.includes(option.key));
    label.classList.toggle("wrong", Boolean(result) && input.checked && !correctKeys.includes(option.key));
    dom.optionsList.appendChild(fragment);
  }

  renderAnswerFeedback(question);

  dom.prevQuestionBtn.disabled = exam.currentIndex === 0;
  dom.nextQuestionBtn.disabled = exam.currentIndex === exam.questions.length - 1;
  const answeredCount = Object.keys(exam.results).length;
  dom.examSubmitHint.textContent = `已作答 ${answeredCount} / ${exam.questions.length} 题`;
  renderQuestionIndex();
}

function renderAnswerFeedback(question) {
  const result = state.exam?.results?.[question.id];
  if (!result) {
    dom.answerFeedback.className = "answer-feedback hidden";
    dom.answerFeedback.innerHTML = "";
    return;
  }

  dom.answerFeedback.className = `answer-feedback ${result.isCorrect ? "right" : "wrong"}`;
  dom.answerFeedback.innerHTML = result.isCorrect
    ? "<strong>答对了</strong>"
    : `<strong>答错了</strong><br>正确答案：${escapeHtml(formatAnswerText(question, question.answer))}`;
}

function renderQuestionIndex() {
  const exam = state.exam;
  if (!exam) {
    return;
  }

  dom.questionIndex.innerHTML = "";
  exam.questions.forEach((question, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "index-btn";
    button.textContent = String(index + 1);

    if (index === exam.currentIndex) {
      button.classList.add("current");
    }
    if (exam.results[question.id]) {
      button.classList.add("answered");
    }

    button.addEventListener("click", () => {
      if (gradePendingMultipleQuestion()) {
        return;
      }
      exam.currentIndex = index;
      renderExam();
    });
    dom.questionIndex.appendChild(button);
  });
}

function navigateQuestion(delta) {
  if (gradePendingMultipleQuestion()) {
    return;
  }
  moveQuestion(delta);
}

function moveQuestion(delta) {
  if (!state.exam) {
    return;
  }
  const nextIndex = state.exam.currentIndex + delta;
  if (nextIndex < 0 || nextIndex >= state.exam.questions.length) {
    return;
  }
  state.exam.currentIndex = nextIndex;
  renderExam();
}

function submitExam() {
  const exam = state.exam;
  if (!exam) {
    return;
  }

  const review = exam.questions.map((question) => {
    const graded = exam.results[question.id];
    const userAnswer = graded ? graded.userAnswer : getStoredAnswer(question);
    const isCorrect = graded ? graded.isCorrect : answersEqual(question, userAnswer, question.answer);
    return {
      question,
      userAnswer,
      isCorrect,
    };
  });

  let correctCount = 0;
  for (const item of review) {
    const record = state.records[item.question.id];
    if (item.isCorrect) {
      correctCount += 1;
      record.correctCount += 1;
      record.lastResult = "right";
      if (exam.mode === "wrong") {
        record.inWrongBook = false;
      }
    } else {
      record.wrongCount += 1;
      record.lastResult = "wrong";
      record.inWrongBook = true;
    }
  }

  state.sessions.unshift({
    date: new Date().toISOString(),
    mode: exam.mode,
    totalCount: exam.questions.length,
    correctCount,
  });
  state.sessions = state.sessions.slice(0, 20);
  persistState();

  renderResult(review, correctCount, exam.questions.length);
  updateDashboard();
  renderWrongbook();

  dom.examPanel.classList.add("hidden");
  dom.resultPanel.classList.remove("hidden");
}

function renderResult(review, correctCount, totalCount) {
  const wrongCount = totalCount - correctCount;
  const accuracy = totalCount ? Math.round((correctCount / totalCount) * 100) : 0;

  dom.resultScore.textContent = `${correctCount} / ${totalCount}`;
  dom.resultAccuracy.textContent = `${accuracy}%`;
  dom.resultWrongCount.textContent = String(wrongCount);

  dom.resultReviewList.innerHTML = "";
  review.forEach((item) => {
    const card = document.createElement("article");
    card.className = `review-card ${item.isCorrect ? "right" : "wrong"}`;
    card.innerHTML = `
      <div class="review-meta">
        <span class="pill ${item.isCorrect ? "right" : "wrong"}">${item.isCorrect ? "答对" : "答错"}</span>
        <span>${item.question.type}</span>
      </div>
      <strong>${item.question.id}. ${escapeHtml(item.question.question)}</strong>
      <p>你的答案：${escapeHtml(formatAnswerText(item.question, item.userAnswer) || "未作答")}</p>
      <p>正确答案：${escapeHtml(formatAnswerText(item.question, item.question.answer))}</p>
      ${item.question.explanation ? `<p>解析：${escapeHtml(item.question.explanation)}</p>` : ""}
    `;
    dom.resultReviewList.appendChild(card);
  });
}

function finishReview() {
  state.exam = null;
  dom.resultPanel.classList.add("hidden");
  dom.examPanel.classList.add("hidden");
  dom.configPanel.classList.remove("hidden");
  updateDashboard();
}

function renderWrongbook() {
  const wrongQuestions = getWrongQuestions();
  dom.wrongbookList.innerHTML = "";

  if (!wrongQuestions.length) {
    dom.wrongbookList.innerHTML = '<p class="empty-state">错题本还是空的，先去做一轮普通考试吧。</p>';
    return;
  }

  wrongQuestions.forEach((question) => {
    const record = state.records[question.id];
    const card = document.createElement("article");
    card.className = "wrongbook-card";
    card.innerHTML = `
      <div class="wrongbook-meta">
        <span>${question.type}</span>
        <span>错 ${record.wrongCount} 次</span>
        <span>对 ${record.correctCount} 次</span>
      </div>
      <strong>${question.id}. ${escapeHtml(question.question)}</strong>
      <p>正确答案：${escapeHtml(formatAnswerText(question, question.answer))}</p>
      ${question.explanation ? `<p>解析：${escapeHtml(question.explanation)}</p>` : ""}
      <div class="wrongbook-actions">
        <button class="danger-link" type="button" data-clear-id="${question.id}">移出错题本</button>
      </div>
    `;
    card.querySelector("[data-clear-id]").addEventListener("click", () => {
      state.records[question.id].inWrongBook = false;
      persistState();
      updateDashboard();
      renderWrongbook();
    });
    dom.wrongbookList.appendChild(card);
  });
}

function clearWrongbook() {
  if (!confirm("确定清空错题本吗？这不会删除题库，只会清除错题状态。")) {
    return;
  }

  Object.values(state.records).forEach((record) => {
    record.inWrongBook = false;
  });
  persistState();
  updateDashboard();
  renderWrongbook();
}

function resetAllRecords() {
  if (!confirm("确定重置全部答题记录吗？错题、成绩、历史都会清空。")) {
    return;
  }

  localStorage.removeItem(STORAGE_KEY);
  state.records = {};
  state.sessions = [];
  state.questions.forEach((question) => {
    state.records[question.id] = {
      wrongCount: 0,
      correctCount: 0,
      lastResult: "",
      inWrongBook: false,
    };
  });
  persistState();
  updateDashboard();
  renderWrongbook();
  finishReview();
}

function formatAnswerText(question, answer) {
  const parts = normalizeAnswerToKeys(question, answer);

  if (!parts.length) {
    return "";
  }

  return parts
    .map((part) => {
      const option = question.options.find((item) => item.key === part);
      return option ? `${option.key}. ${option.text}` : part;
    })
    .join(" / ");
}

function getStoredAnswer(question) {
  const stored = state.exam?.answers?.[question.id];
  if (Array.isArray(stored)) {
    return stored.join(",");
  }
  return cleanAnswer(stored || "");
}

function hasAnswer(question) {
  const stored = state.exam?.answers?.[question.id];
  if (Array.isArray(stored)) {
    return stored.length > 0;
  }
  return Boolean(cleanAnswer(stored || ""));
}

function isOptionSelected(question, optionKey) {
  const stored = state.exam?.answers?.[question.id];
  if (question.bucket === "multiple") {
    return Array.isArray(stored) && stored.includes(optionKey);
  }
  return stored === optionKey;
}

function updateAnswerSelection(question, optionKey, checked) {
  if (!state.exam) {
    return;
  }

  if (question.bucket === "multiple") {
    const selected = Array.isArray(state.exam.answers[question.id])
      ? [...state.exam.answers[question.id]]
      : [];

    if (checked) {
      if (!selected.includes(optionKey)) {
        selected.push(optionKey);
      }
    } else {
      const next = selected.filter((key) => key !== optionKey);
      state.exam.answers[question.id] = next;
      return;
    }

    selected.sort();
    state.exam.answers[question.id] = selected;
    return;
  }

  state.exam.answers[question.id] = optionKey;
}

function maybeGradeQuestion(question) {
  if (!state.exam || state.exam.results[question.id] || !hasAnswer(question)) {
    return;
  }

  if (question.bucket === "multiple") {
    return;
  }

  gradeQuestion(question);
}

function gradePendingMultipleQuestion() {
  const exam = state.exam;
  if (!exam) {
    return false;
  }

  const question = exam.questions[exam.currentIndex];
  if (question.bucket !== "multiple" || exam.results[question.id] || !hasAnswer(question)) {
    return false;
  }

  gradeQuestion(question);
  renderQuestionIndex();
  renderExam();
  return true;
}

function gradeQuestion(question) {
  const userAnswer = getStoredAnswer(question);
  state.exam.results[question.id] = {
    userAnswer,
    isCorrect: answersEqual(question, userAnswer, question.answer),
  };
}

function answersEqual(question, left, right) {
  const leftParts = normalizeAnswerToKeys(question, left).sort();
  const rightParts = normalizeAnswerToKeys(question, right).sort();
  return leftParts.length === rightParts.length && leftParts.every((part, index) => part === rightParts[index]);
}

function normalizeAnswerToKeys(question, answer) {
  const parts = answerParts(answer);
  if (!question) {
    return parts;
  }

  return parts.map((part) => {
    const directOption = question.options.find((option) => option.key === part);
    if (directOption) {
      return directOption.key;
    }

    const textOption = question.options.find((option) => option.text === part);
    if (textOption) {
      return textOption.key;
    }

    if (part === "正确") {
      const positive = question.options.find((option) => option.text === "对" || option.text === "正确");
      return positive ? positive.key : part;
    }

    if (part === "错误") {
      const negative = question.options.find((option) => option.text === "错" || option.text === "错误");
      return negative ? negative.key : part;
    }

    return part;
  });
}


function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
