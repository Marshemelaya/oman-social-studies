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

// التأكد من أن الاستجابة تحتوي على كل الحقول بالشكل الصحيح
function normalize(d) {
    const str = (v, fallback = '') => (typeof v === 'string' && v.trim() ? v.trim() : fallback);
    const arr = (v) => (Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()) : []);
    const num = (v, min, max, fallback) => {
        const n = parseInt(v, 10);
        return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
    };

    return {
        title: str(d.title, 'ورقة عمل'),
        grade: str(d.grade),
        branch: str(d.branch),
        iconsStart: str(d.iconsStart, '📚'),
        iconsEnd: str(d.iconsEnd, '🇴🇲'),
        passage: arr(d.passage),
        think: {
            instruction: str(d.think && d.think.instruction, 'بشكل فردي، اقرأ النص واستخرج أكبر عدد ممكن من الاستنتاجات.'),
            count: num(d.think && d.think.count, 2, 5, 3)
        },
        pair: {
            instruction: str(d.pair && d.pair.instruction, 'تعاون مع زميلك، وقارنا استنتاجاتكما، ثم اتفقا على أهم الاستنتاجات.'),
            rows: num(d.pair && d.pair.rows, 2, 6, 4)
        },
        share: {
            instruction: str(d.share && d.share.instruction, 'تجتمع كل مجموعة مع بقية المجموعات، وتعرض استنتاجاتها، ثم تناقش الصف.'),
            questions: arr(d.share && d.share.questions)
        },
        challenge: {
            instruction: str(d.challenge && d.challenge.instruction),
            starter: str(d.challenge && d.challenge.starter)
        },
        teacherRole: str(d.teacherRole)
    };
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

        const prompt = `أنت خبير ومستشار تربوي لمناهج الدراسات الاجتماعية في سلطنة عمان (الصفوف من الخامس إلى الثاني عشر: جغرافيا، تاريخ، ودراسات عالمية).
بناءً على طلب المعلم: "${userQuery}"، أنشئ ورقة عمل تفاعلية على نمط "فكر - زاوج - شارك" تشبه أوراق العمل المصورة (إنفوجرافيك) في المنهج العماني.

القواعد:
- اكتب نصاً قصيراً (فقرتان إلى ثلاث، كل فقرة 3 إلى 5 جمل) مبسطاً ومناسباً لمستوى الصف ويرتبط بسلطنة عمان.
- اعتمد على معلومات دقيقة ومعروفة فقط، ولا تخترع أرقاماً أو أسماء غير مؤكدة.
- الأسئلة الموجهة للمجموعات (من 5 إلى 7 أسئلة) يجب أن تتدرج من الاستنتاج البسيط إلى التحليل والربط.
- "iconsStart" و"iconsEnd" رمزان تعبيريان (إيموجي) مناسبان لموضوع الدرس (رمز أو رمزان لكل منهما).
- أجب بصيغة JSON صحيحة تماماً وباللغة العربية فقط، بدون أي رموز Markdown، وبهذه البنية حصراً:

{
  "title": "عنوان الدرس",
  "grade": "الصف الدراسي",
  "branch": "الفرع (جغرافيا / تاريخ / ...)",
  "iconsStart": "☀️🏜️",
  "iconsEnd": "🌧️⛰️",
  "passage": ["الفقرة الأولى من النص", "الفقرة الثانية من النص"],
  "think": { "instruction": "تعليمات فقرة (فكر) الفردية", "count": 3 },
  "pair": { "instruction": "تعليمات فقرة (زاوج) مع الزميل", "rows": 4 },
  "share": {
    "instruction": "تعليمات فقرة (شارك) مع المجموعات",
    "questions": ["سؤال 1", "سؤال 2", "سؤال 3", "سؤال 4", "سؤال 5"]
  },
  "challenge": {
    "instruction": "نص مهمة التحدي (استنتج في جملة واحدة ...)",
    "starter": "بداية جملة يكملها الطالب، مثل: مناخ سلطنة عمان يتميز بـ"
  },
  "teacherRole": "دور المعلم في هذا النشاط"
}`;

        const response = await generateWithFallback(prompt);

        let textResponse = response.text;
        textResponse = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();

        const activityData = normalize(JSON.parse(textResponse));

        if (activityData.passage.length === 0) {
            throw new Error('استجابة غير مكتملة');
        }

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
