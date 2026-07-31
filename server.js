require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const cors = require('cors');
const { connectDB, User } = require('./database'); // استدعاء قاعدة البيانات التي أنشأناها في الملف الآخر

const app = express();
app.use(cors());
app.use(express.json());

// 1. تشغيل الاتصال بقاعدة البيانات
connectDB();

// 2. إعداد جسر التواصل مع جوجل باستخدام المتغيرات البيئية السرية
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.REDIRECT_URI
);

// الصلاحيات المطلوبة (قراءة الفيديوهات والتفاعل)
const SCOPES = [
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/youtube.force-ssl'
];

// 3. مسار تسجيل الدخول (البوابة التي يضغط عليها الزبون)
app.get('/auth/google', (req, res) => {
    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline', // ضروري جداً للحصول على الرموز الدائمة
        prompt: 'consent',
        scope: SCOPES,
    });
    res.redirect(url);
});

// 4. مسار العودة (بعد موافقة الزبون في صفحة جوجل)
app.get('/auth/google/callback', async (req, res) => {
    const code = req.query.code;
    try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
        
        // جلب بيانات قناة الزبون
        const channelResponse = await youtube.channels.list({
            part: 'snippet,statistics',
            mine: true
        });

        const myChannel = channelResponse.data.items[0];
        
        // 🧠 الذكاء الاصطناعي لحفظ بيانات الزبون
        let user = await User.findOne({ googleId: myChannel.id });
        
        if (user) {
            // تحديث المفاتيح السرية إذا عاد الزبون للتسجيل
            user.tokens = tokens;
            await user.save();
        } else {
            // زبون جديد! تسجيله في قاعدة البيانات وإعطاؤه 50 نقطة مجانية
            user = new User({
                googleId: myChannel.id,
                channelName: myChannel.snippet.title,
                channelId: myChannel.id,
                tokens: tokens,
                role: 'user' 
            });
            await user.save();
        }

        // واجهة نجاح التسجيل التي ستظهر للزبون
        res.send(`
            <div style="font-family: Arial, sans-serif; text-align: center; margin-top: 50px; background-color: #0d1117; color: #c9d1d9; padding: 50px; border-radius: 10px;">
                <h1 style="color: #4ade80;">✅ تمت المصادقة بنجاح!</h1>
                <h2>مرحباً يا: ${user.channelName}</h2>
                <p>رصيدك الحالي: <b style="color: #58a6ff; font-size: 20px;">${user.credits} نقاط</b></p>
                <p style="color: #8b949e; margin-top: 20px;">(تم حفظ بياناتك بأمان في قاعدة البيانات، يمكنك الآن إغلاق هذه النافذة)</p>
            </div>
        `);

    } catch (error) {
        console.error('🔴 خطأ في المصادقة:', error);
        res.status(500).send('فشل تسجيل الدخول. يرجى المحاولة مرة أخرى.');
    }
});

// مسار رئيسي لفحص حالة الخادم
app.get('/', (req, res) => {
    res.send('🚀 خادم Hydra Exchange يعمل بنجاح وجاهز لاستقبال الطلبات!');
});

// تشغيل الخادم
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`الخادم يعمل بامتياز على المنفذ ${PORT}`));
