'use strict';

const { cards, decks, sources } = JSON.parse(document.getElementById('study-data').textContent);
const $ = id => document.getElementById(id);
const levels = { 1: 'พื้นฐาน', 2: 'ประยุกต์', 3: 'ยาก' };
const subjects = { th: 'ความรู้ทั่วไป', en: 'English' };
const practice = decks.filter(deck => deck.kind === 'study');
const exams = decks.filter(deck => deck.kind === 'mock');
const references = decks.filter(deck => deck.kind === 'recap');
const byDeck = Object.fromEntries(decks.map(deck => [deck.id, deck]));
const cardSubjects = new Map(practice.map(deck => [deck.id,
  new Set(deck.cards.map(id => cards[id].subject))]));
const searchIndex = new Map(practice.map(deck => {
  const headings = normalizeSearch([deck.title, ...(deck.tags || [])].join(' '));
  const searchable = Object.fromEntries(Object.keys(subjects).map(subject => [
    subject,
    normalizeSearch(deck.cards.filter(id => cards[id].subject === subject)
      .map(id => [cards[id].question, cards[id].answer].join(' ')).join(' ')),
  ]));
  return [deck.id, { headings, ...searchable, all: searchable.th + ' ' + searchable.en }];
}));
const storageKey = 'thai-diplomat-exam-2569-v1';
const dateFormat = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
let storageAvailable = true;
const state = loadProgress();
let currentView = 'library';
let activeLevel = 1;
let study;
let quiz;
let result;
let reviewMode = 'missed';

function loadProgress() {
  const baseline = { study: {}, drafts: {}, attempts: [], last: null };
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey));
    if (stored && Array.isArray(stored.attempts) && stored.study && stored.drafts) return stored;
  } catch {
    storageAvailable = false;
  }
  return baseline;
}

function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
    storageAvailable = true;
  } catch {
    storageAvailable = false;
  }
}

function node(tag, text = '', className = '') {
  const el = document.createElement(tag);
  if (text) el.textContent = text;
  if (className) el.className = className;
  return el;
}

function action(label, onClick, className = 'button') {
  const button = node('button', label, className);
  button.type = 'button';
  button.addEventListener('click', onClick);
  return button;
}

function moveFocus(target) {
  target.tabIndex = -1;
  target.focus({ preventScroll: true });
}

function show(view, focus = true) {
  currentView = view;
  for (const section of document.querySelectorAll('.view')) section.hidden = section.id !== view;
  const navView = { study: 'library', quiz: 'exams', result: 'history' }[view] || view;
  for (const button of document.querySelectorAll('nav button')) {
    if (button.dataset.view === navView) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  if (focus) {
    window.scrollTo(0, 0);
    moveFocus($(view).querySelector('h1'));
  }
}

function pressedGroup(container, choices, selected, onSelect) {
  const hadFocus = container.contains(document.activeElement);
  container.replaceChildren();
  for (const [id, label] of choices) {
    const button = action(label, () => onSelect(id), '');
    button.setAttribute('aria-pressed', String(id === selected));
    container.append(button);
    if (hadFocus && id === selected) button.focus();
  }
}

function completedFullExams() {
  return new Set(state.attempts.filter(attempt => !attempt.retry).map(attempt => attempt.deckId));
}

function studyFor(deck) {
  return state.study[deck.id] ??= { seen: [], selected: {}, positions: {}, subject: 'all' };
}

function studyQuestionIds(deck, subject) {
  return subject === 'all' ? deck.cards : deck.cards.filter(id => cards[id].subject === subject);
}

function seenCount(deck) {
  const seen = new Set(state.study[deck.id]?.seen || []);
  return deck.cards.filter(id => seen.has(id)).length;
}

function missedDeck() {
  const answered = new Set();
  const missed = [];
  for (const attempt of state.attempts) {
    for (const response of attempt.responses) {
      if (answered.has(response.id) || !cards[response.id]) continue;
      answered.add(response.id);
      if (response.selected !== response.correct) missed.push(response.id);
    }
  }
  return { id: 'missed-questions', title: 'รวมข้อที่พลาด', kind: 'review', cards: missed };
}

function renderResume() {
  const last = state.last;
  const attempt = state.attempts[0];
  let label = 'เริ่มฝึก';
  let title = practice[0].title;
  let detail = 'เริ่มด้วยชุดพื้นฐาน แล้วลองทำข้อสอบจำลอง';
  let button = 'เริ่มชุดฝึก →';
  let open = () => openStudy(practice[0]);
  if (attempt) {
    label = 'ผลสอบล่าสุด';
    title = attempt.title;
    detail = `${attempt.correct} / ${attempt.total} ข้อ · ${dateFormat.format(new Date(attempt.finished))}`;
    button = 'ดูผลและทบทวน →';
    open = () => openResult(attempt);
  }
  const savedStudy = last?.kind === 'study'
    ? (last.id === 'missed-questions' ? missedDeck() : byDeck[last.id])
    : null;
  if (savedStudy?.cards.length) {
    const deck = savedStudy;
    label = 'กลับมาฝึกต่อ';
    title = deck.title;
    detail = `เปิดเฉลยแล้ว ${seenCount(deck)} / ${deck.cards.length} ข้อ`;
    button = 'ทำต่อ →';
    open = () => openStudy(deck);
  }
  if (last?.kind === 'quiz' && state.drafts[last.id] && byDeck[state.drafts[last.id].deckId]) {
    const draft = state.drafts[last.id];
    label = 'ข้อสอบที่ทำค้างไว้';
    title = draft.title;
    detail = `ตอบแล้ว ${answerCount(draft)} / ${draft.order.length} ข้อ`;
    button = 'ทำข้อสอบต่อ →';
    open = () => openQuiz(byDeck[draft.deckId], draft);
  }
  $('resume-heading').textContent = label;
  $('resume-title').textContent = title;
  $('resume-detail').textContent = detail;
  $('resume').textContent = button;
  $('resume').onclick = open;
}

function tile(title, detail, label, click, status = '') {
  const el = node('article', '', 'tile');
  el.append(node('h3', title), node('p', detail));
  if (status) el.append(node('p', status));
  const controls = node('div', '', 'tile-actions');
  const button = action(label, click);
  button.setAttribute('aria-label', `${label} ${title}`);
  controls.append(button);
  el.append(controls);
  return el;
}

function normalizeSearch(text) {
  return text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ').trim();
}

function termMatches(text, term) {
  return /^[a-z0-9]{1,3}$/.test(term) ? ` ${text} `.includes(` ${term} `) : text.includes(term);
}

function renderStudyList() {
  const terms = normalizeSearch($('study-search').value).split(' ').filter(Boolean);
  const subject = $('library-subject').value;
  const candidates = practice.filter(deck =>
    (!activeLevel || deck.level === activeLevel) &&
    (subject === 'all' || cardSubjects.get(deck.id).has(subject))
  );
  const ranked = candidates.map(deck => {
    const index = searchIndex.get(deck.id);
    const headings = index.headings;
    const prompts = index[subject];
    const score = terms.reduce((result, term) => {
      if (termMatches(headings, term)) return result + 2;
      if (termMatches(prompts, term)) return result + 1;
      return result;
    }, 0);
    const matches = terms.every(term => termMatches(headings, term) || termMatches(prompts, term));
    return { deck, score, matches };
  }).filter(item => item.matches).sort((a, b) => b.score - a.score);
  const entries = ranked.map(({ deck }) => {
    const seen = seenCount(deck);
    const label = [...cardSubjects.get(deck.id)].map(key => subjects[key]).join(' + ');
    return tile(deck.title, `${deck.cards.length} ข้อ · ${levels[deck.level]} · ${label}`,
      seen ? 'ฝึกต่อ →' : 'เริ่มฝึก →', () => openStudy(deck, subject),
      seen ? `เปิดเฉลยแล้ว ${seen} / ${deck.cards.length} ข้อ` : '');
  });
  $('library-count').textContent = `แสดง ${entries.length} จาก ${practice.length} ชุด`;
  $('study-list').replaceChildren(...entries);
  if (!entries.length) {
    $('study-list').append(node('div', 'ไม่พบชุดฝึก ลองใช้คำอื่นหรือเลือกทุกระดับ', 'empty'));
  }
}

function renderLevelFilter() {
  const choices = [[0, 'ทุกระดับ'], ...Object.entries(levels).map(([id, label]) => [Number(id), label])];
  pressedGroup($('levels'), choices, activeLevel, level => {
    activeLevel = level;
    renderLevelFilter();
    renderStudyList();
  });
}

function renderLibrary() {
  $('pack-count').textContent = `ปี 2569 · ${Object.keys(cards).length.toLocaleString('en-US')} ข้อ · ${practice.length} ชุดฝึก · ${exams.length} ข้อสอบจำลอง`;
  renderResume();
  renderLevelFilter();
  renderStudyList();
  $('reference-list').replaceChildren(...references.map(deck =>
    action(`${deck.title} · ${deck.cards.length} ข้อ`, () => openStudy(deck), 'text-button')));
}

function renderExams() {
  const completed = completedFullExams();
  $('exam-list').replaceChildren(...exams.map(deck => {
    const draft = state.drafts[deck.id];
    const status = draft ? `ตอบแล้ว ${answerCount(draft)} / ${draft.order.length} ข้อ`
      : completed.has(deck.id) ? 'ทำครบแล้ว' : '';
    return tile(deck.title, `${deck.cards.length} ข้อ · เน้นระดับ${levels[deck.level]}`,
      draft ? 'ทำข้อสอบต่อ →' : completed.has(deck.id) ? 'ทำอีกครั้ง →' : 'เริ่มทำข้อสอบ →',
      () => openQuiz(deck, draft), status);
  }));
}

function renderHistory() {
  const pool = missedDeck();
  const panel = $('mistake-panel');
  panel.hidden = !pool.cards.length;
  panel.replaceChildren();
  if (pool.cards.length) {
    const summary = node('div');
    summary.append(node('h2', pool.title), node('p', `${pool.cards.length} ข้อจากผลล่าสุดของแต่ละคำถาม`));
    panel.append(summary, action('ฝึกข้อที่พลาด →', () => openStudy(pool), 'button primary'));
  }
  const list = $('history-list');
  list.replaceChildren();
  if (!state.attempts.length) {
    const empty = node('div', '', 'empty');
    empty.append(node('p', 'ผลและเฉลยจะแสดงที่นี่หลังส่งข้อสอบ'), action('เลือกข้อสอบจำลอง', () => go('exams')));
    list.append(empty);
    return;
  }
  for (const attempt of state.attempts) {
    const entry = node('article', '', 'history-item');
    const details = node('div');
    details.append(node('h3', attempt.title),
      node('p', `${attempt.correct} / ${attempt.total} ข้อ · ${dateFormat.format(new Date(attempt.finished))}`));
    entry.append(details, action('ดูผล →', () => openResult(attempt)));
    list.append(entry);
  }
}

function go(view, focus = true) {
  if (view === 'library') renderLibrary();
  if (view === 'exams') renderExams();
  if (view === 'history') renderHistory();
  show(view, focus);
}

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const next = Math.floor(Math.random() * (i + 1));
    [result[i], result[next]] = [result[next], result[i]];
  }
  return result;
}

function optionGroup(id, question, order, selection, revealed, onSelect) {
  const field = node('fieldset', '', 'option-group');
  field.lang = question.subject;
  field.append(node('legend', question.subject === 'en' ? 'Answer choices' : 'ตัวเลือกคำตอบ', 'sr-only'));
  for (const option of order) {
    const label = node('label', '', 'option');
    const radio = node('input');
    radio.type = 'radio';
    radio.name = `option-${id}`;
    radio.value = option;
    radio.checked = selection === option;
    radio.disabled = revealed;
    if (revealed && option === question.answer) label.classList.add('correct');
    if (revealed && option === selection && option !== question.answer) label.classList.add('incorrect');
    radio.addEventListener('change', () => onSelect(option));
    label.append(radio, node('span', option));
    field.append(label);
  }
  return field;
}

function answerPanel(card, selected, expected, showSelection = false) {
  const panel = node('div', '', 'answer');
  if (showSelection) {
    const choice = node('span', selected ?? 'เว้นว่าง');
    choice.lang = selected ? card.subject : 'th';
    const paragraph = node('p');
    paragraph.append(node('strong', 'คำตอบของคุณ '), choice);
    panel.append(paragraph);
  }
  const explanation = node('p');
  const response = node('span', expected);
  response.lang = card.subject;
  explanation.append(node('strong', 'คำตอบที่ถูก '), response);
  panel.append(explanation);
  if (expected === card.answer && card.explanation) {
    const text = node('p', card.explanation);
    text.lang = card.subject;
    panel.append(text);
  }
  if (expected !== card.answer) panel.append(node('p', 'คำถามนี้ได้รับการปรับปรุงหลังจากที่คุณส่งคำตอบ'));
  if (card.refs.length) {
    const list = node('ul', '', 'source-links');
    for (const ref of card.refs) {
      const [label, url] = sources[ref];
      const link = node('a', label);
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      const li = node('li');
      li.append(link);
      list.append(li);
    }
    panel.append(list);
  }
  return panel;
}

function readingPassage(text) {
  const panel = node('details', '', 'passage');
  panel.open = true;
  const copy = node('p', text);
  copy.lang = 'en';
  panel.append(node('summary', 'บทอ่าน'), copy);
  return panel;
}

function exercise(question, position, total, topic) {
  const el = node('article', '', 'exercise');
  const meta = node('div', '', 'exercise-meta');
  meta.append(node('span', topic), node('span', `ข้อ ${position + 1} / ${total}`));
  const heading = node('h2', question.question);
  heading.lang = question.subject;
  el.append(meta);
  if (question.passage) el.append(readingPassage(question.passage));
  el.append(heading);
  return el;
}

function navigation(position, total, move, middle) {
  const list = node('div', '', 'exercise-actions');
  const previous = action('← ก่อนหน้า', () => move(-1));
  const next = action('ถัดไป →', () => move(1));
  previous.disabled = position === 0;
  next.disabled = position === total - 1;
  list.append(previous);
  if (middle) list.append(middle);
  list.append(next);
  return list;
}

function focusQuestion(container) {
  const heading = container.querySelector('h2');
  if (heading) {
    moveFocus(heading);
    if (heading.getBoundingClientRect().top < 12) heading.scrollIntoView({ block: 'nearest' });
  }
}

function openStudy(deck, requested = 'all') {
  const progress = studyFor(deck);
  const preferred = requested === 'all' ? progress.subject : requested;
  const subject = studyQuestionIds(deck, preferred).length ? preferred : 'all';
  progress.subject = subject;
  $('study-back').textContent = deck.kind === 'review' ? '← ผลสอบ' : '← ชุดฝึก';
  progress.orders ??= {};
  study = { deck, progress, subject, revealed: false, options: {} };
  state.last = { kind: 'study', id: deck.id };
  save();
  $('study-title').textContent = deck.title;
  renderStudy();
  show('study');
}

function renderStudy() {
  const { deck, progress, subject } = study;
  const valid = studyQuestionIds(deck, subject);
  const saved = (progress.orders[subject] || []).filter(id => valid.includes(id));
  const ids = [...saved, ...valid.filter(id => !saved.includes(id))];
  $('shuffle-study').disabled = ids.length < 2;
  const position = Math.max(0, ids.indexOf(progress.positions[subject]));
  const id = ids[position];
  const card = cards[id];

  const available = Object.entries(subjects).filter(([key]) => studyQuestionIds(deck, key).length > 0);
  const filter = $('subject-filter');
  filter.hidden = available.length < 2;
  pressedGroup(filter, [['all', 'ทุกวิชา'], ...available], subject, value => {
    study.subject = progress.subject = value;
    study.revealed = false;
    save();
    renderStudy();
  });

  const topic = deck.id === 'logistics' ? 'วันสอบ' : subjects[card.subject];
  const el = exercise(card, position, ids.length, topic);
  if (card.options) {
    study.options[id] ??= shuffle(card.options);
    el.append(optionGroup(id, card, study.options[id], progress.selected[id], study.revealed, option => {
      progress.selected[id] = option;
      save();
    }));
  }
  if (study.revealed) el.append(answerPanel(card, progress.selected[id], card.answer));
  const reveal = action(study.revealed ? 'ซ่อนคำตอบ' : 'ดูคำตอบ', () => {
    study.revealed = !study.revealed;
    if (study.revealed && !progress.seen.includes(id)) progress.seen.push(id);
    save();
    renderStudy();
    $('reveal-answer').focus({ preventScroll: true });
  }, 'button primary');
  reveal.id = 'reveal-answer';
  reveal.setAttribute('aria-expanded', String(study.revealed));
  if (study.revealed) {
    el.querySelector('.answer').id = 'study-answer';
    reveal.setAttribute('aria-controls', 'study-answer');
  }
  el.append(navigation(position, ids.length, step => {
    progress.positions[subject] = ids[position + step];
    study.revealed = false;
    save();
    renderStudy();
    focusQuestion($('study-card'));
  }, reveal));
  if (position === ids.length - 1 && ids.every(questionId => progress.seen.includes(questionId))) {
    el.append(action('เลือกชุดฝึกอื่น →', () => go('library'), 'text-button'));
  }
  $('study-card').replaceChildren(el);
}

function shuffleStudy() {
  const { deck, progress, subject } = study;
  progress.orders[subject] = shuffle(studyQuestionIds(deck, subject));
  progress.positions[subject] = progress.orders[subject][0];
  study.revealed = false;
  save();
  renderStudy();
  focusQuestion($('study-card'));
}

function answerCount(draft) {
  return draft.order.filter(id => Object.hasOwn(draft.answers, id)).length;
}

function startDraft(deck, attempt) {
  const order = attempt
    ? attempt.responses.filter(item => item.selected !== item.correct && cards[item.id]).map(item => item.id)
    : [...deck.cards];
  return {
    id: attempt ? `retry-${attempt.id}` : deck.id,
    deckId: deck.id,
    title: attempt ? `${deck.title} · ทำซ้ำข้อที่พลาด` : deck.title,
    retry: Boolean(attempt),
    order,
    position: 0,
    answers: {},
    options: {},
  };
}

function openQuiz(deck, draft, retryOf) {
  quiz = draft || startDraft(deck, retryOf);
  quiz.order = quiz.order.filter(id => cards[id]?.options);
  if (!quiz.order.length) {
    delete state.drafts[quiz.id];
    save();
    go('exams');
    return;
  }
  quiz.position = Math.min(quiz.position, quiz.order.length - 1);
  state.drafts[quiz.id] = quiz;
  state.last = { kind: 'quiz', id: quiz.id };
  save();
  $('quiz-title').textContent = quiz.title;
  $('answer-map').open = window.matchMedia('(min-width: 681px)').matches;
  renderQuiz();
  show('quiz');
}

function updateQuizStatus() {
  const answered = answerCount(quiz);
  $('quiz-status').textContent = `ตอบแล้ว ${answered} จาก ${quiz.order.length} ข้อ`;
  $('quiz-meter').max = quiz.order.length;
  $('quiz-meter').value = answered;
  $('next-unanswered').disabled = answered === quiz.order.length;
  $('save-status').textContent = storageAvailable ? 'บันทึกในเบราว์เซอร์นี้' : 'ใช้งานต่อได้ในแท็บนี้';
}

function renderQuizMap() {
  const map = $('question-map');
  map.replaceChildren();
  quiz.order.forEach((id, index) => {
    const answered = Object.hasOwn(quiz.answers, id);
    const button = action(String(index + 1), () => moveQuiz(index), answered ? 'jump answered' : 'jump');
    button.setAttribute('aria-label', `ข้อ ${index + 1} ${answered ? 'ตอบแล้ว' : 'ยังไม่ตอบ'}`);
    if (index === quiz.position) button.setAttribute('aria-current', 'step');
    map.append(button);
  });
}

function moveQuiz(index) {
  quiz.position = index;
  save();
  renderQuiz();
  focusQuestion($('quiz-card'));
}

function renderQuiz() {
  const { order, position } = quiz;
  const id = order[position];
  const card = cards[id];
  const el = exercise(card, position, order.length, subjects[card.subject]);
  const previousOrder = quiz.options[id];
  if (!previousOrder || card.options.some(option => !previousOrder.includes(option))) {
    quiz.options[id] = shuffle(card.options);
    if (!card.options.includes(quiz.answers[id])) delete quiz.answers[id];
    save();
  }
  el.append(optionGroup(id, card, quiz.options[id], quiz.answers[id], false, value => {
    quiz.answers[id] = value;
    save();
    updateQuizStatus();
    renderQuizMap();
  }));
  el.append(navigation(position, order.length, step => moveQuiz(position + step)));
  $('quiz-card').replaceChildren(el);
  $('submit-exam').disabled = false;
  renderQuizMap();
  updateQuizStatus();
}

function submitExam() {
  const remaining = quiz.order.length - answerCount(quiz);
  if (remaining && !window.confirm(`ยังไม่ได้ตอบ ${remaining} ข้อ ต้องการส่งข้อสอบตอนนี้หรือไม่?`)) return;
  $('submit-exam').disabled = true;
  const responses = quiz.order.map(id => ({
    id,
    selected: quiz.answers[id] ?? null,
    correct: cards[id].answer,
    subject: cards[id].subject,
  }));
  const attempt = {
    id: `${quiz.deckId}-${Date.now()}`,
    deckId: quiz.deckId,
    title: quiz.title,
    retry: quiz.retry,
    finished: new Date().toISOString(),
    correct: responses.filter(item => item.selected === item.correct).length,
    total: responses.length,
    responses,
  };
  state.attempts.unshift(attempt);
  delete state.drafts[quiz.id];
  state.last = null;
  save();
  openResult(attempt);
}

function renderSummary(attempt) {
  const score = node('div');
  score.append(node('p', 'คะแนนรวม'), node('strong', `${attempt.correct} / ${attempt.total}`, 'big-score'));
  const missed = attempt.total - attempt.correct;
  score.append(node('p', missed ? `ทบทวนอีก ${missed} ข้อ` : 'ตอบถูกทุกข้อ'));
  const breakdown = node('div');
  for (const [id, label] of Object.entries(subjects)) {
    const items = attempt.responses.filter(entry => entry.subject === id);
    if (!items.length) continue;
    const correct = items.filter(entry => entry.selected === entry.correct).length;
    const row = node('div', '', 'score-line');
    const header = node('div');
    header.append(node('span', label), node('strong', `${correct} / ${items.length}`));
    const bar = node('progress');
    bar.max = items.length;
    bar.value = correct;
    bar.setAttribute('aria-label', `คะแนน${label}`);
    row.append(header, bar);
    breakdown.append(row);
  }
  $('result-summary').replaceChildren(score, breakdown);
}

function renderResultActions(attempt) {
  const box = $('result-actions');
  box.replaceChildren();
  const original = byDeck[attempt.deckId];
  const missed = attempt.responses.filter(item => item.selected !== item.correct && cards[item.id]);
  if (missed.length && original) {
    const draft = state.drafts[`retry-${attempt.id}`];
    box.append(action(draft ? 'ทำซ้ำข้อที่พลาดต่อ →' : `ทำซ้ำ ${missed.length} ข้อที่พลาด →`,
      () => openQuiz(original, draft, attempt), 'button primary'));
  }
  const complete = completedFullExams();
  const next = exams.find(deck => !complete.has(deck.id));
  if (next) {
    box.append(action(`${state.drafts[next.id] ? 'ทำต่อ' : 'ลองชุดใหม่'} · ${next.title}`,
      () => openQuiz(next, state.drafts[next.id]), missed.length ? 'button' : 'button primary'));
  } else {
    box.append(node('p', 'ทำข้อสอบจำลองครบทุกชุดแล้ว กลับมาทำข้อที่พลาดอีกครั้งก่อนเริ่มชุดใหม่ได้', 'next-note'));
    box.append(action('ดูข้อสอบทั้งหมด', () => go('exams')));
  }
}

function renderReview() {
  const items = result.responses.map((item, index) => ({ ...item, index }));
  const wrong = items.filter(item => item.selected !== item.correct);
  pressedGroup($('review-filter'), [
    ['missed', `ข้อที่พลาด (${wrong.length})`],
    ['all', `ทุกข้อ (${items.length})`],
  ], reviewMode, value => {
    reviewMode = value;
    renderReview();
  });
  const list = $('review-list');
  list.replaceChildren();
  const showing = reviewMode === 'missed' ? wrong : items;
  if (!showing.length) list.append(node('p', 'ไม่มีข้อที่พลาด'));
  for (const item of showing) {
    const card = cards[item.id];
    const detail = node('details');
    const summary = node('summary');
    const status = item.selected === item.correct ? 'ถูก' : item.selected === null ? 'เว้นว่าง' : 'ผิด';
    const question = node('span', card?.question ?? 'ข้อนี้ออกจากคลังคำถามแล้ว');
    question.lang = card?.subject ?? 'th';
    summary.append(node('span', status, status === 'ถูก' ? 'status-word' : 'status-word missed'),
      document.createTextNode(`ข้อ ${item.index + 1} · `), question);
    detail.append(summary);
    if (card?.passage) detail.append(readingPassage(card.passage));
    if (card) detail.append(answerPanel(card, item.selected, item.correct, true));
    list.append(detail);
  }
}

function openResult(attempt) {
  result = attempt;
  reviewMode = attempt.correct === attempt.total ? 'all' : 'missed';
  $('result-title').textContent = attempt.title;
  renderSummary(attempt);
  renderResultActions(attempt);
  renderReview();
  show('result');
}

document.querySelector('.brand').addEventListener('click', () => go('library'));
for (const button of document.querySelectorAll('nav button')) {
  button.addEventListener('click', () => go(button.dataset.view));
}
$('study-back').addEventListener('click', () => go(study.deck.kind === 'review' ? 'history' : 'library'));
$('study-search').addEventListener('input', event => {
  if (event.target.value.trim() && !$('study-search').dataset.started) {
    activeLevel = 0;
    $('study-search').dataset.started = 'yes';
    renderLevelFilter();
  }
  if (!event.target.value.trim()) delete $('study-search').dataset.started;
  renderStudyList();
});
$('library-subject').addEventListener('change', renderStudyList);
$('shuffle-study').addEventListener('click', shuffleStudy);
$('quiz-back').addEventListener('click', () => go('exams'));
$('result-back').addEventListener('click', () => go('history'));
$('submit-exam').addEventListener('click', submitExam);
$('next-unanswered').addEventListener('click', () => {
  const order = quiz.order;
  const start = quiz.position;
  for (let offset = 1; offset <= order.length; offset++) {
    const index = (start + offset) % order.length;
    if (!Object.hasOwn(quiz.answers, order[index])) {
      moveQuiz(index);
      return;
    }
  }
});
window.addEventListener('storage', event => {
  if (event.key !== storageKey) return;
  // Keep active answer controls stable. Reconcile stored data on a top-level view.
  if (!['library', 'exams', 'history'].includes(currentView)) return;
  Object.assign(state, loadProgress());
  go(currentView, false);
});
go('library', false);
