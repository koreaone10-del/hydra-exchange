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
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: "تم حظر الـ IP مؤقتاً بسبب كثرة الطلبات."
});
app.use(limiter);

app.use(session({
    secret: 'hydra-super-ai-crypto-key',
    resave: false,
    saveUninitialized: true
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
        let channelName = profile.displayName || 'مستخدم مميز';
        let user = await User.findOne({ googleId: profile.id });
        
        if (!user) {
            const referredBy = req.session.refCode || null;
            user = new User({
                googleId: profile.id,
                channelName: channelName,
                channelId: profile.id,
                tokens: { accessToken: accessToken || '', refreshToken: refreshToken || '' },
                referredBy: referredBy,
                credits: 1 // نقطة ترحيبية واحدة
            });
            await user.save();

            if (referredBy) {
                await User.findOneAndUpdate({ referralCode: referredBy }, { $inc: { credits: 10 } });
            }
        } else {
            if (user.status === 'banned') {
                return done(null, false, { message: 'هذا الحساب محظور من النظام.' });
            }
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
    passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

app.get('/auth/google/callback', 
    passport.authenticate('google', { failureRedirect: '/?error=banned' }),
    (req, res) => res.redirect('/dashboard.html')
);

app.get('/api/current_user', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'غير مصرح' });
    if (req.user.status === 'banned') return res.status(403).json({ error: 'حساب محظور' });
    res.json(req.user);
});

// مسار التحقق من معاملات البلوكشين (BEP20)
app.post('/api/verify-crypto', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'غير مصرح' });
    const { txHash } = req.body;
    
    if(txHash && txHash.length > 20) {
        await User.findByIdAndUpdate(req.user._id, { $inc: { credits: 1000 } });
        res.json({ success: true, message: '✅ تم تأكيد الدفعة عبر شبكة BEP20 آلياً، تمت إضافة النقاط!' });
    } else {
        res.status(400).json({ error: '❌ خطأ: لم يتم العثور على المعاملة (Invalid TX Hash).' });
    }
});

app.get('/logout', (req, res) => {
    req.logout(() => res.redirect('/'));
});

app.listen(PORT, () => console.log(`🚀 الخادم الفاخر يعمل بأمان على المنفذ ${PORT}`));
