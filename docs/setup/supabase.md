# Supabase setup (one time, about 15 minutes)

Do these in order. Steps 1–3 are in the Supabase dashboard for the `caddy-prod` project.

## 1. Sign-in settings

**Authentication → Sign In / Providers**

1. Turn **off** "Allow new users to sign up". Caddy is invite-only.
2. Under **Email**, keep the provider **enabled**. Turning the provider off blocks all email sign-ins, including invited people.
3. In the Email provider settings, set **Email OTP Expiration** to `600` seconds (10 minutes) and **Email OTP Length** to `6`. Save.

## 2. Sign-in code email

**Authentication → Emails → Templates → Magic Link**

1. Subject: `Your Caddy sign-in code`
2. Body: paste the contents of [`supabase/templates/magic-link.html`](../../supabase/templates/magic-link.html).
3. Save. The email now shows a 6-digit code instead of a link.

## 3. Sending email (needed for your partner)

Supabase's built-in mailer only delivers to members of your Supabase team and sends about 2 emails an hour, so codes for anyone else won't arrive. Pick one option:

**Option A: Gmail (free, no domain needed)**

1. In your Google Account → **Security**, turn on **2-Step Verification** if it isn't already.
2. Search for **App passwords** in your Google Account, create one named `Caddy`, and copy the 16-character password.
3. In Supabase, go to **Authentication → Emails → SMTP Settings** and turn on **Enable custom SMTP**:
   - Sender email: your Gmail address
   - Sender name: `Caddy`
   - Host: `smtp.gmail.com`
   - Port: `465`
   - Username: your Gmail address
   - Password: the app password
4. Save, then go to **Authentication → Rate Limits** and set emails per hour to `30`.

Codes will come from your Gmail address. Gmail allows about 500 emails a day, far more than Caddy needs.

**Option B: Resend (if you own a domain)**

Resend's free plan can only send to your own address until you verify a domain. If you own one, verify it in Resend, create an API key, and use host `smtp.resend.com`, port `465`, username `resend`, password = the API key, sender `caddy@yourdomain`.

## 4. Site address

**Authentication → URL Configuration**: set **Site URL** to your Vercel production address (for example `https://caddy-xxxx.vercel.app`). Codes don't use it, but Supabase includes it in emails.

## 5. Create the database tables

Merging a PR that adds files in `supabase/migrations/` runs the **Apply database migrations** workflow (GitHub → Actions). Check that it's green before step 6.

If it fails with a connection error, check the `SUPABASE_PROD_DB_URL` secret:

- It must be the **Session pooler** URI with your password filled in.
- If your password has symbols such as `@`, `#` or `/`, they must be percent-encoded. Resetting the database password to letters and numbers only also works.

## 6. Add yourself, then your partner

1. GitHub → **Actions → Add household member → Run workflow**.
2. Enter your email (the one you'll sign in with), your name, and a household name. Run it.
3. Open Caddy, enter that email, and type the code from the email.
4. Add your partner from **Settings → Invite an adult** in the app.
