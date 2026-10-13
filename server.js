const express = require('express');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ضع مفتاحك الجديد هنا مباشرة بين العلامتين
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// دالة إعادة المحاولة التلقائية لتجاوز الضغط المؤقت (أخطاء 503 أو 429)
async function generateWithRetry(params, attempts = 4) {
    for (let i = 0; i < attempts; i++) {
        try {
            return await ai.models.generateContent(params);
        } catch (err) {
            const retryable = err.status === 503 || err.status === 429;
            if (!retryable || i === attempts - 1) throw err;
            await new Promise(r => setTimeout(r, 1500 * (i + 1))); // الانتظار 1.5 ثانية، 3 ثوانٍ، 4.5 ثانية
        }
    }
}

app.post('/api/generate-activity', async (req, res) => {
    try {
        const userQuery = req.body.query || "الصف الثامن"; 
        
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

        // استخدام دالة إعادة المحاولة بدل الاستدعاء المباشر
        const response = await generateWithRetry({
            model: 'gemini-3.5-flash',
            contents: prompt,
            config: {
                responseMimeType: 'application/json'
            }
        });

        let textResponse = response.text;
        textResponse = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();

        const activityData = JSON.parse(textResponse);
        res.json(activityData);

    } catch (error) {
        console.error("خطأ من السيرفر:", error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});