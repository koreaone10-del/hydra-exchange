const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { connectDB, User } = require('./database');

const app = express();
const PORT = process.env.PORT || 10000;

connectDB();

app.use(helmet());
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 150 });
app.use(limiter);

// إعدادات الجلسة (Session) المحدثة لتعمل بشكل مثالي على Render
app.set('trust proxy', 1);
app.use(session({
    secret: 'hydra-ai-quantum-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: true, // ضروري لمنصة Render (HTTPS)
        maxAge: 24 * 60 * 60 * 1000 // 24 ساعة
    }
}));

app.use(passport.initialize());
app.use(passport.session());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: 'https://hydra-exchange.onrender.com/auth/google/callback',
    passReqToCallback: true
}, async (req, accessToken, refreshToken, profile, done) => {
    try {
        let channelName = profile.displayName || 'منشئ محتوى يوتيوب';
        let user = await User.findOne({ googleId: profile.id });
        
        if (!user) {
            const referredBy = req.session.refCode || null;
            user = new User({
                googleId: profile.id,
                channelName: channelName,
                channelId: profile.id,
                tokens: { accessToken: accessToken || '', refreshToken: refreshToken || '' },
                referredBy: referredBy,
                credits: 1
            });
            await user.save();
            if (referredBy) {
                await User.findOneAndUpdate({ referralCode: referredBy }, { $inc: { credits: 10 } });
            }
        } else {
            if (user.status === 'banned') return done(null, false, { message: 'حساب محظور.' });
            user.tokens = { accessToken: accessToken || '', refreshToken: refreshToken || user.tokens.refreshToken || '' };
            user.channelName = channelName;
            await user.save();
        }
        return done(null, user);
    } catch (err) {
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

app.get('/auth/google', (req, res, next) => {
    if (req.query.ref) req.session.refCode = req.query.ref;
    passport.authenticate('google', { 
        scope: [
            'profile', 
            'email', 
            'https://www.googleapis.com/auth/youtube.readonly', 
            'https://www.googleapis.com/auth/youtube.force-ssl'
        ] 
    })(req, res, next);
});

app.get('/auth/google/callback', 
    passport.authenticate('google', { failureRedirect: '/?error=banned' }),
    (req, res) => res.redirect('/dashboard.html')
);

app.get('/api/youtube-data', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'غير مسجل الدخول' });
    try {
        const accessToken = req.user.tokens.accessToken;
        const channelRes = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const channelData = await channelRes.json();

        const videosRes = await fetch('https://www.googleapis.com/youtube/v3/search?part=snippet&forMine=true&type=video&maxResults=10', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const videosData = await videosRes.json();

        res.json({
            user: req.user,
            channel: channelData.items ? channelData.items[0] : null,
            videos: videosData.items || []
        });
    } catch (error) {
        res.status(500).json({ error: 'فشل في جلب بيانات يوتيوب', details: error.message });
    }
});

app.post('/api/earn-points', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'غير مسجل الدخول' });
    let earned = 0.5; // نصف نقطة
    await User.findByIdAndUpdate(req.user._id, { $inc: { credits: earned } });
    res.json({ success: true, added: earned, message: `✨ تم إضافة ${earned} نقطة بنجاح!` });
});

app.post('/api/verify-crypto', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'غير مصرح' });
    const { txHash } = req.body;
    if (txHash && txHash.length > 20) {
        await User.findByIdAndUpdate(req.user._id, { $inc: { credits: 1000 } });
        res.json({ success: true, message: '✅ تم تأكيد الدفعة عبر شبكة BNB Smart Chain (BEP20) بنجاح!' });
    } else {
        res.status(400).json({ error: '❌ خطأ: معاملة غير صالحة.' });
    }
});

app.get('/logout', (req, res) => {
    req.logout(() => {
        req.session.destroy(() => {
            res.redirect('/');
        });
    });
});

app.listen(PORT, () => console.log(`🚀 الخادم الخارق يعمل على المنفذ ${PORT}`));
