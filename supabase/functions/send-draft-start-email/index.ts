// Supabase Edge Function: send-draft-start-email
// Called fire-and-forget from the client immediately after a draft starts.
// Sends to ALL accepted league members regardless of OTC email preference.
//
// Required Supabase secrets (shared with other email functions):
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected)
//
// Deploy: supabase functions deploy send-draft-start-email

import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendEmail, escapeHtml } from '../_shared/draft-helpers.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { leagueId, appUrl } = await req.json();
    if (!leagueId) return skip('missing leagueId');

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Load league name and all accepted members in parallel
    const [{ data: league }, { data: members }] = await Promise.all([
      admin
        .from('leagues')
        .select('name')
        .eq('id', leagueId)
        .single(),
      admin
        .from('league_members')
        .select('email, name')
        .eq('league_id', leagueId)
        .eq('status', 'accepted'),
    ]);

    if (!league) return skip('league not found');
    if (!members?.length) return skip('no members');

    const link = appUrl ? `${appUrl}?draft=${leagueId}` : appUrl ?? '';

    const results: { email: string; success: boolean; error?: string }[] = [];

    // Send to each member — fire independently, collect outcomes
    await Promise.allSettled(
      members.map(async (member) => {
        const name = member.name || member.email.split('@')[0];
        const subject = `The draft for ${league.name} has started!`;
        const text = `Hi ${name},\n\nThe draft for ${league.name} has started on Omnifantasy. Head over now to make your picks!\n\nDraft now: ${link}\n\nOmnifantasy`;
        const html = `
          <p>Hi <strong>${escapeHtml(name)}</strong>,</p>
          <p>The draft for <strong>${escapeHtml(league.name)}</strong> has started on Omnifantasy. Head over now to make your picks!</p>
          <p>
            <a href="${escapeHtml(link)}"
               style="background:#16a34a;color:white;padding:10px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin:8px 0;font-weight:600;">
              Go to Draft &#8594;
            </a>
          </p>
          <p style="color:#6b7280;font-size:13px;">Or visit: ${escapeHtml(link)}</p>
        `;

        try {
          await sendEmail({ to: member.email, subject, text, html });
          results.push({ email: member.email, success: true });
        } catch (err) {
          console.error(`send-draft-start-email: failed for ${member.email}`, err);
          results.push({ email: member.email, success: false, error: (err as Error).message });
        }
      })
    );

    const sent = results.filter(r => r.success).length;
    console.log(`send-draft-start-email: sent ${sent}/${members.length} for league ${leagueId}`);

    return new Response(JSON.stringify({ success: true, sent, total: members.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('send-draft-start-email error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function skip(reason: string) {
  return new Response(JSON.stringify({ skipped: reason }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
