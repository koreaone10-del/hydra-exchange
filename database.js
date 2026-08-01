const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGODB_URI;
        if (!mongoURI) {
            throw new Error("MONGODB_URI is not defined in environment variables");
        }
        
        await mongoose.connect(mongoURI, {
            serverSelectionTimeoutMS: 5000
        });
        console.log('🟢 تم الاتصال بقاعدة البيانات بنجاح تام!');
    } catch (error) {
        console.error('🔴 خطأ في الاتصال بقاعدة البيانات:', error.message);
    }
};

// نموذج بيانات المستخدم (User Schema)
const userSchema = new mongoose.Schema({
    googleId: { type: String, required: true, unique: true },
    channelName: { type: String, required: true },
    channelId: { type: String, required: true },
    tokens: { type: Object, required: true },
    credits: { type: Number, default: 50 }, // 50 نقطة هدية ترحيبية
    role: { type: String, default: 'user' },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

module.exports = { connectDB, User };
