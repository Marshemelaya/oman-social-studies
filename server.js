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

// النماذج بالترتيب: إذا فشل الأول ينتقل للتالي
const MODELS = ['gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.1-flash-lite'];

// ذاكرة مؤقتة لعدم استهلاك الطلبات بلا داعٍ
const cache = new Map();

async function generateWithFallback(prompt) {
    let lastErr;
    for (const model of MODELS) {
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
                break;
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

        // التوجيه المحدث والمخصص ليشمل جميع الصفوف العمانية (من 5 إلى 12) بدقة عالية ونمط تفاعلي
        const prompt = `أنت خبير ومستشار تربوي لمناهج الدراسات الاجتماعية في سلطنة عمان (لجميع الصفوف الدراسية من الخامس وحتى الثاني عشر، بما فيها مواد الجغرافيا، التاريخ، والدراسات العالمية الحديثة). 
        بناءً على طلب المعلم: "${userQuery}", قم بتوليد ورقة عمل ومشروع تفصيلي غني يناسب المنهج العماني بدقة.
        
        اجعل محتوى النشاط احترافياً ويشبه أوراق العمل التفاعلية المتقدمة (مثل استراتيجيات: فكر وزاوج وشارك، التحليل الجغرافي أو التاريخي، قراءة النصوص والخرائط، واستنتاج العلاقات).
        
        أجب بصيغة JSON صحيحة تماماً وباللغة العربية بدون أي رموز Markdown إضافية، وتحتوي حصرياً على البنية التالية:
        {
          "title": "عنوان الدرس أو المشروع بدقة للمنهج العماني",
          "grade": "الصف الدراسي (مثل: الصف الحادي عشر / الصف الثاني عشر / ...)",
          "branch": "الفرع (جغرافيا، تاريخ، تراث، مؤسسات، إلخ)",
          "character": "🎓",
          "characterTitle": "قائد النشاط الميداني",
          "characterHint": "جاهز للتنفيذ والتحليل",
          "image": "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=500",
          "imageCaption": "تعليق توضيحي يربط الدرس ببيئة سلطنة عمان",
          "description": "الهدف الاستراتيجي أو فكرة النص والتحليل الأساسية للدرس",
          "detailedSteps": [
            { "stage": "المرحلة الأولى: التحليل والاستنتاج", "detail": "تفاصيل الخطوة بناءً على قراءة النصوص أو الخرائط" },
            { "stage": "المرحلة الثانية: العمل الجماعي (فكر - زاوج - شارك)", "detail": "تفاصيل النقاش ومقارنة الاستنتاجات بين الطلاب" },
            { "stage": "المرحلة الثالثة: مهمة التحدي", "detail": "سؤال ختامي يقيس العمق المعرفي وربط المفهوم بالواقع العماني" }
          ],
          "studentRole": "تقسيم أدوار الطلاب وتوزيع المهام البحثية والتحليلية",
          "assessment": "أداة التقويم وتدقيق الإنجاز (بما فيها معايير تقييم الاستنتاجات)"
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
    console.log(`Server is running on http://localhost:{port}`);
});
