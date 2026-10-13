const express = require('express');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

if (!process.env.GEMINI_API_KEY) {
    console.error('تحذير: متغير GEMINI_API_KEY غير موجود!');
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// النماذج بالترتيب: إذا فشل الأول ينتقل للتالي (لكل نموذج حصة يومية منفصلة)
const MODELS = ['gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.1-flash-lite'];

// ذاكرة مؤقتة: البحث المتكرر لا يستهلك طلبات جديدة
const cache = new Map();

async function generateWithFallback(prompt) {
    let lastErr;
    for (const model of MODELS) {
        // محاولتان لكل نموذج في حالة الضغط المؤقت (503) فقط
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                return await ai.models.generateContent({
                    model,
                    contents: prompt,
                    config: { responseMimeType: 'application/json' }
                });
            } catch (err) {
                lastErr = err;
                console.error(`فشل ${model} (محاولة ${attempt + 1}):`, err.status);
                if (err.status === 503 && attempt === 0) {
                    await new Promise(r => setTimeout(r, 2000));
                    continue;
                }
                break; // 429 أو 404 أو غيرها: انتقل للنموذج التالي مباشرة
            }
        }
    }
    throw lastErr;
}

app.post('/api/generate-activity', async (req, res) => {
    try {
        const userQuery = (req.body.query || 'الصف الثامن').trim();

        if (userQuery.length > 200) {
            return res.status(400).json({ error: 'النص طويل جداً، اكتب اسم الدرس أو الصف باختصار.' });
        }

        if (cache.has(userQuery)) {
            return res.json(cache.get(userQuery));
        }

        const prompt = `أنت مساعد مادة الدراسات الاجتماعية للمنهج العماني. بناءً على طلب المعلم: "${userQuery}", قم بتوليد ورقة عمل ومشروع تفصيلي. أجب بصيغة JSON صحيحة تماماً وباللغة العربية بدون أي رموز Markdown إضافية، وتحتوي على البنية التالية:
        {
          "title": "عنوان الدرس أو المشروع",
          "grade": "الصف الدراسي",
          "branch": "الفرع",
          "character": "🎓",
          "characterTitle": "قائد النشاط",
          "characterHint": "جاهز للتنفيذ",
          "image": "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=500",
          "imageCaption": "تعليق توضيحي للصورة",
          "description": "الهدف الاستراتيجي للدرس",
          "detailedSteps": [
            { "stage": "المرحلة الأولى", "detail": "تفاصيل الخطوة هنا" }
          ],
          "studentRole": "تقسيم أدوار الطلاب",
          "assessment": "أداة التقويم"
        }`;

        const response = await generateWithFallback(prompt);

        let textResponse = response.text;
        textResponse = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();

        const activityData = JSON.parse(textResponse);

        cache.set(userQuery, activityData);
        res.json(activityData);

    } catch (error) {
        console.error('خطأ من السيرفر:', error);
        const quota = error.status === 429;
        const busy = error.status === 503;
        res.status(quota ? 429 : busy ? 503 : 500).json({
            error: quota
                ? 'تم الوصول إلى الحد اليومي للاستخدام، يرجى المحاولة لاحقاً.'
                : busy
                    ? 'الخدمة مشغولة حالياً، حاول مرة أخرى بعد قليل.'
                    : 'حدث خطأ غير متوقع، حاول مرة أخرى.'
        });
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
