# ارتقا به بانک سخت v2

این نسخه بانک خصوصی را به 300 سؤال افزایش می‌دهد و هر آزمون همچنان 60 سؤال دارد. هر 60 مفهوم اصلی پوشش داده می‌شوند، اما سختی دقیق هر نوبت ثابت است: 9 متوسط، 33 سخت و 18 بسیار سخت.

1. این public-repo را جایگزین/Push کنید.
2. `npx supabase db push`
3. `npx supabase functions deploy start-exam`
4. بانک خصوصی v2 را Import کنید. Importer ابتدا تمام سؤال‌های قدیمی را غیرفعال می‌کند و سپس 300 سؤال جدید را فعال می‌کند.
5. در SQL Editor بررسی کنید:

```sql
select count(*) from public.questions where is_active = true;
select difficulty, count(*) from public.questions where is_active=true group by difficulty;
select count(distinct concept_key) from public.questions where is_active=true;
```

باید به‌ترتیب 300 سؤال فعال، 60 مفهوم و توزیع 60 medium / 120 hard / 120 very_hard را ببینید.
