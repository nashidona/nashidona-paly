# Nashidona • Next.js + Supabase Starter (v2)

- شعار بالأعلى
- تشغيل فوري + السابق/التالي
- شريط زمن قابل للسحب
- قائمة تشغيل: فتح/طيّ + حذف/تفريغ + إعادة ترتيب (⬆⬇) + حفظ تلقائي في LocalStorage

## الإعداد
1) أنشئ `.env.local` من `.env.example` وضع:
```
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```
2) `npm i && npm run dev`
3) استورد CSVs في Supabase (classes → albums → tracks → assessments)
4) انشر على Vercel وأضف نفس متغيّرات البيئة
