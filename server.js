const express = require('express');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '50kb' }));
app.use(express.static(path.join(__dirname, 'public')));

if (!process.env.GEMINI_API_KEY) {
    console.error('تحذير: متغير GEMINI_API_KEY غير موجود!');
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// نماذج النص بالترتيب: إذا فشل الأول ينتقل للتالي (لكل نموذج حصة يومية منفصلة)
const MODELS = ['gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.1-flash-lite'];

// نماذج توليد الصور (يمكن تغييرها من إعدادات Render بدون تعديل الكود: IMAGE_MODELS=اسم1,اسم2)
const IMAGE_MODELS = (process.env.IMAGE_MODELS || 'gemini-3.1-flash-image-preview,gemini-2.5-flash-image')
    .split(',').map(s => s.trim()).filter(Boolean);

// حد أقصى لعدد الصور يومياً لحماية حسابك من الاستهلاك الزائد
const MAX_IMAGES_PER_DAY = parseInt(process.env.MAX_IMAGES_PER_DAY || '20', 10);

const TYPES = {
    tps: 'فكر - زاوج - شارك',
    brainstorm: 'العصف الذهني',
    mindmap: 'الخريطة الذهنية',
    classify: 'تصنيف المعلومات',
    cooperative: 'التعلم التعاوني'
};

const SUBJECTS = ['الجغرافيا', 'التاريخ'];

/* ---------- الذاكرة المؤقتة ---------- */
const cache = new Map();
function cacheSet(key, value) {
    if (cache.size >= 200) cache.delete(cache.keys().next().value);
    cache.set(key, value);
}

/* ---------- الاتصال بنموذج النص ---------- */
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

/* ---------- بنية كل نوع نشاط ---------- */
const SCHEMAS = {
    tps: `"tps": {
    "passage": ["الفقرة الأولى من نص قصير عن الجزء المحدد", "الفقرة الثانية"],
    "thinkInstruction": "تعليمات (فكر) الفردية",
    "thinkCount": 3,
    "pairInstruction": "تعليمات (زاوج) مع الزميل",
    "pairRows": 4,
    "shareInstruction": "تعليمات (شارك) مع المجموعات",
    "questions": ["5 إلى 7 أسئلة موجهة تتدرج من الاستنتاج البسيط إلى التحليل والربط"],
    "challenge": "نص مهمة التحدي",
    "challengeStarter": "بداية جملة يكملها الطالب"
  }`,
    brainstorm: `"brainstorm": {
    "question": "سؤال مفتوح محفز للتفكير يخص الجزء المحدد ويقبل إجابات متعددة",
    "rules": ["قاعدة عصف ذهني 1", "قاعدة 2", "قاعدة 3"],
    "guidingQuestions": ["3 إلى 4 أسئلة تحفيزية تساعد الطلاب على توليد الأفكار"],
    "ideaSlots": 8,
    "summaryPrompt": "تعليمات اختيار أفضل الأفكار وتصنيفها"
  }`,
    mindmap: `"mindmap": {
    "instruction": "تعليمات إكمال الخريطة الذهنية",
    "center": "الموضوع المحوري في وسط الخريطة (كلمات قليلة)",
    "branches": [
      { "title": "عنوان فرع رئيسي", "hints": ["تلميح يوجه الطالب لما يكتبه في الفرع الفرعي", "تلميح 2", "تلميح 3"] }
    ],
    "reflection": "سؤال ختامي يربط الفروع ببعضها"
  }`,
    classify: `"classify": {
    "instruction": "تعليمات تصنيف المعلومات في الجدول",
    "categories": [
      { "name": "اسم الفئة", "items": ["عنصر يتبع هذه الفئة", "عنصر 2", "عنصر 3"] }
    ],
    "reflection": "سؤال ختامي يطلب تبرير التصنيف أو استنتاج علاقة"
  }`,
    cooperative: `"cooperative": {
    "mission": "المهمة أو المشكلة المشتركة التي تعمل عليها كل مجموعة",
    "roles": [ { "role": "اسم الدور", "duty": "مهمة صاحب الدور" } ],
    "steps": [ { "title": "عنوان الخطوة", "detail": "تفاصيل الخطوة" } ],
    "product": "الناتج الذي تقدمه كل مجموعة (ملصق، جدول، عرض...)",
    "criteria": ["معيار تقويم 1", "معيار 2", "معيار 3"]
  }`
};

const TYPE_RULES = {
    tps: 'النص قصير (فقرتان، كل فقرة 3 إلى 5 جمل) ومبسط ومناسب للصف، ويغطي الجزء المحدد فقط.',
    brainstorm: 'عدد القواعد 3، وعدد الأسئلة التحفيزية من 3 إلى 4، و"ideaSlots" بين 6 و10.',
    mindmap: 'عدد الفروع من 4 إلى 6، ولكل فرع من 2 إلى 3 تلميحات (أسئلة قصيرة أو بدايات جمل وليست إجابات جاهزة).',
    classify: 'من 2 إلى 4 فئات، ولكل فئة من 3 إلى 5 عناصر صحيحة (ستظهر للطلاب مخلوطة ليصنفوها، وتظهر لك كنموذج إجابة).',
    cooperative: '4 أدوار محددة، و3 إلى 4 خطوات مرتبة، و3 إلى 5 معايير تقويم قابلة للملاحظة.'
};

const isSenior = (grade) => /الحادي عشر|الثاني عشر|11|12/.test(grade || '');

function buildPrompt({ grade, subject, lesson, section, type, text }) {
    const chosen = type !== 'auto';
    const typeBlock = chosen
        ? `نوع النشاط المطلوب: "${TYPES[type]}" فقط.\nقاعدة هذا النوع: ${TYPE_RULES[type]}`
        : `اختر نوعاً واحداً فقط من الأنواع الخمسة التالية هو الأنسب لطبيعة هذا الجزء (مفاهيم وفئات ← classify، موضوع متشعب ← mindmap، سؤال مفتوح للتفكير ← brainstorm، مهمة أو مشكلة ← cooperative، نص للتحليل والاستنتاج ← tps)، وضع قيمته في الحقل "type"، وأجب بالبنية الخاصة بهذا النوع فقط.\nقواعد الأنواع:\n${Object.entries(TYPE_RULES).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`;

    const schemaText = chosen ? SCHEMAS[type] : Object.values(SCHEMAS).join(',\n  ');

    const sourceBlock = text
        ? `\nنص من كتاب الطالب (اعتمد عليه حصراً ولا تضف معلومات من خارجه):\n"""\n${text}\n"""\n`
        : '\nلا يوجد نص من الكتاب: استخدم معلومات دقيقة ومعروفة فقط، ولا تخترع أرقاماً أو أسماء أو تواريخ أو أحداثاً غير مؤكدة، ولا تذكر أرقام صفحات أو وحدات من الكتاب.\n';

    const seniorRule = isSenior(grade)
        ? `\n- هذا صف من المرحلة الثانوية (الحادي عشر/الثاني عشر): ارفع مستوى الأسئلة نحو التحليل والمقارنة والتفسير والتقويم والاستدلال وربط الأسباب بالنتائج، وتجنب الأسئلة المباشرة التي تُجاب بنقل جملة من الكتاب.`
        : '';

    const subjectLine = subject
        ? `- المادة: ${subject} (التزم بمنهج مادة ${subject} في سلطنة عمان لهذا الصف)`
        : '- المادة: الدراسات الاجتماعية (حدد الفرع جغرافيا أو تاريخ حسب الدرس)';

    return `أنت خبير تربوي في مناهج الدراسات الاجتماعية في سلطنة عمان (الصفوف من الخامس إلى العاشر: الدراسات الاجتماعية بفرعيها الجغرافيا والتاريخ، والصفان الحادي عشر والثاني عشر: مادتا الجغرافيا والتاريخ).

بيانات الطلب:
- الصف: ${grade || 'غير محدد'}
${subjectLine}
- الدرس: ${lesson}
- الجزء المحدد من الدرس: ${section || 'الدرس كاملاً'}
${sourceBlock}
مهمتك: أنشئ نشاطاً صفياً جاهزاً للطباعة يخدم "${section || lesson}" تحديداً.
قواعد صارمة:
- كل الأسئلة والأمثلة والعناصر مأخوذة من الجزء المحدد فقط، ولا تتناول بقية الدرس.
- المستوى اللغوي والمعرفي مناسب للصف المذكور، ومرتبط ببيئة سلطنة عمان حيثما أمكن.${seniorRule}
- ${typeBlock}

أجب بصيغة JSON صحيحة تماماً وباللغة العربية فقط (عدا حقل illustrationPrompts فبالإنجليزية) وبدون أي رموز Markdown، وبهذه البنية:
{
  "type": "${chosen ? type : 'أحد: tps / brainstorm / mindmap / classify / cooperative'}",
  "title": "عنوان النشاط مرتبط بالجزء المحدد",
  "objective": "هدف تعلم واحد قابل للقياس يبدأ بفعل (مثل: يصنف، يستنتج، يقارن)",
  "time": "مدة مقترحة مثل: 15 دقيقة",
  "iconsStart": "رمز تعبيري واحد أو اثنان مناسبان للموضوع",
  "iconsEnd": "رمز تعبيري آخر مناسب",
  "illustrationPrompts": ["وصف إنجليزي قصير لرسمة بسيطة تناسب الجزء المحدد، بدون أشخاص وبدون نصوص", "وصف إنجليزي لرسمة ثانية مختلفة"],
  "teacherRole": "دور المعلم في هذا النشاط في جملتين",
  ${schemaText}
}`;
}

/* ---------- تنظيف الاستجابة ---------- */
const str = (v, fb = '') => (typeof v === 'string' && v.trim() ? v.trim() : fb);
const strs = (v) => (Array.isArray(v) ? v.map(x => str(x)).filter(Boolean) : []);
const objs = (v) => (Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : []);
const num = (v, min, max, fb) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fb;
};

function normalize(d, requested, meta) {
    const type = requested !== 'auto' ? requested : (TYPES[d.type] ? d.type : 'tps');
    const b = d[type] || {};
    let body;

    if (type === 'tps') {
        body = {
            passage: strs(b.passage),
            thinkInstruction: str(b.thinkInstruction, 'بشكل فردي، اقرأ النص واستخرج أكبر عدد ممكن من الاستنتاجات.'),
            thinkCount: num(b.thinkCount, 2, 5, 3),
            pairInstruction: str(b.pairInstruction, 'تعاون مع زميلك، وقارنا استنتاجاتكما، ثم اتفقا على أهمها.'),
            pairRows: num(b.pairRows, 2, 6, 4),
            shareInstruction: str(b.shareInstruction, 'تجتمع كل مجموعة مع بقية المجموعات وتعرض استنتاجاتها، ثم تناقش الصف.'),
            questions: strs(b.questions),
            challenge: str(b.challenge),
            challengeStarter: str(b.challengeStarter)
        };
        if (!body.passage.length) throw new Error('نص غير مكتمل');
    } else if (type === 'brainstorm') {
        body = {
            question: str(b.question),
            rules: strs(b.rules).slice(0, 4),
            guidingQuestions: strs(b.guidingQuestions).slice(0, 5),
            ideaSlots: num(b.ideaSlots, 4, 12, 8),
            summaryPrompt: str(b.summaryPrompt, 'اختر مع مجموعتك أفضل ثلاث أفكار، وصنفها، ثم اعرضها على الصف.')
        };
        if (!body.question) throw new Error('سؤال غير مكتمل');
    } else if (type === 'mindmap') {
        body = {
            instruction: str(b.instruction, 'أكمل الخريطة الذهنية بكتابة المعلومات المناسبة في كل فرع.'),
            center: str(b.center),
            branches: objs(b.branches).slice(0, 6).map(x => ({
                title: str(x.title),
                hints: strs(x.hints).slice(0, 4)
            })).filter(x => x.title),
            reflection: str(b.reflection)
        };
        if (!body.center || body.branches.length < 2) throw new Error('خريطة غير مكتملة');
    } else if (type === 'classify') {
        body = {
            instruction: str(b.instruction, 'صنف المعلومات التالية في الجدول بكتابتها تحت الفئة المناسبة.'),
            categories: objs(b.categories).slice(0, 4).map(x => ({
                name: str(x.name),
                items: strs(x.items).slice(0, 6)
            })).filter(x => x.name && x.items.length),
            reflection: str(b.reflection)
        };
        if (body.categories.length < 2) throw new Error('تصنيف غير مكتمل');
    } else {
        body = {
            mission: str(b.mission),
            roles: objs(b.roles).slice(0, 5).map(x => ({ role: str(x.role), duty: str(x.duty) })).filter(x => x.role),
            steps: objs(b.steps).slice(0, 5).map(x => ({ title: str(x.title), detail: str(x.detail) })).filter(x => x.title),
            product: str(b.product),
            criteria: strs(b.criteria).slice(0, 6)
        };
        if (!body.mission || !body.roles.length || !body.steps.length) throw new Error('نشاط تعاوني غير مكتمل');
    }

    return {
        type,
        typeName: TYPES[type],
        title: str(d.title, meta.section || meta.lesson),
        grade: meta.grade,
        subject: meta.subject,
        lesson: meta.lesson,
        section: meta.section,
        objective: str(d.objective),
        time: str(d.time),
        iconsStart: str(d.iconsStart, '📚'),
        iconsEnd: str(d.iconsEnd, '🇴🇲'),
        illustrationPrompts: strs(d.illustrationPrompts).slice(0, 2).map(p => p.slice(0, 300)),
        teacherRole: str(d.teacherRole),
        body
    };
}

/* ---------- مسار توليد النشاط ---------- */
const clip = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

app.post('/api/generate-activity', async (req, res) => {
    try {
        const b = req.body || {};
        const meta = {
            grade: clip(b.grade, 40),
            subject: SUBJECTS.includes(b.subject) ? b.subject : '',
            lesson: clip(b.lesson, 150),
            section: clip(b.section, 200)
        };
        const type = TYPES[b.type] ? b.type : 'auto';
        const text = clip(b.text, 6000);
        const refresh = b.refresh === true;

        if (!meta.lesson) {
            return res.status(400).json({ error: 'اكتب اسم الدرس أولاً.' });
        }

        const key = JSON.stringify([meta.grade, meta.subject, meta.lesson, meta.section, type, text]);
        if (!refresh && cache.has(key)) {
            return res.json(cache.get(key));
        }

        const response = await generateWithFallback(buildPrompt({ ...meta, type, text }));

        const raw = (response.text || '').replace(/```json/g, '').replace(/```/g, '').trim();
        const activity = normalize(JSON.parse(raw), type, meta);

        cacheSet(key, activity);
        res.json(activity);

    } catch (error) {
        console.error('خطأ من السيرفر:', error);
        const quota = error.status === 429;
        const busy = error.status === 503;
        res.status(quota ? 429 : busy ? 503 : 500).json({
            error: quota
                ? 'تم الوصول إلى الحد اليومي للاستخدام، يرجى المحاولة لاحقاً.'
                : busy
                    ? 'الخدمة مشغولة حالياً، حاول مرة أخرى بعد قليل.'
                    : 'تعذر إنشاء النشاط هذه المرة، حاول مرة أخرى.'
        });
    }
});

/* ---------- مسار الرسومات بالذكاء الاصطناعي ---------- */
const IMG_STYLE = 'Cute friendly flat vector illustration for a school worksheet, bright cheerful colors, soft shapes, a single centered subject on a plain white background, no text, no letters, no numbers, no watermark, no people or faces. Subject: ';

const imgCache = new Map();
let imgDay = '';
let imgCount = 0;

function takeImageBudget(n) {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== imgDay) { imgDay = today; imgCount = 0; }
    if (imgCount + n > MAX_IMAGES_PER_DAY) return false;
    imgCount += n;
    return true;
}

async function generateImage(prompt) {
    let lastErr = new Error('no image models');
    for (const model of IMAGE_MODELS) {
        try {
            const r = await ai.models.generateContent({
                model,
                contents: IMG_STYLE + prompt,
                config: { responseModalities: ['TEXT', 'IMAGE'] }
            });
            const parts = (r.candidates && r.candidates[0] && r.candidates[0].content && r.candidates[0].content.parts) || [];
            const img = parts.find(p => p.inlineData && p.inlineData.data);
            if (img) {
                return `data:${img.inlineData.mimeType || 'image/png'};base64,${img.inlineData.data}`;
            }
            lastErr = new Error('لم يرجع النموذج صورة');
        } catch (err) {
            lastErr = err;
            console.error(`فشل توليد الصورة بالنموذج ${model}:`, err.status || err.message);
        }
    }
    throw lastErr;
}

app.post('/api/generate-illustrations', async (req, res) => {
    try {
        const raw = Array.isArray(req.body && req.body.prompts) ? req.body.prompts : [];
        const prompts = raw.filter(p => typeof p === 'string' && p.trim()).slice(0, 2).map(p => p.trim().slice(0, 300));

        if (!prompts.length) {
            return res.status(400).json({ error: 'لا يوجد وصف للرسم.' });
        }

        const todo = prompts.filter(p => !imgCache.has(p));
        if (todo.length && !takeImageBudget(todo.length)) {
            return res.status(429).json({ error: 'تم الوصول إلى الحد اليومي لعدد الرسومات، جرّب غداً.' });
        }

        const results = await Promise.allSettled(prompts.map(async (p) => {
            if (imgCache.has(p)) return imgCache.get(p);
            const url = await generateImage(p);
            if (imgCache.size >= 30) imgCache.delete(imgCache.keys().next().value);
            imgCache.set(p, url);
            return url;
        }));

        const failed = results.filter(r => r.status === 'rejected').length;
        const uncachedFailed = Math.min(failed, todo.length);
        imgCount = Math.max(0, imgCount - uncachedFailed); // إرجاع المحاولات الفاشلة من العدّاد

        const images = results.map(r => (r.status === 'fulfilled' ? r.value : null));
        if (images.every(i => !i)) {
            return res.status(503).json({
                error: 'تعذر توليد الرسومات الآن. قد لا يكون توليد الصور متاحاً في حسابك الحالي، وستبقى الرموز العادية.'
            });
        }
        res.json({ images });

    } catch (error) {
        console.error('خطأ في الرسومات:', error);
        res.status(500).json({ error: 'تعذر توليد الرسومات، حاول مرة أخرى.' });
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
