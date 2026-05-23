package com.eacentral.bubble;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Log;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Foreground service rendering a draggable floating bubble that:
 *  - shows EA Status (Running / Stopped / Executing / Low Balance)
 *  - shows last trade side (BUY/SELL/CLOSE) with color
 *  - polls /api/mobile/trade-signals every 6s
 *  - shows P&L + balance when expanded
 *  - tap-to-expand panel with Stop EA quick action
 *  - drag to move anywhere on screen
 *  - long-press for menu (Hide / Stop EA / Open App)
 *
 * Talks to the same FastAPI backend the PWA uses, so signals stay perfectly in sync
 * with /admin/brokers push-signal + the mentor's bot bridge.
 */
public class BubbleService extends Service {

    public static final String ACTION_START  = "com.eacentral.bubble.START";
    public static final String ACTION_STOP   = "com.eacentral.bubble.STOP";
    public static final String ACTION_UPDATE = "com.eacentral.bubble.UPDATE";

    private static final String TAG = "BubbleService";
    private static final String CHANNEL_ID = "ea_bubble_channel";
    private static final int    NOTIF_ID   = 4711;
    private static final long   POLL_MS    = 6000L;

    private WindowManager wm;
    private View bubbleView;
    private View panelView;
    private boolean panelOpen = false;

    private TextView bubbleStatus;
    private TextView panelStatus;
    private TextView panelSymbol;
    private TextView panelSide;
    private TextView panelPnl;
    private TextView panelBalance;
    private TextView panelSignals;

    private String licenseKey = "";
    private String email = "";
    private String apiBase = "";
    private String lastSignalId = "";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable poller = new Runnable() {
        @Override public void run() {
            new Thread(BubbleService.this::pollSignals).start();
            handler.postDelayed(this, POLL_MS);
        }
    };

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_STOP.equals(action)) {
            stopBubble();
            stopSelf();
            return START_NOT_STICKY;
        }
        if (ACTION_UPDATE.equals(action)) {
            applyUpdate(intent);
            return START_STICKY;
        }
        // ACTION_START
        if (intent != null) {
            email      = nullSafe(intent.getStringExtra("email"));
            licenseKey = nullSafe(intent.getStringExtra("licenseKey"));
            apiBase    = nullSafe(intent.getStringExtra("apiBase"));
            persistCreds();
        } else {
            // Service auto-restart after a crash: re-load creds
            restoreCreds();
        }
        startForegroundNotif();
        ensureBubble();
        handler.removeCallbacks(poller);
        handler.post(poller);
        return START_STICKY;
    }

    /* ---------------------------------------------------------------- creds */

    private void persistCreds() {
        SharedPreferences sp = getSharedPreferences("ea_bubble", Context.MODE_PRIVATE);
        sp.edit().putString("email", email)
                .putString("licenseKey", licenseKey)
                .putString("apiBase", apiBase).apply();
    }
    private void restoreCreds() {
        SharedPreferences sp = getSharedPreferences("ea_bubble", Context.MODE_PRIVATE);
        email = sp.getString("email", "");
        licenseKey = sp.getString("licenseKey", "");
        apiBase = sp.getString("apiBase", "");
    }

    /* ------------------------------------------------------ foreground notif */

    private void startForegroundNotif() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID, "EA-CENTRAL Bubble", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Keeps the floating EA status bubble alive");
            nm.createNotificationChannel(ch);
        }
        Intent openIntent = new Intent(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification n = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("EA-CENTRAL")
                .setContentText("Floating EA Status active — tap the bubble for details")
                .setSmallIcon(R.drawable.ic_bubble_notif)
                .setOngoing(true)
                .setContentIntent(pi)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();
        startForeground(NOTIF_ID, n);
    }

    /* -------------------------------------------------------------- overlay */

    @SuppressWarnings("ClickableViewAccessibility")
    private void ensureBubble() {
        if (bubbleView != null) return;
        wm = (WindowManager) getSystemService(WINDOW_SERVICE);

        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;

        // -- bubble --
        LayoutInflater inflater = LayoutInflater.from(this);
        bubbleView = inflater.inflate(R.layout.bubble_view, null);
        bubbleStatus = bubbleView.findViewById(R.id.bubble_status);

        WindowManager.LayoutParams bp = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                type,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                PixelFormat.TRANSLUCENT);
        bp.gravity = Gravity.TOP | Gravity.START;
        bp.x = 24; bp.y = 240;
        wm.addView(bubbleView, bp);

        bubbleView.setOnTouchListener(new View.OnTouchListener() {
            int ix, iy; float tx, ty; long tDown; boolean dragged;
            @Override public boolean onTouch(View v, MotionEvent e) {
                switch (e.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        ix = bp.x; iy = bp.y;
                        tx = e.getRawX(); ty = e.getRawY();
                        tDown = System.currentTimeMillis(); dragged = false;
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        int dx = (int)(e.getRawX() - tx), dy = (int)(e.getRawY() - ty);
                        if (Math.abs(dx) > 8 || Math.abs(dy) > 8) dragged = true;
                        bp.x = ix + dx; bp.y = iy + dy;
                        wm.updateViewLayout(bubbleView, bp);
                        return true;
                    case MotionEvent.ACTION_UP:
                        if (!dragged && System.currentTimeMillis() - tDown < 350) {
                            togglePanel();
                        }
                        return true;
                }
                return false;
            }
        });

        // -- panel (hidden) --
        panelView = inflater.inflate(R.layout.bubble_panel, null);
        panelStatus  = panelView.findViewById(R.id.panel_status);
        panelSymbol  = panelView.findViewById(R.id.panel_symbol);
        panelSide    = panelView.findViewById(R.id.panel_side);
        panelPnl     = panelView.findViewById(R.id.panel_pnl);
        panelBalance = panelView.findViewById(R.id.panel_balance);
        panelSignals = panelView.findViewById(R.id.panel_signals);
        panelView.findViewById(R.id.panel_stop_ea).setOnClickListener(v ->
                new Thread(this::stopEaOnServer).start());
        panelView.findViewById(R.id.panel_close).setOnClickListener(v -> togglePanel());
        panelView.findViewById(R.id.panel_open_app).setOnClickListener(v -> {
            Intent i = new Intent(this, MainActivity.class)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            startActivity(i);
            togglePanel();
        });
    }

    private void togglePanel() {
        if (panelOpen) {
            if (panelView.getParent() != null) wm.removeView(panelView);
            panelOpen = false;
            return;
        }
        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;
        WindowManager.LayoutParams pp = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                type,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_LAYOUT_INSET_DECOR
                        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT);
        pp.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
        pp.y = 80;
        wm.addView(panelView, pp);
        panelOpen = true;
    }

    private void stopBubble() {
        handler.removeCallbacks(poller);
        if (bubbleView != null && bubbleView.getParent() != null) wm.removeView(bubbleView);
        if (panelView  != null && panelView.getParent()  != null) wm.removeView(panelView);
        bubbleView = null; panelView = null; panelOpen = false;
        stopForeground(true);
    }

    /* ------------------------------------------------------------ http poll */

    private void pollSignals() {
        if (apiBase.isEmpty() || licenseKey.isEmpty()) return;
        try {
            URL url = new URL(apiBase + "/api/mobile/trade-signals");
            HttpURLConnection c = (HttpURLConnection) url.openConnection();
            c.setRequestMethod("POST");
            c.setRequestProperty("Content-Type", "application/json");
            c.setConnectTimeout(8000); c.setReadTimeout(8000);
            c.setDoOutput(true);
            JSONObject body = new JSONObject();
            body.put("email", email);
            body.put("license_key", licenseKey);
            try (OutputStream os = c.getOutputStream()) {
                os.write(body.toString().getBytes("UTF-8"));
            }
            int code = c.getResponseCode();
            if (code != 200) { Log.w(TAG, "poll http=" + code); return; }
            StringBuilder sb = new StringBuilder();
            try (BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream()))) {
                String line; while ((line = r.readLine()) != null) sb.append(line);
            }
            JSONObject json = new JSONObject(sb.toString());
            JSONArray sigs = json.optJSONArray("signals");
            if (sigs != null && sigs.length() > 0) {
                renderFromSignals(sigs);
            }
        } catch (Exception e) {
            Log.w(TAG, "poll failed: " + e.getMessage());
        }
    }

    private void renderFromSignals(JSONArray sigs) throws Exception {
        JSONObject latest = sigs.getJSONObject(0);
        String id     = latest.optString("id");
        String side   = latest.optString("side", "").toUpperCase();
        String status = latest.optString("status", "").toLowerCase();
        String symbol = latest.optString("symbol", "");
        String err    = latest.optString("error_message", "");
        double pnl    = latest.optDouble("pnl", Double.NaN);
        double bal    = latest.optDouble("balance", Double.NaN);

        final String shortStatus;
        final int color;
        if ("executed".equals(status))      { shortStatus = side.isEmpty()?"OK":side; color = 0xFF22C55E; }
        else if ("executing".equals(status)){ shortStatus = "..."; color = 0xFFF59E0B; }
        else if ("failed".equals(status))   { shortStatus = "!";   color = 0xFFEF4444; }
        else if ("low_balance".equals(status)){ shortStatus = "$"; color = 0xFFEF4444; }
        else if ("pending".equals(status))  { shortStatus = "•";   color = 0xFF1E90FF; }
        else                                 { shortStatus = "—";  color = 0xFF6B7280; }

        StringBuilder list = new StringBuilder();
        int limit = Math.min(3, sigs.length());
        for (int i = 0; i < limit; i++) {
            JSONObject s = sigs.getJSONObject(i);
            list.append(s.optString("side","?").toUpperCase())
                .append("  ").append(s.optString("symbol","?"))
                .append("  · ").append(s.optString("status","?"))
                .append("\n");
        }

        handler.post(() -> {
            if (bubbleStatus != null) {
                bubbleStatus.setText(shortStatus);
                bubbleStatus.setTextColor(color);
            }
            if (panelStatus  != null) panelStatus.setText("Status: " + status.toUpperCase());
            if (panelSymbol  != null) panelSymbol.setText(symbol);
            if (panelSide    != null) { panelSide.setText(side); panelSide.setTextColor(color); }
            if (panelPnl     != null) panelPnl.setText(Double.isNaN(pnl) ? "P&L: —" : String.format("P&L: %.2f", pnl));
            if (panelBalance != null) panelBalance.setText(Double.isNaN(bal) ? "Balance: —" : String.format("Balance: %.2f", bal));
            if (panelSignals != null) panelSignals.setText(list.toString().trim());
        });

        // vibrate on fresh executed BUY / SELL
        if (!id.isEmpty() && !id.equals(lastSignalId) && "executed".equals(status)
                && ("BUY".equals(side) || "SELL".equals(side))) {
            vibrate();
        }
        lastSignalId = id;
    }

    private void vibrate() {
        try {
            Vibrator v = (Vibrator) getSystemService(VIBRATOR_SERVICE);
            if (v == null) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                v.vibrate(VibrationEffect.createOneShot(120, VibrationEffect.DEFAULT_AMPLITUDE));
            } else {
                v.vibrate(120);
            }
        } catch (Exception ignored) {}
    }

    private void stopEaOnServer() {
        if (apiBase.isEmpty() || licenseKey.isEmpty()) return;
        try {
            URL url = new URL(apiBase + "/api/mobile/ea/stop");
            HttpURLConnection c = (HttpURLConnection) url.openConnection();
            c.setRequestMethod("POST");
            c.setRequestProperty("Content-Type", "application/json");
            c.setConnectTimeout(8000); c.setReadTimeout(8000);
            c.setDoOutput(true);
            JSONObject body = new JSONObject();
            body.put("email", email);
            body.put("license_key", licenseKey);
            try (OutputStream os = c.getOutputStream()) {
                os.write(body.toString().getBytes("UTF-8"));
            }
            int code = c.getResponseCode();
            handler.post(() -> {
                if (panelStatus != null) {
                    panelStatus.setText(code == 200 ? "EA Stopped" : "Stop failed (" + code + ")");
                }
            });
        } catch (Exception e) {
            Log.w(TAG, "stopEa failed: " + e.getMessage());
        }
    }

    /* ------------------------------------------------------------- updates */

    private void applyUpdate(Intent i) {
        if (bubbleView == null) return;
        String status = nullSafe(i.getStringExtra("status"));
        if (!status.isEmpty() && bubbleStatus != null) {
            bubbleStatus.setText(status.length() > 3 ? status.substring(0,3) : status);
        }
    }

    private static String nullSafe(String s) { return s == null ? "" : s; }

    @Override public void onDestroy() {
        stopBubble();
        super.onDestroy();
    }
}
