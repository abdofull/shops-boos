// ==========================================
// سكريبت لتحديث البيانات القديمة وتخصيصها للأدمن
// ==========================================

// تحميل متغيرات البيئة
require('dotenv').config();

// استدعاء مكتبات Firebase
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

// دالة لتنظيف المفتاح الخاص
function cleanPrivateKey(key) {
    if (!key) return undefined;
    
    return key
        .replace(/"/g, '') // إزالة علامات الاستشهاد
        .replace(/\\n/g, '\n') // استبدال \\n بـ \n
        .replace(/\n\n/g, '\n') // إزالة الأسطر الفارغة الإضافية
        .trim();
}

// التحقق من وجود ملف JSON محلي أولاً (للتطوير)
let serviceAccount;

try {
    // محاولة قراءة ملف JSON الصحيح
    serviceAccount = require('./serviceAccountKey.json');
} catch (err) {
    // إذا لم يوجد الملف، نستخدم متغيرات البيئة (للإنتاج)
    if (process.env.FIREBASE_PROJECT_ID) {
        serviceAccount = {
            type: 'service_account',
            project_id: process.env.FIREBASE_PROJECT_ID,
            private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
            private_key: cleanPrivateKey(process.env.FIREBASE_PRIVATE_KEY),
            client_email: process.env.FIREBASE_CLIENT_EMAIL,
            client_id: process.env.FIREBASE_CLIENT_ID,
            auth_uri: 'https://accounts.google.com/o/oauth2/auth',
            token_uri: 'https://oauth2.googleapis.com/token',
        };
    } else {
        console.error('❌ خطأ: لم يتم العثور على ملف serviceAccountKey.json أو متغيرات البيئة');
        process.exit(1);
    }
}

// تهيئة تطبيق فايربيس
initializeApp({
  credential: cert(serviceAccount)
});

// حفظ مرجع لقاعدة البيانات
const db = getFirestore();
const auth = getAuth();

// ==========================================
// دالة تحديث البيانات القديمة
// ==========================================

async function migrateOldData() {
    console.log('🔄 بدء تحديث البيانات القديمة...');
    
    try {
        // البريد الإلكتروني للأدمن
        const adminEmail = 'tankoabdo348@gmail.com';
        
        // الحصول على المستخدم من Firebase Auth
        let adminUser;
        try {
            // البحث عن المستخدم بالبريد الإلكتروني
            adminUser = await auth.getUserByEmail(adminEmail);
            console.log(`✅ تم العثور على المستخدم: ${adminEmail}`);
            console.log(`📝 User ID: ${adminUser.uid}`);
        } catch (error) {
            console.error(`❌ لم يتم العثور على المستخدم بالبريد: ${adminEmail}`);
            console.log('💡 يرجى إنشاء حساب لهذا البريد أولاً في Firebase Console');
            process.exit(1);
        }

        const adminUid = adminUser.uid;
        
        // مصفوفة بأسماء جميع المجموعات (Collections)
        const collections = ['expenses', 'batches', 'medications', 'sales'];
        
        let totalUpdated = 0;
        
        // المرور على كل مجموعة وتحديث المستندات
        for (const col of collections) {
            console.log(`\n📂 معالجة مجموعة: ${col}`);
            
            // جلب جميع المستندات التي لا تحتوي على userId
            const snapshot = await db.collection(col).get();
            
            let updatedCount = 0;
            
            // استخدام Batch لعمليات التحديث المتعددة السريعة
            const batch = db.batch();
            
            snapshot.docs.forEach((doc) => {
                const data = doc.data();
                
                // التحقق من أن المستند لا يحتوي على userId
                if (!data.userId) {
                    // تحديث المستند بإضافة userId للأدمن
                    batch.update(doc.ref, { userId: adminUid });
                    updatedCount++;
                }
            });
            
            // تنفيذ التحديث لهذه المجموعة
            if (updatedCount > 0) {
                await batch.commit();
                console.log(`✅ تم تحديث ${updatedCount} مستند في مجموعة ${col}`);
                totalUpdated += updatedCount;
            } else {
                console.log(`ℹ️ جميع المستندات في مجموعة ${col} تحتوي بالفعل على userId`);
            }
        }
        
        console.log(`\n✨ تم الانتهاء من تحديث البيانات بنجاح!`);
        console.log(`📊 إجمالي المستندات المحدثة: ${totalUpdated}`);
        console.log(`👤 جميع البيانات القديمة مخصصة الآن للمستخدم: ${adminEmail}`);
        
    } catch (error) {
        console.error('❌ حدث خطأ أثناء تحديث البيانات:', error);
        process.exit(1);
    }
}

// تنفيذ السكريبت
migrateOldData().then(() => {
    console.log('\n🎉 السكريبت تم تنفيذه بنجاح!');
    process.exit(0);
}).catch((error) => {
    console.error('❌ فشل تنفيذ السكريبت:', error);
    process.exit(1);
});
