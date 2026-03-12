// Supabase Edge Function: send-league-invite
// Sends an invite email to a league member.
// Different copy for new users (no account) vs existing users.
//
// Required Supabase secrets (set via: supabase secrets set KEY=value):
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected by Supabase)

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { memberEmail, leagueName, commissionerName, appUrl } = await req.json();

    if (!memberEmail || !leagueName) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use service role to check if this email already has a Supabase account
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: userList } = await adminClient.auth.admin.listUsers();
    const isExistingUser = userList?.users?.some(
      (u) => u.email?.toLowerCase() === memberEmail.toLowerCase()
    ) ?? false;

    const subject = isExistingUser
      ? `You've been invited to join ${leagueName} on Omnifantasy`
      : `You're invited to Omnifantasy: ${leagueName}`;

    const bodyText = isExistingUser
      ? `Hi,\n\n${commissionerName || 'Your friend'} has invited you to join their fantasy league "${leagueName}" on Omnifantasy.\n\nLog in at ${appUrl} to see and accept your invite.\n\nOmnifantasy`
      : `Hi,\n\n${commissionerName || 'Your friend'} has invited you to join their fantasy league "${leagueName}" on Omnifantasy — a multi-sport fantasy draft platform.\n\nCreate your free account at ${appUrl} using this email address (${memberEmail}), then accept your invite on the home page.\n\nOmnifantasy`;

    const bodyHtml = isExistingUser
      ? `<p>Hi,</p>
         <p><strong>${escapeHtml(commissionerName || 'Your friend')}</strong> has invited you to join their fantasy league <strong>"${escapeHtml(leagueName)}"</strong> on Omnifantasy.</p>
         <p><a href="${escapeHtml(appUrl)}" style="background:#16a34a;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;margin:8px 0;">Accept Invite</a></p>
         <p style="color:#6b7280;font-size:14px;">Or visit: ${escapeHtml(appUrl)}</p>`
      : `<p>Hi,</p>
         <p><strong>${escapeHtml(commissionerName || 'Your friend')}</strong> has invited you to join their fantasy league <strong>"${escapeHtml(leagueName)}"</strong> on Omnifantasy — a multi-sport fantasy draft platform.</p>
         <p>Create your free account at the link below using this email address (<strong>${escapeHtml(memberEmail)}</strong>), then accept your invite on the home page.</p>
         <p><a href="${escapeHtml(appUrl)}" style="background:#16a34a;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;margin:8px 0;">Create Account & Accept Invite</a></p>
         <p style="color:#6b7280;font-size:14px;">Or visit: ${escapeHtml(appUrl)}</p>`;

    await sendEmail({
      to: memberEmail,
      subject,
      text: bodyText,
      html: bodyHtml,
    });

    return new Response(JSON.stringify({ success: true, isExistingUser }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('send-league-invite error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function sendEmail({ to, subject, text, html }: {
  to: string;
  subject: string;
  text: string;
  html: string;
}) {
  const host = Deno.env.get('SMTP_HOST')!;
  const port = parseInt(Deno.env.get('SMTP_PORT') || '587');
  const user = Deno.env.get('SMTP_USER')!;
  const pass = Deno.env.get('SMTP_PASS')!;
  const from = Deno.env.get('SMTP_FROM') || user;

  // Build a minimal MIME email and send via SMTP using fetch-based TCP
  // We use nodemailer via npm: specifier (Deno supports npm packages in Edge Functions)
  const nodemailer = await import('npm:nodemailer@6');
  const transporter = nodemailer.default.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: `"Omnifantasy" <${from}>`,
    to,
    subject,
    text,
    html,
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
