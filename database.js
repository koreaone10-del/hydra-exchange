const mongoose = require('mongoose');

// ==========================================
// 1. مخطط الزبون (User Schema)
// ==========================================
const UserSchema = new mongoose.Schema({
    googleId: { type: String, required: true, unique: true },
    channelName: { type: String, required: true },
    channelId: { type: String, required: true },
    credits: { type: Number, default: 50 }, // هدية التسجيل
    role: { type: String, enum: ['user', 'admin'], default: 'user' }, 
    tokens: { 
        access_token: String,
        refresh_token: String,
        expiry_date: Number
    },
    registeredAt: { type: Date, default: Date.now }
});

// ==========================================
// 2. مخطط الفيديو (Video Schema) ومخزن التعليقات
// ==========================================
const VideoSchema = new mongoose.Schema({
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    videoId: { type: String, required: true },
    
    targetViews: { type: Number, default: 0 },
    currentViews: { type: Number, default: 0 },
    
    targetLikes: { type: Number, default: 0 },
    currentLikes: { type: Number, default: 0 },
    
    // مخزن التعليقات المخصصة
    commentsVault: [{
        text: { type: String, required: true },
        isUsed: { type: Boolean, default: false },
        usedBy: { type: String, default: null } 
    }],
    
    lastActionTime: { type: Date, default: Date.now }, 
    status: { type: String, enum: ['active', 'paused', 'completed'], default: 'active' }
});

const User = mongoose.model('User', UserSchema);
const Video = mongoose.model('Video', VideoSchema);

// ==========================================
// 3. محرك الاتصال الذكي بقاعدة البيانات
// ==========================================
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000, 
        });
        console.log('🟢 تم الاتصال بنجاح بقاعدة بيانات MongoDB Atlas');
    } catch (err) {
        console.error('🔴 خطأ في الاتصال بقاعدة البيانات:', err.message);
        setTimeout(connectDB, 5000); // محاولة إعادة الاتصال أوتوماتيكياً
    }
};

module.exports = { connectDB, User, Video };
