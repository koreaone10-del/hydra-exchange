const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const path = require('path');
const { connectDB, User } = require('./database');

const app = express();
const PORT = process.env.PORT || 10000;

// الاتصال بقاعدة البيانات
connectDB();

// إعداد الجلسات
app.use(session({
    secret: 'hydra-exchange-super-secret-key',
    resave: false,
    saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// إعداد استراتيجية Google OAuth مع حماية كاملة من الأخطاء
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: 'https://hydra-exchange.onrender.com/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let channelName = profile.displayName || (profile.emails && profile.emails[0] ? profile.emails[0].value : 'مستخدم يوتيوب');
        
        let user = await User.findOne({ googleId: profile.id });
        if (!user) {
            user = new User({
                googleId: profile.id,
                channelName: channelName,
                channelId: profile.id,
                tokens: { accessToken: accessToken || '', refreshToken: refreshToken || '' },
                credits: 50
            });
            await user.save();
        } else {
            user.tokens = { accessToken: accessToken || '', refreshToken: refreshToken || user.tokens?.refreshToken || '' };
            user.channelName = channelName;
            await user.save();
        }
        return done(null, user);
    } catch (err) {
        console.error("OAuth Error:", err);
        return done(err, null);
    }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

// المسارات
app.get('/auth/google', passport.authenticate('google', {
    scope: ['profile', 'email', 'https://www.googleapis.com/auth/youtube.readonly', 'https://www.googleapis.com/auth/youtube.force-ssl']
}));

app.get('/auth/google/callback', 
    passport.authenticate('google', { failureRedirect: '/' }),
    (req, res) => {
        res.redirect('/dashboard.html');
    }
);

app.get('/api/current_user', (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'غير مسجل الدخول' });
    }
    res.json(req.user);
});

app.get('/logout', (req, res) => {
    req.logout(() => {
        res.redirect('/');
    });
});

app.listen(PORT, () => {
    console.log(`الخادم يعمل بامتياز على المنفذ ${PORT}`);
});
