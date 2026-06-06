'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const passport = require('passport');

const db = require('./src/db');
const discord = require('./src/discord');
const auth = require('./src/auth');

const app = express();
const PORT = process.env.PORT || 3000;

const strategyReady = auth.configurePassport();

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static assets
app.use(express.static(path.join(__dirname, 'public')));

// Body parsing
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Sessions - IMPORTANT: Must be before passport
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'change-me-federal-studio',
    resave: false,
    saveUninitialized: false,
    cookie: { 
      maxAge: 1000 * 60 * 60 * 24 * 7,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    },
  })
);

// Passport initialization - MUST be after session
app.use(passport.initialize());
app.use(passport.session());

// Expose base url + brand to all views
app.use((req, res, next) => {
  res.locals.baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
  res.locals.brand = 'Federal Studio';
  res.locals.currentPath = req.path;
  next();
});

// Attach isAdmin to the request for authenticated users
async function withRole(req, res, next) {
  res.locals.user = req.user || null;
  res.locals.isAdmin = req.user ? await auth.isAdmin(req.user) : false;
  next();
}
app.use(withRole);

// ----------------------------------------------------------------------------
// Auth routes
// ----------------------------------------------------------------------------
app.get('/', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/dashboard');
  res.render('home', { strategyReady });
});

app.get('/login', (req, res, next) => {
  if (!strategyReady) {
    return res.status(503).render('setup', {});
  }
  return passport.authenticate('discord')(req, res, next);
});

app.get(
  '/callback',
  (req, res, next) => {
    if (!strategyReady) return res.redirect('/');
    return passport.authenticate('discord', { failureRedirect: '/' })(req, res, next);
  },
  (req, res) => {
    // User is now authenticated
    const dest = req.session.returnTo || '/dashboard';
    delete req.session.returnTo;
    // Save session before redirecting
    req.session.save(() => {
      res.redirect(dest);
    });
  }
);

app.get('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.redirect('/');
  });
});

// ----------------------------------------------------------------------------
// Dashboard
// ----------------------------------------------------------------------------
app.get('/dashboard', auth.ensureAuthenticated, (req, res) => {
  const candidatures = db.listCandidatures();
  const counts = {};
  db.listSubmissions().forEach((s) => {
    counts[s.candidatureId] = (counts[s.candidatureId] || 0) + 1;
  });
  res.render('dashboard', { candidatures, counts });
});

// ----------------------------------------------------------------------------
// Candidature management (admin)
// ----------------------------------------------------------------------------
app.get('/create', auth.ensureAdmin, (req, res) => {
  res.render('create', {});
});

app.post('/candidatures', auth.ensureAdmin, (req, res) => {
  let questions = [];
  try {
    questions = JSON.parse(req.body.questions || '[]');
  } catch (e) {
    questions = [];
  }
  // Normalise questions
  questions = (Array.isArray(questions) ? questions : [])
    .filter((q) => q && q.label)
    .map((q, i) => ({
      id: `q${i + 1}`,
      label: String(q.label).slice(0, 300),
      type: ['short', 'long', 'choice'].includes(q.type) ? q.type : 'short',
      required: Boolean(q.required),
      options: Array.isArray(q.options)
        ? q.options.map((o) => String(o).slice(0, 120)).filter(Boolean)
        : [],
    }));

  const candidature = db.createCandidature({
    title: req.body.title,
    description: req.body.description,
    questions,
    createdBy: { id: req.user.id, username: req.user.username },
  });

  res.redirect(`/candidature/${candidature.slug}/manage?created=1`);
});

app.get('/candidature/:slug/manage', auth.ensureAdmin, (req, res) => {
  const candidature = db.getCandidature(req.params.slug);
  if (!candidature) {
    return res.status(404).render('error', {
      user: req.user,
      code: 404,
      message: 'Candidature introuvable.',
    });
  }
  const submissions = db.listSubmissions(candidature.id);
  res.render('manage', {
    candidature,
    submissions,
    created: req.query.created === '1',
  });
});

app.post('/candidature/:slug/toggle', auth.ensureAdmin, (req, res) => {
  const candidature = db.getCandidature(req.params.slug);
  if (!candidature) return res.redirect('/dashboard');
  db.updateCandidature(candidature.id, {
    status: candidature.status === 'open' ? 'closed' : 'open',
  });
  res.redirect(`/candidature/${candidature.slug}/manage`);
});

app.post('/candidature/:slug/delete', auth.ensureAdmin, (req, res) => {
  const candidature = db.getCandidature(req.params.slug);
  if (candidature) db.deleteCandidature(candidature.id);
  res.redirect('/dashboard');
});

app.post('/submission/:id/status', auth.ensureAdmin, (req, res) => {
  const submission = db.getSubmission(req.params.id);
  if (!submission) return res.redirect('/dashboard');
  const status = ['accepted', 'rejected', 'pending'].includes(req.body.status)
    ? req.body.status
    : 'pending';
  db.updateSubmission(submission.id, { status });
  const candidature = db.getCandidature(submission.candidatureId);
  res.redirect(`/candidature/${candidature ? candidature.slug : ''}/manage`);
});

// ----------------------------------------------------------------------------
// Public application flow (any authenticated user via shareable link)
// ----------------------------------------------------------------------------
app.get('/apply/:slug', auth.ensureAuthenticated, (req, res) => {
  const candidature = db.getCandidature(req.params.slug);
  if (!candidature) {
    return res.status(404).render('error', {
      user: req.user,
      code: 404,
      message: "Cette candidature n'existe pas ou a été supprimée.",
    });
  }
  res.render('apply', { candidature, submitted: req.query.submitted === '1' });
});

app.post('/apply/:slug', auth.ensureAuthenticated, async (req, res) => {
  const candidature = db.getCandidature(req.params.slug);
  if (!candidature) {
    return res.status(404).render('error', {
      user: req.user,
      code: 404,
      message: "Cette candidature n'existe pas.",
    });
  }
  if (candidature.status !== 'open') {
    return res.status(403).render('error', {
      user: req.user,
      code: 403,
      message: 'Cette candidature est fermée.',
    });
  }

  const answers = {};
  for (const q of candidature.questions) {
    answers[q.id] = String(req.body[`answer_${q.id}`] || '').trim();
  }

  const submission = db.createSubmission({
    candidatureId: candidature.id,
    applicant: {
      id: req.user.id,
      username: req.user.username,
      avatar: req.user.avatar,
    },
    answers,
  });

  // Relay to Discord if a bot + channel are connected.
  const settings = db.getSettings();
  if (settings.botToken && settings.logChannelId) {
    const fields = candidature.questions.map((q) => ({
      name: q.label.slice(0, 256),
      value: (answers[q.id] || '—').slice(0, 1024),
    }));
    discord
      .sendMessage(settings.botToken, settings.logChannelId, {
        embeds: [
          {
            title: `Nouvelle candidature — ${candidature.title}`,
            color: 0x1b3a5b,
            author: {
              name: `${req.user.username} (${req.user.id})`,
              icon_url: req.user.avatar,
            },
            fields: fields.length ? fields : [{ name: 'Info', value: 'Aucune réponse.' }],
            timestamp: new Date().toISOString(),
            footer: { text: 'Federal Studio' },
          },
        ],
      })
      .catch(() => {});
  }

  res.redirect(`/apply/${candidature.slug}?submitted=1`);
});

// ----------------------------------------------------------------------------
// Bot connection settings (admin)
// ----------------------------------------------------------------------------
app.get('/settings', auth.ensureAdmin, (req, res) => {
  const settings = db.getSettings();
  res.render('settings', {
    settings,
    test: req.query.test || null,
    error: req.query.error ? decodeURIComponent(req.query.error) : null,
    botName: req.query.bot ? decodeURIComponent(req.query.bot) : null,
  });
});

app.post('/settings', auth.ensureAdmin, async (req, res) => {
  const saved = db.saveSettings({
    botToken: String(req.body.botToken || '').trim(),
    guildId: String(req.body.guildId || '').trim(),
    logChannelId: String(req.body.logChannelId || '').trim(),
    adminRoleId: String(req.body.adminRoleId || '').trim(),
  });

  const result = await discord.checkBot(saved.botToken, saved.guildId);
  if (result.ok) {
    const name = result.bot ? `${result.bot.username}` : 'bot';
    return res.redirect(`/settings?test=ok&bot=${encodeURIComponent(name)}`);
  }
  return res.redirect(`/settings?test=fail&error=${encodeURIComponent(result.error || 'Erreur')}`);
});

// ----------------------------------------------------------------------------
// 404
// ----------------------------------------------------------------------------
app.use((req, res) => {
  res.status(404).render('error', {
    user: req.user || null,
    code: 404,
    message: 'Page introuvable.',
  });
});

app.listen(PORT, () => {
  console.log(`Federal Studio actif sur http://localhost:${PORT}`);
  if (!strategyReady) {
    console.log('⚠️  Discord OAuth non configuré. Renseigne DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET dans .env');
  }
});

module.exports = app;
