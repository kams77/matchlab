package com.matchlab.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {

    /** Seul site que l'application a le droit de télécharger. */
    private static final String ALLOWED_PREFIX = "https://www.football-data.co.uk/";
    private static final int FILE_REQUEST = 42;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private final ExecutorService pool = Executors.newFixedThreadPool(4);

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);

        web.addJavascriptInterface(new Bridge(), "MatchlabNative");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if ("file".equals(u.getScheme())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try {
                    startActivityForResult(Intent.createChooser(i, "Fichiers CSV"), FILE_REQUEST);
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_REQUEST && fileCallback != null) {
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int n = data.getClipData().getItemCount();
                    result = new Uri[n];
                    for (int k = 0; k < n; k++) result[k] = data.getClipData().getItemAt(k).getUri();
                } else if (data.getData() != null) {
                    result = new Uri[]{data.getData()};
                }
            }
            fileCallback.onReceiveValue(result);
            fileCallback = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        pool.shutdownNow();
        super.onDestroy();
    }

    /** Pont appelé depuis la page : MatchlabNative.fetch(id, url). */
    private class Bridge {
        @JavascriptInterface
        public String version() { return "1.1"; }

        /** Sauvegarde des données dans un fichier privé de l'application (pas de limite de taille du navigateur). */
        @JavascriptInterface
        public String saveData(String key, String value) {
            try (java.io.FileOutputStream out = openFileOutput(safe(key) + ".json", MODE_PRIVATE)) {
                out.write(value.getBytes(StandardCharsets.UTF_8));
                return "ok";
            } catch (Exception e) {
                return "error";
            }
        }

        @JavascriptInterface
        public String loadData(String key) {
            try (InputStream in = openFileInput(safe(key) + ".json")) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[65536];
                int r;
                while ((r = in.read(buf)) != -1) out.write(buf, 0, r);
                return new String(out.toByteArray(), StandardCharsets.UTF_8);
            } catch (Exception e) {
                return "";
            }
        }

        private String safe(String key) { return key.replaceAll("[^A-Za-z0-9._-]", "_"); }

        @JavascriptInterface
        public void fetch(final String id, final String url) {
            pool.execute(() -> {
                String js;
                try {
                    String text = download(url);
                    js = "window.__mlNative&&window.__mlNative(" + JSONObject.quote(id) + ",true," + JSONObject.quote(text) + ")";
                } catch (Exception e) {
                    js = "window.__mlNative&&window.__mlNative(" + JSONObject.quote(id) + ",false," + JSONObject.quote(String.valueOf(e.getMessage())) + ")";
                }
                final String script = js;
                runOnUiThread(() -> { if (web != null) web.evaluateJavascript(script, null); });
            });
        }
    }

    private String download(String address) throws IOException {
        if (address == null || !address.startsWith(ALLOWED_PREFIX)) throw new IOException("Adresse non autorisée");
        HttpURLConnection c = (HttpURLConnection) new URL(address).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setInstanceFollowRedirects(true);
        c.setRequestProperty("User-Agent", "Matchlab/1.0 (Android)");
        try {
            int code = c.getResponseCode();
            if (code != 200) throw new IOException("HTTP " + code);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            try (InputStream in = c.getInputStream()) {
                byte[] buf = new byte[16384];
                int r;
                while ((r = in.read(buf)) != -1) out.write(buf, 0, r);
            }
            return decode(out.toByteArray());
        } finally {
            c.disconnect();
        }
    }

    /** UTF-8 si valide, sinon Windows-1252 (certains fichiers anciens). */
    private static String decode(byte[] b) {
        try {
            return StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(b)).toString();
        } catch (CharacterCodingException e) {
            return new String(b, Charset.forName("windows-1252"));
        }
    }
}
