package com.anbarian.app;

import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import java.io.OutputStream;
import java.io.IOException;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SaveFile")
public class SaveFilePlugin extends Plugin {
    @PluginMethod
    public void save(PluginCall call) {
        String filename = call.getString("filename", "anbarin-report.txt");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        String base64 = call.getString("data", "");
        if (base64 == null || base64.isEmpty()) {
            call.reject("محتوای فایل خالی است");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        startActivityForResult(call, intent, "handleSaveResult");
    }

    @ActivityCallback
    private void handleSaveResult(PluginCall call, androidx.activity.result.ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != android.app.Activity.RESULT_OK || result.getData() == null) {
            JSObject cancelled = new JSObject();
            cancelled.put("cancelled", true);
            call.resolve(cancelled);
            return;
        }
        Uri uri = result.getData().getData();
        if (uri == null) {
            call.reject("محل ذخیره انتخاب نشد");
            return;
        }
        try {
            // Read payload from the original PluginCall; do not keep it in mutable
            // plugin fields while Android's document picker is open.
            String base64 = call.getString("data", "");
            String filename = call.getString("filename", "anbarin-report.txt");
            if (base64 == null || base64.trim().isEmpty()) {
                throw new IOException("محتوای فایل پس از انتخاب محل ذخیره خالی است");
            }
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            if (bytes.length == 0) throw new IOException("داده فایل پس از رمزگشایی خالی است");

            // 'wt' requests truncation explicitly on SAF providers.
            try (OutputStream out = getContext().getContentResolver().openOutputStream(uri, "wt")) {
                if (out == null) throw new IOException("امکان باز کردن فایل وجود ندارد");
                out.write(bytes);
                out.flush();
            }

            // Do not report success until the provider can read back the full file.
            long verifiedBytes = 0;
            try (java.io.InputStream in = getContext().getContentResolver().openInputStream(uri)) {
                if (in == null) throw new IOException("امکان بررسی فایل ذخیره‌شده وجود ندارد");
                byte[] buffer = new byte[8192];
                int count;
                while ((count = in.read(buffer)) != -1) verifiedBytes += count;
            }
            if (verifiedBytes != bytes.length) {
                throw new IOException("حجم فایل ذخیره‌شده با داده اصلی برابر نیست؛ انتظار "
                    + bytes.length + " بایت، دریافت " + verifiedBytes + " بایت");
            }

            JSObject response = new JSObject();
            response.put("cancelled", false);
            response.put("uri", uri.toString());
            response.put("filename", filename);
            response.put("bytesWritten", verifiedBytes);
            call.resolve(response);
        } catch (Exception e) {
            call.reject("ذخیره یا بررسی فایل ناموفق بود: " + e.getMessage(), e);
        }
    }
}
