const STORAGE_KEY = "one-minute-it-quiz-state-v2";
const SUPABASE_URL = "https://inpozrhlofyhenqfucy.supabase.co";
const SUPABASE_KEY = window.SUPABASE_PUBLISHABLE_KEY || "복사한_Publishable_key를_여기에_넣으세요";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const state = {
  quizzes: [],
  todayQuiz: null,
  selectedChoice: null,
  isAnswered: false,
  store: loadStore(),
  drag: {
    active: false,
    startX: 0,
    currentX: 0,
  },
};

const elements = {
  difficultyChip: document.getElementById("difficultyChip"),
  streakCount: document.getElementById("streakCount"),
  quizDateLabel: document.getElementById("quizDateLabel"),
  categoryBadge: document.getElementById("categoryBadge"),
  comboBadge: document.getElementById("comboBadge"),
  questionText: document.getElementById("questionText"),
  choiceList: document.getElementById("choiceList"),
  submitButton: document.getElementById("submitButton"),
  skipButton: document.getElementById("skipButton"),
  notifyButton: document.getElementById("notifyButton"),
  quizCard: document.getElementById("quizCard"),
  resultPanel: document.getElementById("resultPanel"),
  resultTag: document.getElementById("resultTag"),
  resultTitle: document.getElementById("resultTitle"),
  resultExplanation: document.getElementById("resultExplanation"),
  resultStreak: document.getElementById("resultStreak"),
  personaText: document.getElementById("personaText"),
  shareButton: document.getElementById("shareButton"),
  reviewButton: document.getElementById("reviewButton"),
  wrongNoteList: document.getElementById("wrongNoteList"),
  wrongCount: document.getElementById("wrongCount"),
  shareCanvas: document.getElementById("shareCanvas"),
};

init().catch((error) => {
  elements.questionText.textContent = "문제를 불러오지 못했어요.";
  console.error(error);
});

async function init() {
  bindEvents();
  renderWrongNotes();
  await loadQuizzes();
}

async function loadQuizzes() {
  const { data, error } = await supabaseClient
    .from("quizzes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("데이터 로드 실패:", error);
    elements.questionText.textContent = "Supabase에서 문제를 불러오지 못했어요.";
    return;
  }

  if (!data || !data.length) {
    elements.questionText.textContent = "등록된 퀴즈가 아직 없어요.";
    return;
  }

  state.quizzes = data.map(normalizeQuizRecord);
  state.todayQuiz = state.quizzes[0];
  renderHeader();
  renderQuiz();
}

function normalizeQuizRecord(record) {
  return {
    id: record.id ?? `quiz-${Date.now()}`,
    category: record.category ?? "IT Quiz",
    difficulty: record.difficulty ?? "Daily",
    question: record.question ?? "질문이 비어 있어요.",
    choices: normalizeChoices(record),
    answer: record.answer ?? "",
    explanation: record.explanation ?? "해설이 아직 준비되지 않았어요.",
    createdAt: record.created_at ?? null,
  };
}

function normalizeChoices(record) {
  if (Array.isArray(record.choices) && record.choices.length) {
    return record.choices;
  }

  const candidateKeys = ["option_1", "option_2", "option_3", "option_4"];
  const choices = candidateKeys.map((key) => record[key]).filter(Boolean);
  if (choices.length) {
    return choices;
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
    answeredDates: {},
    wrongNotes: [],
  };
}

function saveStore() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.store));
}

function renderHeader() {
  if (!state.todayQuiz) {
    return;
  }
  elements.difficultyChip.textContent = state.todayQuiz.difficulty;
  elements.streakCount.textContent = state.store.streak;
  elements.resultStreak.textContent = state.store.streak;
  elements.comboBadge.textContent = `Combo x${state.store.combo}`;
  elements.quizDateLabel.textContent = `${formatDateLabel(new Date())} 퀴즈`;
}

function renderQuiz() {
  if (!state.todayQuiz) {
    return;
  }

  const answerKey = getTodayAnswerKey();
  const alreadyAnswered = state.store.answeredDates[answerKey];
  state.isAnswered = Boolean(alreadyAnswered);
  state.selectedChoice = alreadyAnswered?.selectedChoice ?? null;

  elements.categoryBadge.textContent = state.todayQuiz.category;
  elements.questionText.textContent = state.todayQuiz.question;
  elements.choiceList.innerHTML = "";

  state.todayQuiz.choices.forEach((choice, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice-button";
    button.textContent = `${index + 1}. ${choice}`;
    button.addEventListener("click", () => selectChoice(choice, button));
    elements.choiceList.appendChild(button);
  });

  if (alreadyAnswered) {
    showAnsweredState(alreadyAnswered);
  } else {
    hideResult();
  }
}

function selectChoice(choice, button) {
  if (state.isAnswered) {
    return;
  }
  state.selectedChoice = choice;
  [...elements.choiceList.children].forEach((node) => node.classList.remove("active"));
  button.classList.add("active");
}

function bindEvents() {
  elements.submitButton.addEventListener("click", submitAnswer);
  elements.skipButton.addEventListener("click", () => {
    window.alert("오늘은 건너뛰었어요. 스트릭을 지키려면 내일 다시 와주세요.");
  });
  elements.notifyButton.addEventListener("click", () => {
    window.alert("MVP에서는 실제 푸시 대신 온보딩만 넣어두었어요. 다음 단계에서 웹 푸시나 앱 푸시로 확장하면 됩니다.");
  });
  elements.shareButton.addEventListener("click", downloadShareImage);
  elements.reviewButton.addEventListener("click", () => {
    document.querySelector(".notes-section").scrollIntoView({ behavior: "smooth" });
  });

  bindSwipe(elements.quizCard);
}

function submitAnswer() {
  if (state.isAnswered || !state.todayQuiz) {
    return;
  }
  if (!state.selectedChoice) {
    window.alert("선택지를 먼저 골라주세요.");
    return;
  }

  const isCorrect = state.selectedChoice === state.todayQuiz.answer;
  updateProgress(isCorrect);

  const solved = {
    selectedChoice: state.selectedChoice,
    isCorrect,
    solvedAt: new Date().toISOString(),
  };

  state.store.answeredDates[getTodayAnswerKey()] = solved;
  saveStore();
  showAnsweredState(solved);
  renderWrongNotes();
}

function updateProgress(isCorrect) {
  const yesterday = getRelativeDayKey(-1);
  const solvedYesterday = state.store.lastSolvedDate === yesterday;

  state.store.streak = solvedYesterday ? state.store.streak + 1 : 1;

  if (isCorrect) {
    state.store.combo += 1;
  } else {
    state.store.combo = 0;
    state.store.wrongNotes = [
      {
        id: getTodayAnswerKey(),
        date: getTodayKey(),
        question: state.todayQuiz.question,
        selectedChoice: state.selectedChoice,
        answer: state.todayQuiz.answer,
        explanation: state.todayQuiz.explanation,
      },
      ...state.store.wrongNotes.filter((item) => item.id !== getTodayAnswerKey()),
    ].slice(0, 20);
  }

  state.store.lastSolvedDate = getTodayKey();
  saveStore();
}

function showAnsweredState(result) {
  state.isAnswered = true;
  const isCorrect = result.isCorrect;

  renderHeader();
  elements.resultPanel.classList.remove("hidden");
  elements.resultTag.textContent = isCorrect ? "정답" : "오답";
  elements.resultTag.classList.toggle("wrong", !isCorrect);
  elements.resultTitle.textContent = isCorrect
    ? `좋아요, ${state.todayQuiz.answer} 감각이 살아있어요`
    : "괜찮아요, 내일 다시 맞히면 됩니다";
  elements.resultExplanation.textContent = state.todayQuiz.explanation;
  elements.resultStreak.textContent = state.store.streak;
  elements.personaText.textContent = getPersonaText(state.store.streak, state.store.combo, isCorrect);

  elements.submitButton.disabled = true;
  elements.submitButton.textContent = "오늘의 퀴즈 완료";
  [...elements.choiceList.children].forEach((node) => {
    node.disabled = true;
    if (node.textContent.endsWith(state.todayQuiz.answer)) {
      node.classList.add("active");
    }
  });
}

function hideResult() {
  elements.resultPanel.classList.add("hidden");
  elements.submitButton.disabled = false;
  elements.submitButton.textContent = "정답 확인";
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

function bindSwipe(card) {
  card.addEventListener("pointerdown", (event) => {
    if (state.isAnswered) {
      return;
    }
    state.drag.active = true;
    state.drag.startX = event.clientX;
    card.classList.add("dragging");
  });

  window.addEventListener("pointermove", (event) => {
    if (!state.drag.active) {
      return;
    }
    state.drag.currentX = event.clientX - state.drag.startX;
    const rotate = state.drag.currentX / 20;
    card.style.transform = `translateX(${state.drag.currentX}px) rotate(${rotate}deg)`;
  });

  window.addEventListener("pointerup", () => {
    if (!state.drag.active) {
      return;
    }
    const distance = state.drag.currentX;
    state.drag.active = false;
    state.drag.currentX = 0;
    card.classList.remove("dragging");
    card.style.transform = "";

    if (Math.abs(distance) < 120) {
      return;
    }

    if (distance > 0) {
      elements.submitButton.click();
    } else {
      elements.skipButton.click();
    }
  });
}

function getTodayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function getTodayAnswerKey() {
  return `${getTodayKey()}-${state.todayQuiz?.id ?? "daily-quiz"}`;
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
  if (isCorrect && combo >= 3) {
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
  const canvas = elements.shareCanvas;
  const ctx = canvas.getContext("2d");
  const answered = state.store.answeredDates[getTodayAnswerKey()];
  if (!answered || !state.todayQuiz) {
    return;
  }

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
  ctx.fillText(answered.isCorrect ? "오늘도 정답!" : "내일 다시 도전!", 170, 270);

  ctx.font = "600 38px SUIT, sans-serif";
  wrapText(ctx, state.todayQuiz.question, 170, 360, 740, 56);

  ctx.fillStyle = "#334155";
  ctx.font = "600 34px SUIT, sans-serif";
  ctx.fillText(`정답: ${state.todayQuiz.answer}`, 170, 540);

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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
