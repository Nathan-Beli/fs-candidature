'use strict';

const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const db = require('./db');
const discord = require('./discord');

// The hardcoded owner / super-admin. This user can always manage candidatures.
const ADMIN_ID = process.env.ADMIN_ID || '1016479613297369139';

function configurePassport() {
  const clientID = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const callbackURL =
    process.env.DISCORD_CALLBACK_URL || 'http://localhost:3000/callback';

  console.log('🔧 Passport Configuration:');
  console.log('  - CLIENT_ID:', clientID ? '✓' : '✗');
  console.log('  - CLIENT_SECRET:', clientSecret ? '✓' : '✗');
  console.log('  - CALLBACK_URL:', callbackURL);

  if (!clientID || !clientSecret) {
    console.log('❌ Discord credentials missing!');
    return false;
  }

  try {
    passport.use(
      new DiscordStrategy(
        {
          clientID,
          clientSecret,
          callbackURL,
          scope: ['identify'],
        },
        (accessToken, refreshToken, profile, done) => {
          console.log('✓ Discord profile received:', profile.id, profile.username);
          const user = {
            id: profile.id,
            username: profile.global_name || profile.username,
            discriminator: profile.discriminator,
            avatar: profile.avatar
              ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
              : 'https://cdn.discordapp.com/embed/avatars/0.png',
          };
          return done(null, user);
        }
      )
    );

    passport.serializeUser((user, done) => {
      console.log('📦 Serializing user:', user.id);
      done(null, user);
    });
    
    passport.deserializeUser((obj, done) => {
      console.log('📦 Deserializing user:', obj.id);
      done(null, obj);
    });
    
    console.log('✓ Passport Discord strategy configured');
    return true;
  } catch (err) {
    console.error('❌ Error configuring Passport:', err);
    return false;
  }
}

// Determine whether a user can create/manage candidatures.
// True if they are the hardcoded owner, OR they hold the configured admin role
// in the configured guild (verified via the connected bot).
async function isAdmin(user) {
  if (!user) return false;
  if (user.id === ADMIN_ID) return true;

  const settings = db.getSettings();
  if (settings.botToken && settings.guildId && settings.adminRoleId) {
    const roles = await discord.getMemberRoles(
      settings.botToken,
      settings.guildId,
      user.id
    );
    if (roles && roles.includes(settings.adminRoleId)) return true;
  }
  return false;
}

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  req.session.returnTo = req.originalUrl;
  return res.redirect('/login');
}

function ensureAdmin(req, res, next) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    req.session.returnTo = req.originalUrl;
    return res.redirect('/login');
  }
  isAdmin(req.user)
    .then((ok) => {
      if (ok) return next();
      return res.status(403).render('error', {
        user: req.user,
        code: 403,
        message: "Tu n'as pas l'autorisation de gérer les candidatures.",
      });
    })
    .catch((err) => {
      console.error('❌ Error checking admin:', err);
      return res.status(500).render('error', {
        user: req.user,
        code: 500,
        message: 'Erreur de vérification des permissions.',
      });
    });
}

module.exports = {
  ADMIN_ID,
  configurePassport,
  isAdmin,
  ensureAuthenticated,
  ensureAdmin,
};
