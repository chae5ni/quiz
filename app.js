const STORAGE_KEY = "one-minute-it-quiz-state-v5";
const SUPABASE_URL = "https://inpozrhrlofyhenqfucy.supabase.co";
const SUPABASE_KEY = window.SUPABASE_PUBLISHABLE_KEY || "여기에 Publishable key";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentMode = "daily";

const state = {
  quizzes: [],
  currentIndex: 0,
  currentQuiz: null,
  selectedChoice: null,
  isAnswered: false,
  latestBatchId: null,
  store: loadStore(),
};

const elements = {
  quizCard: document.getElementById("quizCard"),
  modeChip: document.getElementById("modeChip"),
  streakCount: document.getElementById("streakCount"),
  quizDateLabel: document.getElementById("quizDateLabel"),
  categoryBadge: document.getElementById("categoryBadge"),
  comboBadge: document.getElementById("comboBadge"),
  progressLabel: document.getElementById("progressLabel"),
  questionText: document.getElementById("questionText"),
  choiceList: document.getElementById("choiceList"),
  submitButton: document.getElementById("submitButton"),
  skipButton: document.getElementById("skipButton"),
  notifyButton: document.getElementById("notifyButton"),
  resultPanel: document.getElementById("resultPanel"),
  resultTag: document.getElementById("resultTag"),
  resultTitle: document.getElementById("resultTitle"),
  resultExplanation: document.getElementById("resultExplanation"),
  resultStreak: document.getElementById("resultStreak"),
  personaText: document.getElementById("personaText"),
  nextButton: document.getElementById("nextButton"),
  shareButton: document.getElementById("shareButton"),
  modePanel: document.getElementById("modePanel"),
  modeTitle: document.getElementById("modeTitle"),
  infiniteButton: document.getElementById("infiniteButton"),
  reviewButton: document.getElementById("reviewButton"),
  wrongNoteList: document.getElementById("wrongNoteList"),
  wrongCount: document.getElementById("wrongCount"),
  shareCanvas: document.getElementById("shareCanvas"),
};

init().catch((error) => {
  console.error(error);
  showEmptyState("문제를 불러오지 못했어요.");
});

async function init() {
  bindEvents();
  renderWrongNotes();
  renderHeader();
  await loadQuizzes();
}

async function loadQuizzes() {
  if (currentMode === "daily") {
    await loadDailyQuizzes();
    return;
  }
  await loadInfiniteQuizzes();
}

async function loadDailyQuizzes() {
  const latestBatch = await getLatestBatchId();
  state.latestBatchId = latestBatch;

  if (!latestBatch) {
    showEmptyState("오늘 생성된 문제 5개가 아직 없어요.");
    return;
  }

  const { data, error } = await supabaseClient
    .from("quizzes")
    .select("*")
    .eq("batch_id", latestBatch)
    .order("daily_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(5);

  const quizzes = normalizeLoadedQuizzes(data, error, "오늘 생성된 문제 5개를 불러오지 못했어요.");
  if (!quizzes) {
    return;
  }

  state.quizzes = quizzes;

  if (isDailyBatchCompleted()) {
    showDailyClear();
    return;
  }

  const nextIndex = getNextUnprocessedDailyIndex();
  state.currentIndex = nextIndex === -1 ? 0 : nextIndex;
  state.currentQuiz = state.quizzes[state.currentIndex];
  state.selectedChoice = null;
  state.isAnswered = false;

  showQuizCard();
  hideModePanel();
  hideResult();
  renderHeader();
  renderQuiz();
}

async function loadInfiniteQuizzes() {
  let query = supabaseClient
    .from("quizzes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (state.latestBatchId) {
    query = query.neq("batch_id", state.latestBatchId);
  }

  const { data, error } = await query;
  const quizzes = normalizeLoadedQuizzes(data, error, "무제한 모드 문제를 불러오지 못했어요.");
  if (!quizzes) {
    return;
  }

  const unseen = quizzes.filter((quiz) => getQuizStatus(quiz.id) === "unseen");
  if (!unseen.length) {
    showNoInfiniteQuizzes();
    return;
  }

  state.quizzes = shuffle(unseen);
  state.currentIndex = 0;
  state.currentQuiz = state.quizzes[0];
  state.selectedChoice = null;
  state.isAnswered = false;

  showQuizCard();
  hideModePanel();
  hideResult();
  renderHeader();
  renderQuiz();
}

async function getLatestBatchId() {
  const { data, error } = await supabaseClient
    .from("quizzes")
    .select("batch_id, created_at")
    .not("batch_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("최신 배치를 찾지 못했어요:", error);
    showEmptyState("Supabase에서 문제를 불러오지 못했어요.");
    return null;
  }

  return data?.[0]?.batch_id ?? null;
}

function normalizeLoadedQuizzes(data, error, emptyMessage) {
  if (error) {
    console.error("데이터 로드 실패:", error);
    showEmptyState(emptyMessage);
    return null;
  }

  const quizzes = (data || []).map(normalizeQuizRecord);
  if (!quizzes.length) {
    showEmptyState(emptyMessage);
    return null;
  }

  return quizzes;
}

function normalizeQuizRecord(record) {
  return {
    id: record.id ?? `quiz-${Math.random().toString(36).slice(2)}`,
    category: record.category ?? "IT Quiz",
    difficulty: record.difficulty ?? "Daily",
    question: record.question ?? "질문이 비어 있어요.",
    choices: normalizeChoices(record),
    answer: record.answer ?? "",
    explanation: record.explanation ?? "해설이 아직 준비되지 않았어요.",
    batchId: record.batch_id ?? null,
  };
}

function normalizeChoices(record) {
  if (Array.isArray(record.choices) && record.choices.length) {
    return record.choices;
  }

  if (record.answer === "O" || record.answer === "X") {
    return ["O", "X"];
  }

  return [record.answer ?? "정답"];
}

function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createInitialStore();
    }
    return { ...createInitialStore(), ...JSON.parse(raw) };
  } catch {
    return createInitialStore();
  }
}

function createInitialStore() {
  return {
    streak: 0,
    combo: 0,
    lastSolvedDate: null,
    solvedQuizIds: {},
    skippedQuizIds: {},
    wrongNotes: [],
  };
}

function saveStore() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.store));
}

function bindEvents() {
  elements.submitButton.addEventListener("click", submitAnswer);
  elements.skipButton.addEventListener("click", skipCurrentQuiz);
  elements.nextButton.addEventListener("click", goToNextQuiz);
  elements.shareButton.addEventListener("click", downloadShareImage);
  elements.reviewButton.addEventListener("click", () => {
    document.querySelector(".notes-section").scrollIntoView({ behavior: "smooth" });
  });
  elements.infiniteButton.addEventListener("click", async () => {
    currentMode = "infinite";
    await loadQuizzes();
  });
  elements.notifyButton.addEventListener("click", handleNotifyClick);
}

function renderHeader() {
  elements.modeChip.textContent = currentMode === "daily" ? "Daily 5" : "Infinite";
  elements.streakCount.textContent = state.store.streak;
  elements.resultStreak.textContent = state.store.streak;
  elements.comboBadge.textContent = `Combo x${state.store.combo}`;
  elements.quizDateLabel.textContent =
    currentMode === "daily" ? `${formatDateLabel(new Date())} 퀴즈` : "무제한 퀴즈";
}

function renderQuiz() {
  const quiz = state.currentQuiz;
  if (!quiz) {
    return;
  }

  elements.categoryBadge.textContent = quiz.category;
  elements.questionText.textContent = quiz.question;
  elements.progressLabel.textContent =
    currentMode === "daily"
      ? `${getDisplayedDailyStep()} / ${state.quizzes.length} 진행 중`
      : `${state.currentIndex + 1}번째 무제한 문제`;

  elements.choiceList.innerHTML = "";
  quiz.choices.forEach((choice, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice-button";
    button.textContent = `${index + 1}. ${choice}`;
    button.addEventListener("click", () => selectChoice(choice, button));
    elements.choiceList.appendChild(button);
  });

  state.selectedChoice = null;
  state.isAnswered = false;
  updateSubmitState();

  if (getQuizStatus(quiz.id) === "solved") {
    showAnsweredState(state.store.solvedQuizIds[getSolvedKey(quiz.id)]);
    return;
  }

  hideResult();
}

function selectChoice(choice, button) {
  if (state.isAnswered) {
    return;
  }

  state.selectedChoice = choice;
  [...elements.choiceList.children].forEach((node) => node.classList.remove("active"));
  button.classList.add("active");
  updateSubmitState();
}

function updateSubmitState() {
  elements.submitButton.disabled = state.isAnswered || !state.selectedChoice;
}

function submitAnswer() {
  const quiz = state.currentQuiz;
  if (!quiz || state.isAnswered) {
    return;
  }

  if (!state.selectedChoice) {
    window.alert("먼저 O/X를 선택해 주세요.");
    return;
  }

  const isCorrect = state.selectedChoice === quiz.answer;
  updateProgress(isCorrect, quiz);

  const solved = {
    selectedChoice: state.selectedChoice,
    isCorrect,
    solvedAt: new Date().toISOString(),
    mode: currentMode,
  };

  state.store.solvedQuizIds[getSolvedKey(quiz.id)] = solved;
  delete state.store.skippedQuizIds[getSolvedKey(quiz.id)];
  saveStore();

  renderHeader();
  showAnsweredState(solved);
  renderWrongNotes();
  elements.nextButton.textContent = currentMode === "daily" && isDailyBatchCompleted() ? "완료 화면 보기" : "다음 문제";
}

function skipCurrentQuiz() {
  const quiz = state.currentQuiz;
  if (!quiz || state.isAnswered) {
    return;
  }

  state.store.skippedQuizIds[getSolvedKey(quiz.id)] = {
    skippedAt: new Date().toISOString(),
    mode: currentMode,
  };
  saveStore();

  if (currentMode === "daily" && isDailyBatchCompleted()) {
    showDailyClear();
    return;
  }

  goToNextQuiz();
}

function updateProgress(isCorrect, quiz) {
  const today = getTodayKey();
  const yesterday = getRelativeDayKey(-1);
  const solvedYesterday = state.store.lastSolvedDate === yesterday;

  if (currentMode === "daily" && state.store.lastSolvedDate !== today) {
    state.store.streak = solvedYesterday ? state.store.streak + 1 : 1;
    state.store.lastSolvedDate = today;
  }

  if (isCorrect) {
    state.store.combo += 1;
  } else {
    state.store.combo = 0;
    state.store.wrongNotes = [
      {
        id: getSolvedKey(quiz.id),
        date: today,
        question: quiz.question,
        selectedChoice: state.selectedChoice,
        answer: quiz.answer,
        explanation: quiz.explanation,
      },
      ...state.store.wrongNotes.filter((item) => item.id !== getSolvedKey(quiz.id)),
    ].slice(0, 50);
  }
}

function showAnsweredState(result) {
  const quiz = state.currentQuiz;
  if (!quiz || !result) {
    return;
  }

  state.isAnswered = true;
  elements.resultPanel.classList.remove("hidden");
  elements.resultTag.textContent = result.isCorrect ? "정답" : "오답";
  elements.resultTag.classList.toggle("wrong", !result.isCorrect);
  elements.resultTitle.textContent = result.isCorrect
    ? `좋아요, ${quiz.answer} 감각이 살아있어요`
    : "괜찮아요. 바로 다음 문제로 회복하면 됩니다";
  elements.resultExplanation.textContent = quiz.explanation;
  elements.resultStreak.textContent = state.store.streak;
  elements.personaText.textContent = getPersonaText(state.store.streak, state.store.combo, result.isCorrect);

  elements.submitButton.disabled = true;
  [...elements.choiceList.children].forEach((node) => {
    node.disabled = true;
    if (node.textContent.endsWith(quiz.answer)) {
      node.classList.add("active");
    }
  });
}

function hideResult() {
  elements.resultPanel.classList.add("hidden");
  elements.resultTag.classList.remove("wrong");
  [...elements.choiceList.children].forEach((node) => {
    node.disabled = false;
    node.classList.remove("active");
  });
  updateSubmitState();
}

function renderWrongNotes() {
  const notes = state.store.wrongNotes;
  elements.wrongCount.textContent = `${notes.length}개`;

  if (!notes.length) {
    elements.wrongNoteList.innerHTML = '<article class="empty-note">아직 저장된 오답이 없어요.</article>';
    return;
  }

  elements.wrongNoteList.innerHTML = "";
  notes.forEach((note) => {
    const card = document.createElement("article");
    card.className = "note-card";
    card.innerHTML = `
      <h4>${escapeHtml(note.date)} · ${escapeHtml(note.question)}</h4>
      <p>내 답: ${escapeHtml(note.selectedChoice)} / 정답: ${escapeHtml(note.answer)}</p>
      <p>${escapeHtml(note.explanation)}</p>
    `;
    elements.wrongNoteList.appendChild(card);
  });
}

function goToNextQuiz() {
  hideResult();

  if (currentMode === "daily") {
    const nextIndex = getNextUnprocessedDailyIndex();
    if (nextIndex === -1) {
      showDailyClear();
      return;
    }

    state.currentIndex = nextIndex;
    state.currentQuiz = state.quizzes[state.currentIndex];
    state.selectedChoice = null;
    state.isAnswered = false;
    showQuizCard();
    hideModePanel();
    renderHeader();
    renderQuiz();
    return;
  }

  const nextIndex = state.quizzes.findIndex(
    (quiz, index) => index > state.currentIndex && getQuizStatus(quiz.id) === "unseen"
  );

  if (nextIndex === -1) {
    loadInfiniteQuizzes();
    return;
  }

  state.currentIndex = nextIndex;
  state.currentQuiz = state.quizzes[state.currentIndex];
  state.selectedChoice = null;
  state.isAnswered = false;
  showQuizCard();
  hideModePanel();
  renderHeader();
  renderQuiz();
}

function showDailyClear() {
  currentMode = "daily";
  renderHeader();
  hideResult();
  hideQuizCard();
  elements.modePanel.classList.remove("hidden");
  elements.modeTitle.textContent = "오늘의 5문제를 모두 끝냈어요";
}

function showNoInfiniteQuizzes() {
  currentMode = "infinite";
  renderHeader();
  hideResult();
  hideQuizCard();
  elements.modePanel.classList.remove("hidden");
  elements.modeTitle.textContent = "무제한 모드용 추가 문제가 아직 없어요";
}

function hideModePanel() {
  elements.modePanel.classList.add("hidden");
}

function showQuizCard() {
  elements.quizCard.classList.remove("hidden");
}

function hideQuizCard() {
  elements.quizCard.classList.add("hidden");
}

function showEmptyState(message) {
  showQuizCard();
  hideModePanel();
  hideResult();
  elements.questionText.textContent = message;
  elements.progressLabel.textContent = currentMode === "daily" ? "1 / 5 진행 중" : "무제한 문제 준비 중";
  elements.choiceList.innerHTML = "";
  state.selectedChoice = null;
  state.isAnswered = false;
  updateSubmitState();
}

function isDailyBatchCompleted() {
  return state.quizzes.length > 0 && state.quizzes.every((quiz) => getQuizStatus(quiz.id) !== "unseen");
}

function getNextUnprocessedDailyIndex() {
  return state.quizzes.findIndex((quiz) => getQuizStatus(quiz.id) === "unseen");
}

function getDisplayedDailyStep() {
  const processedCount = state.quizzes.filter((quiz) => getQuizStatus(quiz.id) !== "unseen").length;
  return Math.min(processedCount + 1, state.quizzes.length);
}

function getQuizStatus(quizId) {
  const key = getSolvedKey(quizId);
  if (state.store.solvedQuizIds[key]) {
    return "solved";
  }
  if (state.store.skippedQuizIds[key]) {
    return "skipped";
  }
  return "unseen";
}

function handleNotifyClick() {
  if (!("Notification" in window)) {
    window.alert("이 브라우저에서는 알림을 지원하지 않습니다.");
    return;
  }

  if (Notification.permission === "granted") {
    window.alert("이미 알림이 허용되어 있어요.");
    return;
  }

  if (Notification.permission === "denied") {
    window.alert("브라우저 설정에서 알림 권한을 허용해 주세요.");
    return;
  }

  Notification.requestPermission().then((permission) => {
    if (permission === "granted") {
      window.alert("알림 설정이 완료되었습니다.");
      return;
    }
    window.alert("알림 권한이 허용되지 않았어요.");
  });
}

function getSolvedKey(quizId) {
  return `${getTodayKey()}-${quizId}`;
}

function getTodayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function getRelativeDayKey(offset) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDateLabel(date) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function getPersonaText(streak, combo, isCorrect) {
  if (isCorrect && combo >= 5) {
    return "상위 1% IT 지식인";
  }
  if (streak >= 7) {
    return "꾸준함으로 이기는 개발자";
  }
  if (isCorrect) {
    return "오늘의 트렌드 캐처";
  }
  return "회복 중인 러닝 스트릭";
}

function downloadShareImage() {
  const quiz = state.currentQuiz;
  const solved = quiz ? state.store.solvedQuizIds[getSolvedKey(quiz.id)] : null;
  if (!quiz || !solved) {
    return;
  }

  const canvas = elements.shareCanvas;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#eff5ff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#005eff");
  gradient.addColorStop(1, "#00c2ff");
  ctx.fillStyle = gradient;
  roundRect(ctx, 70, 70, 940, 1210, 48, true);

  ctx.fillStyle = "rgba(255, 255, 255, 0.82)";
  roundRect(ctx, 130, 150, 820, 470, 36, true);
  roundRect(ctx, 130, 650, 820, 220, 36, true);

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 42px SUIT, sans-serif";
  ctx.fillText("1분 IT 퀴즈", 140, 110);

  ctx.fillStyle = "#0f172a";
  ctx.font = "800 72px SUIT, sans-serif";
  ctx.fillText(solved.isCorrect ? "오늘도 정답!" : "다음 문제로 회복!", 170, 270);

  ctx.font = "600 38px SUIT, sans-serif";
  wrapText(ctx, quiz.question, 170, 360, 740, 56);

  ctx.fillStyle = "#334155";
  ctx.font = "600 34px SUIT, sans-serif";
  ctx.fillText(`정답: ${quiz.answer}`, 170, 540);

  ctx.fillStyle = "#0f172a";
  ctx.font = "700 46px SUIT, sans-serif";
  ctx.fillText(`현재 스트릭 ${state.store.streak}일`, 170, 735);
  ctx.fillText(`Combo x${state.store.combo}`, 170, 805);

  ctx.fillStyle = "#ffffff";
  ctx.font = "600 30px SUIT, sans-serif";
  ctx.fillText("tiny daily learning, big career momentum", 170, 1180);

  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = `it-quiz-${getTodayKey()}.png`;
  link.click();
}

function roundRect(ctx, x, y, width, height, radius, fill) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  if (fill) {
    ctx.fill();
  }
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let lineIndex = 0;

  words.forEach((word) => {
    const testLine = `${line}${word} `;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line.trim(), x, y + lineHeight * lineIndex);
      line = `${word} `;
      lineIndex += 1;
    } else {
      line = testLine;
    }
  });

  if (line) {
    ctx.fillText(line.trim(), x, y + lineHeight * lineIndex);
  }
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
