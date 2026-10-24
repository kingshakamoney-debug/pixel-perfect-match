import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { reminderKey } from "@/lib/subscription";

// Daily renewal-reminder sweep. No email provider is configured yet, so
// reminders are recorded (idempotently) and surfaced in the customer's
// dashboard; the reminder_logs rows are the delivery trail a future
// email/SMS/WhatsApp sender can pick up.
export const Route = createFileRoute("/api/public/jobs/renewal-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: settings } = await supabaseAdmin
          .from("payment_settings")
          .select("reminder_days")
          .eq("id", 1)
          .single();
        const days: number[] = (settings?.reminder_days?.length ? settings.reminder_days : [7, 3, 1, 0]).sort((a, b) => b - a);

        const now = new Date();
        const horizon = new Date(now.getTime() + Math.max(...days) * 86_400_000);
        const { data: subs, error } = await supabaseAdmin
          .from("subscriptions")
          .select("id,user_id,current_period_end")
          .eq("status", "active")
          .gt("current_period_end", now.toISOString())
          .lte("current_period_end", horizon.toISOString());
        if (error) return Response.json({ success: false, error: error.message }, { status: 500 });

        // Only the latest expiry per customer: an early renewal creates a new
        // row with a later expiry, which suppresses reminders for the old one.
        const latest = new Map<string, { id: string; current_period_end: string }>();
        for (const s of subs ?? []) {
          const cur = latest.get(s.user_id);
          if (!cur || s.current_period_end > cur.current_period_end) latest.set(s.user_id, s);
        }

        let recorded = 0;
        for (const s of latest.values()) {
          const expiry = new Date(s.current_period_end);
          for (const d of days) {
            if (now.getTime() >= expiry.getTime() - d * 86_400_000) {
              const { error: insErr } = await supabaseAdmin.from("reminder_logs").insert({
                subscription_id: s.id,
                reminder_key: reminderKey(s.id, s.current_period_end, d),
                days_before: d,
                expires_at: s.current_period_end,
                status: "recorded",
              });
              if (!insErr) recorded++; // unique reminder_key makes repeats no-ops
            }
          }
        }
        return Response.json({ success: true, recorded });
      },
    },
  },
});
