const express = require('express');
const passport = require('passport');
const session = require('express-session');
const DiscordStrategy = require('passport-discord').Strategy;
const app = express();

const ADMIN_ID = "1016479613297369139";

// Configuration session
app.use(session({ secret: 'secret_key', resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());

// Stratégie Discord
passport.use(new DiscordStrategy({
    clientID: '1510802876060926033',
    clientSecret: 'C5rAhf07v7hp7zQW_uqIcx9W4C3mXdt8',
    callbackURL: 'http://localhost:3000/callback',
    scope: ['identify']
}, (accessToken, refreshToken, profile, done) => done(null, profile)));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

app.get('/login', passport.authenticate('discord'));
app.get('/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => res.redirect('/dashboard'));

app.get('/dashboard', (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/login');
    
    // Logique de droits
    const isAdmin = req.user.id === ADMIN_ID;
    res.send(`
        <h1>Bienvenue ${req.user.username}</h1>
        ${isAdmin ? '<button>Créer une candidature</button>' : '<p>Accès aux candidatures</p>'}
    `);
});

app.listen(3000, () => console.log('Serveur actif sur http://localhost:3000'));
