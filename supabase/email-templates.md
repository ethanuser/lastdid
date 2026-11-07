# Sign-in emails

Already pasted into Supabase (Nov 2026), sent through lastdonehq@gmail.com (the address predates the rename; the sender name shows "Last Did"). Supabase only lets you edit these with custom SMTP on
(Authentication → Emails → SMTP Settings). Then paste each one under
Authentication → Emails → Templates. `{{ .ConfirmationURL }}` is filled in by Supabase.

## Confirm sign up

**Subject:** Confirm your email for Last Did

```html
<div style="font-family:-apple-system,'Segoe UI',sans-serif;max-width:440px;margin:0 auto;padding:24px;color:#2b2620">
  <div style="width:44px;height:44px;border-radius:12px;background:#a8741a;color:#fff;font-size:26px;line-height:44px;text-align:center">✓</div>
  <h1 style="font-size:22px;margin:16px 0 8px">Welcome to Last Did</h1>
  <p style="margin:0 0 20px;color:#6b6257">Tap the button to confirm your email and finish signing in.</p>
  <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#a8741a;color:#fff;text-decoration:none;font-weight:600">Confirm and sign in</a>
  <p style="margin:24px 0 0;font-size:12px;color:#8a8076">If you didn't ask for this, you can ignore this email.</p>
</div>
```

## Magic link (every sign-in after the first)

**Subject:** Your Last Did sign-in link

```html
<div style="font-family:-apple-system,'Segoe UI',sans-serif;max-width:440px;margin:0 auto;padding:24px;color:#2b2620">
  <div style="width:44px;height:44px;border-radius:12px;background:#a8741a;color:#fff;font-size:26px;line-height:44px;text-align:center">✓</div>
  <h1 style="font-size:22px;margin:16px 0 8px">Sign in to Last Did</h1>
  <p style="margin:0 0 20px;color:#6b6257">Tap the button to sign in. The link works once and expires soon.</p>
  <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#a8741a;color:#fff;text-decoration:none;font-weight:600">Sign in</a>
  <p style="margin:24px 0 0;font-size:12px;color:#8a8076">If you didn't ask for this, you can ignore this email.</p>
</div>
```
