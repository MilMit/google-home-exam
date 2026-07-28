# راه‌اندازی سریع روی GitHub Pages + Supabase

این مخزن شامل سایت عمومی آزمون و کد Edge Functionها است. بانک سؤال و پاسخ‌ها در بسته خصوصی جداگانه قرار دارند و نباید در GitHub عمومی آپلود شوند.

## پیش‌نیازها

- Git و Node.js نسخه 20 یا جدیدتر
- حساب GitHub
- پروژه Supabase

## استقرار Backend

در ریشه مخزن عمومی:

```bash
npm install supabase --save-dev
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
npx supabase functions deploy start-exam
npx supabase functions deploy resume-exam
npx supabase functions deploy save-answer
npx supabase functions deploy submit-exam
npx supabase functions deploy log-event
npx supabase secrets set ALLOWED_ORIGIN="https://YOUR_USERNAME.github.io/YOUR_REPOSITORY"
```

## واردکردن بانک سؤال خصوصی

این کار را فقط روی کامپیوتر خودتان انجام دهید:

```bash
cd private-bank
python3 validate_bank.py question-bank.json
export SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
export SUPABASE_SECRET_KEY="sb_secret_..."
node import-bank.mjs question-bank.json
```

اگر پروژه شما فقط کلید قدیمی دارد، به‌جای `SUPABASE_SECRET_KEY` می‌توانید `SUPABASE_SERVICE_ROLE_KEY` را تنظیم کنید.

## GitHub Actions

در GitHub این دو مقدار را بسازید:

- Repository variable: `SUPABASE_URL`
- Repository secret: `SUPABASE_PUBLISHABLE_KEY`

سپس در **Settings > Pages**، گزینه **GitHub Actions** را به‌عنوان Source انتخاب کنید. workflow موجود، پوشه `site` را منتشر می‌کند.

## امنیت

- بانک سؤال خصوصی را commit نکنید.
- کلید Secret یا service_role را در GitHub، `config.js` یا مرورگر قرار ندهید.
- Publishable key برای مرورگر طراحی شده است.
