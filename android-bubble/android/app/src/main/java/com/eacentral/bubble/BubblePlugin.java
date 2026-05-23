package com.eacentral.bubble;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Bridge between the PWA (MobileApp.jsx) and the native floating-bubble service.
 *
 * JS API (window.Capacitor.Plugins.Bubble):
 *   .canDrawOverlays()          -> {granted: boolean}
 *   .requestOverlayPermission() -> opens system Settings page
 *   .start({email, licenseKey, apiBase})  -> launches BubbleService foreground
 *   .stop()                     -> stops the overlay service
 *   .update({status, signal})   -> push a fresh status into the bubble while it's running
 */
@CapacitorPlugin(name = "Bubble")
public class BubblePlugin extends Plugin {

    @PluginMethod
    public void canDrawOverlays(PluginCall call) {
        boolean granted = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            granted = Settings.canDrawOverlays(getContext());
        }
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestOverlayPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                && !Settings.canDrawOverlays(getContext())) {
            Intent intent = new Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                && !Settings.canDrawOverlays(getContext())) {
            call.reject("Overlay permission not granted. Call requestOverlayPermission() first.");
            return;
        }
        String email = call.getString("email", "");
        String licenseKey = call.getString("licenseKey", "");
        String apiBase = call.getString("apiBase", "");

        if (licenseKey.isEmpty() || apiBase.isEmpty()) {
            call.reject("Missing required: licenseKey, apiBase");
            return;
        }

        Intent svc = new Intent(getContext(), BubbleService.class);
        svc.setAction(BubbleService.ACTION_START);
        svc.putExtra("email", email);
        svc.putExtra("licenseKey", licenseKey);
        svc.putExtra("apiBase", apiBase);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(svc);
        } else {
            getContext().startService(svc);
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Intent svc = new Intent(getContext(), BubbleService.class);
        svc.setAction(BubbleService.ACTION_STOP);
        getContext().startService(svc);
        call.resolve();
    }

    @PluginMethod
    public void update(PluginCall call) {
        Intent svc = new Intent(getContext(), BubbleService.class);
        svc.setAction(BubbleService.ACTION_UPDATE);
        svc.putExtra("status", call.getString("status", "idle"));
        svc.putExtra("symbol", call.getString("symbol", ""));
        svc.putExtra("side", call.getString("side", ""));
        svc.putExtra("pnl", call.getString("pnl", ""));
        svc.putExtra("balance", call.getString("balance", ""));
        getContext().startService(svc);
        call.resolve();
    }
}
