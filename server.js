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
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
app.use(limiter);

// 🚀 إعدادات الجلسة الخرافية (لحل مشكلة تسجيل الدخول في Render)
app.set('trust proxy', 1);
app.use(session({
    secret: 'hydra-quantum-ai-secret-key-2026',
    resave: true, 
    saveUninitialized: true,
    cookie: {
        secure: true, // يجب أن تكون true لأن Render يستخدم HTTPS
        sameSite: 'none', // ⚡ هذا السطر السحري يمنع جوجل من تدمير الجلسة عند العودة للموقع
        maxAge: 24 * 60 * 60 * 1000 
    }
}));

app.use(passport.initialize());
app.use(passport.session());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// إعداد Google OAuth
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: 'https://hydra-exchange.onrender.com/auth/google/callback',
    passReqToCallback: true
}, async (req, accessToken, refreshToken, profile, done) => {
    try {
        let channelName = profile.displayName || 'منشئ محتوى';
        let user = await User.findOne({ googleId: profile.id });
        
        if (!user) {
            const referredBy = req.session.refCode || null;
            user = new User({
                googleId: profile.id,
                channelName: channelName,
                channelId: profile.id,
                tokens: { accessToken: accessToken, refreshToken: refreshToken || '' },
                referredBy: referredBy,
                credits: 5 // هدية ترحيبية 5 نقاط للمستخدم الجديد
            });
            await user.save();
            if (referredBy) {
                await User.findOneAndUpdate({ referralCode: referredBy }, { $inc: { credits: 10 } });
            }
        } else {
            user.tokens.accessToken = accessToken;
            if (refreshToken) user.tokens.refreshToken = refreshToken;
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
            'https://www.googleapis.com/auth/youtube.readonly' // نكتفي بصلاحية القراءة فقط لتسهيل القبول
        ],
        prompt: 'consent',
        accessType: 'offline'
    })(req, res, next);
});

app.get('/auth/google/callback', 
    passport.authenticate('google', { failureRedirect: '/?error=login_failed' }),
    (req, res) => res.redirect('/dashboard.html')
);

// 📡 API جلب البيانات (مع نظام اصطياد الأخطاء)
app.get('/api/youtube-data', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'غير مسجل الدخول' });
    try {
        const accessToken = req.user.tokens.accessToken;
        
        // جلب الإحصائيات
        const channelRes = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const channelData = await channelRes.json();
        if (channelData.error) throw new Error(channelData.error.message);

        // جلب الفيديوهات
        const videosRes = await fetch('https://www.googleapis.com/youtube/v3/search?part=snippet&forMine=true&type=video&maxResults=10', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const videosData = await videosRes.json();
        if (videosData.error) throw new Error(videosData.error.message);

        res.json({
            user: req.user,
            channel: channelData.items ? channelData.items[0] : null,
            videos: videosData.items || []
        });
    } catch (error) {
        console.error("YouTube API Error:", error.message);
        res.status(500).json({ error: 'فشل الاتصال بيوتيوب', details: error.message });
    }
});

app.get('/logout', (req, res) => {
    req.logout(() => { req.session.destroy(() => res.redirect('/')); });
});

app.listen(PORT, () => console.log(`🚀 السيرفر يعمل بقوة على منفذ ${PORT}`));
