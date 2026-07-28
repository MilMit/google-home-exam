# تنظیمات پروژه Supabase شما

- Project Ref: `lcherkxyrpmgkokkbhjs`
- Project URL: `https://lcherkxyrpmgkokkbhjs.supabase.co`
- Publishable Key در `site/config.js` تنظیم شده است.

## اتصال CLI

```bash
npm install supabase --save-dev
npx supabase login
npx supabase link --project-ref lcherkxyrpmgkokkbhjs
npx supabase db push
npx supabase functions deploy start-exam
npx supabase functions deploy resume-exam
npx supabase functions deploy save-answer
npx supabase functions deploy submit-exam
npx supabase functions deploy log-event
```

برای CORS آدرس واقعی GitHub Pages را وارد کنید:

```bash
npx supabase secrets set ALLOWED_ORIGIN="https://YOUR_USERNAME.github.io/google-home-exam"
```

برای واردکردن بانک سؤال به Secret Key پروژه نیاز است. آن را فقط روی سیستم خود در متغیر محیطی `SUPABASE_SECRET_KEY` قرار دهید و در GitHub یا فایل‌های سایت ذخیره نکنید.
