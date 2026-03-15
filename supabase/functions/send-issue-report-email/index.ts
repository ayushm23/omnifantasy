// Supabase Edge Function: send-issue-report-email
// Sends an email to all admins when a new issue report is submitted.
//
// Required Supabase secrets:
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected)

import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendEmail, escapeHtml } from '../_shared/draft-helpers.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { reportId, appUrl } = await req.json();
    if (!reportId) {
      return new Response(JSON.stringify({ error: 'Missing reportId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: report } = await admin
      .from('issue_reports')
      .select('id, type, title, description, steps_to_reproduce, expected_behavior, actual_behavior, severity, area, reporter_email, reporter_name, league_id, view, created_at')
      .eq('id', reportId)
      .single();

    if (!report) {
      return new Response(JSON.stringify({ skipped: 'report not found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: adminRows } = await admin
      .from('admins')
      .select('email');

    const adminEmails = (adminRows || []).map((row) => row.email).filter(Boolean);
    if (adminEmails.length === 0) {
      return new Response(JSON.stringify({ skipped: 'no admins' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let leagueName = '';
    if (report.league_id) {
      const { data: league } = await admin
        .from('leagues')
        .select('name')
        .eq('id', report.league_id)
        .single();
      leagueName = league?.name || '';
    }

    const subject = `[Omnifantasy] New ${report.type === 'feature' ? 'Feature' : 'Bug'}: ${report.title}`;
    const createdAt = report.created_at
      ? new Date(report.created_at).toLocaleString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric',
          hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
          timeZone: 'America/New_York',
        })
      : '';

    const link = appUrl ? `${appUrl}` : '';
    const lines = [
      `Type: ${report.type}`,
      `Severity: ${report.severity || 'medium'}`,
      `Area: ${report.area || 'Uncategorized'}`,
      `Reporter: ${report.reporter_name || report.reporter_email || 'Unknown'}`,
      report.view ? `View: ${report.view}` : null,
      leagueName ? `League: ${leagueName}` : null,
      createdAt ? `Submitted: ${createdAt}` : null,
      '',
      report.description,
    ].filter(Boolean);

    if (report.steps_to_reproduce) {
      lines.push('', 'Steps:', report.steps_to_reproduce);
    }
    if (report.expected_behavior) {
      lines.push('', 'Expected:', report.expected_behavior);
    }
    if (report.actual_behavior) {
      lines.push('', 'Actual:', report.actual_behavior);
    }
    if (link) {
      lines.push('', `Open app: ${link}`);
    }

    const text = lines.join('\n');

    const html = `
      <p><strong>Type:</strong> ${escapeHtml(report.type)}</p>
      <p><strong>Severity:</strong> ${escapeHtml(report.severity || 'medium')}</p>
      <p><strong>Area:</strong> ${escapeHtml(report.area || 'Uncategorized')}</p>
      <p><strong>Reporter:</strong> ${escapeHtml(report.reporter_name || report.reporter_email || 'Unknown')}</p>
      ${report.view ? `<p><strong>View:</strong> ${escapeHtml(report.view)}</p>` : ''}
      ${leagueName ? `<p><strong>League:</strong> ${escapeHtml(leagueName)}</p>` : ''}
      ${createdAt ? `<p><strong>Submitted:</strong> ${escapeHtml(createdAt)}</p>` : ''}
      <hr />
      <p>${escapeHtml(report.description).replace(/\n/g, '<br/>')}</p>
      ${report.steps_to_reproduce ? `<p><strong>Steps</strong><br/>${escapeHtml(report.steps_to_reproduce).replace(/\n/g, '<br/>')}</p>` : ''}
      ${report.expected_behavior ? `<p><strong>Expected</strong><br/>${escapeHtml(report.expected_behavior).replace(/\n/g, '<br/>')}</p>` : ''}
      ${report.actual_behavior ? `<p><strong>Actual</strong><br/>${escapeHtml(report.actual_behavior).replace(/\n/g, '<br/>')}</p>` : ''}
      ${link ? `<p><a href="${escapeHtml(link)}">Open Omnifantasy</a></p>` : ''}
    `;

    await sendEmail({
      to: adminEmails.join(','),
      subject,
      text,
      html,
    });

    return new Response(JSON.stringify({ success: true, to: adminEmails.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('send-issue-report-email error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
