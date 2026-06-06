'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const DEFAULT_DATA = {
  candidatures: [],
  submissions: [],
  settings: {
    botToken: '',
    guildId: '',
    logChannelId: '',
    adminRoleId: '',
  },
};

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DATA, null, 2));
  }
}

function read() {
  ensureFile();
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      candidatures: parsed.candidatures || [],
      submissions: parsed.submissions || [],
      settings: { ...DEFAULT_DATA.settings, ...(parsed.settings || {}) },
    };
  } catch (err) {
    return JSON.parse(JSON.stringify(DEFAULT_DATA));
  }
}

function write(data) {
  ensureFile();
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function id(bytes = 8) {
  return crypto.randomBytes(bytes).toString('hex');
}

function slugify(text) {
  const base = String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${base || 'candidature'}-${crypto.randomBytes(3).toString('hex')}`;
}

// ---- Candidatures ----
function listCandidatures() {
  return read().candidatures.sort((a, b) => b.createdAt - a.createdAt);
}

function getCandidature(idOrSlug) {
  const data = read();
  return data.candidatures.find((c) => c.id === idOrSlug || c.slug === idOrSlug) || null;
}

function createCandidature({ title, description, questions, createdBy }) {
  const data = read();
  const candidature = {
    id: id(),
    slug: slugify(title),
    title: String(title || 'Candidature').trim(),
    description: String(description || '').trim(),
    questions: Array.isArray(questions) ? questions : [],
    status: 'open',
    createdBy,
    createdAt: Date.now(),
  };
  data.candidatures.push(candidature);
  write(data);
  return candidature;
}

function updateCandidature(idOrSlug, patch) {
  const data = read();
  const idx = data.candidatures.findIndex((c) => c.id === idOrSlug || c.slug === idOrSlug);
  if (idx === -1) return null;
  data.candidatures[idx] = { ...data.candidatures[idx], ...patch };
  write(data);
  return data.candidatures[idx];
}

function deleteCandidature(idOrSlug) {
  const data = read();
  const before = data.candidatures.length;
  data.candidatures = data.candidatures.filter((c) => c.id !== idOrSlug && c.slug !== idOrSlug);
  const validIds = new Set(data.candidatures.map((c) => c.id));
  data.submissions = data.submissions.filter((s) => validIds.has(s.candidatureId));
  write(data);
  return before !== data.candidatures.length;
}

// ---- Submissions ----
function listSubmissions(candidatureId) {
  const subs = read().submissions.sort((a, b) => b.createdAt - a.createdAt);
  if (candidatureId) return subs.filter((s) => s.candidatureId === candidatureId);
  return subs;
}

function getSubmission(submissionId) {
  return read().submissions.find((s) => s.id === submissionId) || null;
}

function createSubmission({ candidatureId, applicant, answers }) {
  const data = read();
  const submission = {
    id: id(),
    candidatureId,
    applicant,
    answers: answers || {},
    status: 'pending',
    createdAt: Date.now(),
  };
  data.submissions.push(submission);
  write(data);
  return submission;
}

function updateSubmission(submissionId, patch) {
  const data = read();
  const idx = data.submissions.findIndex((s) => s.id === submissionId);
  if (idx === -1) return null;
  data.submissions[idx] = { ...data.submissions[idx], ...patch };
  write(data);
  return data.submissions[idx];
}

// ---- Settings ----
function getSettings() {
  return read().settings;
}

function saveSettings(patch) {
  const data = read();
  data.settings = { ...data.settings, ...patch };
  write(data);
  return data.settings;
}

module.exports = {
  listCandidatures,
  getCandidature,
  createCandidature,
  updateCandidature,
  deleteCandidature,
  listSubmissions,
  getSubmission,
  createSubmission,
  updateSubmission,
  getSettings,
  saveSettings,
};
